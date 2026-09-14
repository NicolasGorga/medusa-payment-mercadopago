import {
  BigNumber,
  MedusaError,
  MedusaErrorTypes,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CreateAccountHolderInput,
  CreateAccountHolderOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  IEventBusModuleService,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import { Logger } from "@medusajs/medusa";
import { Invoice, PreApproval } from "mercadopago";
import { PreApprovalResponse } from "mercadopago/dist/clients/preApproval/commonTypes";
import { InvoiceResponse } from "mercadopago/dist/clients/invoice/commonTypes";
import MercadopagoBase from "../core/mercadopago-base";
import {
  buildSubscriptionChargeEventPayload,
  buildSubscriptionSessionData,
  buildSubscriptionUpdatedEventPayload,
  mapPreapprovalStatus,
} from "../core/utils";
import {
  MercadopagoError,
  MercadopagoOptions,
  MercadopagoSubscriptionEvents,
  MercadopagoSubscriptionInitiateData,
  MercadopagoWebhookPayload,
} from "../../types";

type InjectedDependencies = {
  logger: Logger;
  event_bus: IEventBusModuleService;
};

class MercadopagoSubscriptionProviderService extends MercadopagoBase {
  static identifier = "mercadopago-subscription";

  protected eventBusService_: IEventBusModuleService;

  constructor(container: InjectedDependencies, options: MercadopagoOptions) {
    super(container, options);
    this.eventBusService_ = container.event_bus;
  }

  async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentOutput> {
    const sessionId = input.data?.session_id as string | undefined;
    const parsed = MercadopagoSubscriptionInitiateData.safeParse(
      input.data ?? {},
    );
    if (!parsed.success) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        `Invalid subscription data: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }
    const { data } = parsed;

    // Method selected but card not tokenized yet — empty session, like the card flow
    if (!data.card_token_id) {
      return {
        id: "",
        data: { session_id: sessionId, amount: input.amount },
      };
    }

    if (!data.auto_recurring) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "auto_recurring is required to create a subscription",
      );
    }

    const payerEmail = data.payer_email ?? input.context?.customer?.email;
    if (!payerEmail) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "A payer_email is required to create a subscription, either in the session data or from the authenticated customer",
      );
    }

    const preapproval = await this.createPreapproval({
      card_token_id: data.card_token_id,
      payer_email: payerEmail,
      reason: data.reason,
      back_url: data.back_url,
      external_reference: sessionId,
      status: "authorized",
      auto_recurring: {
        ...data.auto_recurring,
        transaction_amount: new BigNumber(input.amount).numeric,
        currency_id: input.currency_code.toUpperCase(),
      },
    });

    return {
      id: preapproval.id!,
      data: {
        ...buildSubscriptionSessionData(preapproval, {
          session_id: sessionId,
          amount: input.amount,
        }),
        // The module merges client data into the stored session data — scrub
        // the single-use card token so it is never persisted
        card_token_id: undefined,
      },
    };
  }

  protected async createPreapproval(
    body: Parameters<PreApproval["create"]>[0]["body"],
  ): Promise<PreApprovalResponse> {
    const preapprovalClient = new PreApproval(this.client_);
    try {
      return await preapprovalClient.create({ body });
    } catch (e) {
      const error = e as MercadopagoError;
      this.logger_.error(
        `Mercado Pago preapproval creation failed for session ${body.external_reference}: ${JSON.stringify(error)}`,
      );
      throw new MedusaError(
        MedusaErrorTypes.PAYMENT_AUTHORIZATION_ERROR,
        this.sanitizeSubscriptionErrorMessage(error),
      );
    }
  }

  async cancelSubscription(preapprovalId: string): Promise<void> {
    const preapprovalClient = new PreApproval(this.client_);
    await preapprovalClient.update({
      id: preapprovalId,
      body: { status: "cancelled" },
    });
  }

  async authorizePayment(
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentOutput> {
    return await this.getPaymentStatus(input);
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput,
  ): Promise<GetPaymentStatusOutput> {
    const preapproval = await this.retrievePreapproval(input.data);

    if (!preapproval) {
      // Buyer selected the method but the preapproval was never created
      return { status: PaymentSessionStatus.PENDING, data: input.data };
    }

    return {
      status: mapPreapprovalStatus(preapproval.status),
      data: buildSubscriptionSessionData(preapproval, input.data),
    };
  }

  // Canceling the Medusa payment cancels the WHOLE subscription at Mercado Pago
  async cancelPayment({
    data,
  }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const preapprovalId = data?.preapproval_id as string | undefined;
    if (!preapprovalId) {
      return { data };
    }

    await this.cancelSubscription(preapprovalId);
    return { data: { ...data, preapproval_status: "cancelled" } };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return this.cancelPayment(input);
  }

  /**
   * Medusa's refund only carries an amount, so this targets the most recent
   * charged cycle. Older cycles are regular MP payments — refund them from the
   * Mercado Pago dashboard or API using the payment id from the charge events.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const preapprovalId = input.data?.preapproval_id as string | undefined;
    if (!preapprovalId) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "No preapproval_id found in payment data, unable to refund",
      );
    }

    const latestPaymentId = await this.getLatestChargePaymentId(preapprovalId);
    if (!latestPaymentId) {
      throw new MedusaError(
        MedusaErrorTypes.NOT_ALLOWED,
        "No charged payment found yet for this subscription, nothing to refund",
      );
    }

    const refundResult = await super.refundPayment({
      ...input,
      data: { id: latestPaymentId },
    });
    // Keep the subscription session data intact — only report the refund result alongside it
    return { data: { ...input.data, last_refund: refundResult.data } };
  }

  async retrievePayment(
    input: RetrievePaymentInput,
  ): Promise<RetrievePaymentOutput> {
    const preapproval = await this.retrievePreapproval(input.data);
    if (!preapproval) {
      return { data: input.data };
    }
    return { data: preapproval as unknown as Record<string, unknown> };
  }

  /**
   * Handles ALL Mercado Pago webhook topics so a single webhook URL
   * (Medusa's /hooks/payment/mercadopago-subscription_<id>) serves both
   * providers: subscription topics are mapped here (and re-emitted on the
   * event bus for subscription-engine consumers); the "payment" topic is
   * delegated to the base card implementation.
   *
   * Errors propagate — Medusa's webhook subscriber retries the event.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    const mercadopagoData = payload.data as MercadopagoWebhookPayload;

    switch (mercadopagoData.type) {
      case "subscription_preapproval": {
        this.validateWebhookSignature(payload);
        const preapprovalClient = new PreApproval(this.client_);
        const preapproval = await preapprovalClient.get({
          id: mercadopagoData.data.id,
        });
        await this.eventBusService_.emit({
          name: MercadopagoSubscriptionEvents.SUBSCRIPTION_UPDATED,
          data: buildSubscriptionUpdatedEventPayload(preapproval),
        });
        return this.mapPreapprovalWebhook(preapproval);
      }
      case "subscription_authorized_payment": {
        this.validateWebhookSignature(payload);
        const invoiceClient = new Invoice(this.client_);
        const invoice = await invoiceClient.get({
          id: mercadopagoData.data.id,
        });
        await this.eventBusService_.emit({
          name: MercadopagoSubscriptionEvents.CHARGE_UPDATED,
          data: buildSubscriptionChargeEventPayload(invoice),
        });
        return await this.mapChargeWebhook(invoice);
      }
      default:
        return super.getWebhookActionAndData(payload);
    }
  }

  async createAccountHolder(
    input: CreateAccountHolderInput,
  ): Promise<CreateAccountHolderOutput> {
    // TODO: This has been causing issues with the MP sansbox environment. Revisit.
    return { id: input.context.customer.id };
  }

  protected mapPreapprovalWebhook(
    preapproval: PreApprovalResponse,
  ): WebhookActionResult {
    const sessionId = preapproval.external_reference;
    if (!sessionId) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const data = {
      session_id: sessionId,
      amount: preapproval.auto_recurring?.transaction_amount ?? 0,
    };

    switch (preapproval.status) {
      case "authorized":
        return { action: PaymentActions.AUTHORIZED, data };
      case "cancelled":
        return { action: PaymentActions.CANCELED, data };
      default:
        return { action: PaymentActions.NOT_SUPPORTED };
    }
  }

  /**
   * Only the FIRST approved charge maps to a Medusa payment action (it captures
   * the checkout payment). Later cycles have no Medusa payment session — they
   * are surfaced through the emitted charge events instead.
   */
  protected async mapChargeWebhook(
    invoice: InvoiceResponse,
  ): Promise<WebhookActionResult> {
    const sessionId = invoice.external_reference;
    if (
      !sessionId ||
      !invoice.preapproval_id ||
      invoice.payment?.status !== "approved"
    ) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    // First charge <=> the preapproval has at most one charge on record.
    // (A re-delivered first-charge webhook after cycle 2 lands as
    // not_supported, which is correct — the payment is captured by then.)
    const preapprovalClient = new PreApproval(this.client_);
    const preapproval = await preapprovalClient.get({
      id: invoice.preapproval_id,
    });
    if ((preapproval.summarized?.charged_quantity ?? 0) > 1) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    return {
      action: PaymentActions.SUCCESSFUL,
      data: {
        session_id: sessionId,
        amount: invoice.transaction_amount ?? 0,
      },
    };
  }

  protected async getLatestChargePaymentId(
    preapprovalId: string,
  ): Promise<string | undefined> {
    const invoiceClient = new Invoice(this.client_);
    // ponytail: single search page (~30 results) — for subscriptions with more
    // cycles than that, paginate by offset until the newest charged invoice is found
    const { results = [] } = await invoiceClient.search({
      options: { preapproval_id: preapprovalId },
    });

    const latestCharged = results
      .filter((invoice) => !!invoice.payment?.id)
      .sort((a, b) =>
        (b.date_created ?? "").localeCompare(a.date_created ?? ""),
      )[0];
    return latestCharged?.payment?.id;
  }

  protected async retrievePreapproval(
    data?: Record<string, unknown>,
  ): Promise<PreApprovalResponse | undefined> {
    const preapprovalClient = new PreApproval(this.client_);
    const preapprovalId = data?.preapproval_id as string | undefined;

    if (preapprovalId) {
      return await preapprovalClient.get({ id: preapprovalId });
    }

    // Fallback: the session data was cleared or never updated — find the
    // preapproval by external_reference
    const sessionId = data?.session_id as string | undefined;
    if (!sessionId) {
      return undefined;
    }

    const { results = [] } = await preapprovalClient.search({
      options: { external_reference: sessionId },
    });
    const match = results[0];
    if (!match?.id) {
      return undefined;
    }
    return await preapprovalClient.get({ id: match.id });
  }

  protected sanitizeSubscriptionErrorMessage(error: MercadopagoError): string {
    this.logger_.error(JSON.stringify(error));
    const cause = error.cause?.[0]?.description ?? error.message ?? "";

    if (/card.?token/i.test(cause)) {
      return "No pudimos validar tu tarjeta, intenta nuevamente.";
    }
    if (/payer.?email|payer_email/i.test(cause)) {
      return "El email del pagador no es válido para esta suscripción.";
    }
    return "No hemos podido crear la suscripción, intenta nuevamente o prueba otra tarjeta.";
  }
}

export default MercadopagoSubscriptionProviderService;
