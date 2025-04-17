import {
  AbstractPaymentProvider,
  isString,
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
  CapturePaymentInput,
  CapturePaymentOutput,
  CreateAccountHolderInput,
  CreateAccountHolderOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ListPaymentMethodsInput,
  ListPaymentMethodsOutput,
  PaymentCustomerDTO,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  SavePaymentMethodInput,
  SavePaymentMethodOutput,
  UpdateAccountHolderInput,
  UpdateAccountHolderOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/types";
import MercadoPagoConfig, { Customer, CustomerCard, Payment, PaymentRefund } from "mercadopago";
import { PaymentCreateRequest } from "mercadopago/dist/clients/payment/create/types";
import { PaymentSearchResult } from "mercadopago/dist/clients/payment/search/types";
import { MercadopagoOptions, MercadopagoWebhookPayload } from "../../types";
import { createHmac } from "crypto";
import { Logger } from "@medusajs/medusa";
import { CustomerRequestBody } from "mercadopago/dist/clients/customer/commonTypes";
import { CustomerUpdateData } from "mercadopago/dist/clients/customer/update/types";
import { PostStoreMercadopagoPaymentType } from "../../api/store/mercadopago/payment/validators";

type InjectedDependencies = {
  logger: Logger;
};

class MercadopagoProviderService extends AbstractPaymentProvider<MercadopagoOptions> {
  static identifier = "mercadopago";
  protected options_: MercadopagoOptions;
  protected client_: MercadoPagoConfig;
  protected logger_: Logger;

  constructor(container: InjectedDependencies, options: MercadopagoOptions) {
    super(container, options);

    this.options_ = options;
    this.client_ = new MercadoPagoConfig({
      accessToken: options.accessToken,
    });
    this.logger_ = container.logger;
  }

  static validateOptions(options: Record<any, any>): void | never {
    if (!options.accessToken || !isString(options.accessToken)) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "Mercado pago 'accessToken' needs to be a non empty string"
      );
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    return {
      id: "",
      data: {
        session_id: input.data?.session_id,
        amount: input.amount,
      },
    };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    const paymentId = input.data?.id;
    if (paymentId) {
      const payment = new Payment(this.client_);
      await payment.cancel({ id: paymentId as string });
    }
    return {};
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const paymentSessionId = input.data?.session_id as string | undefined;
    let data: PaymentSearchResult = input.data ?? {};

    if (!paymentSessionId) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "No payment session id found in data"
      );
    }

    const payment = new Payment(this.client_);
    const results =
      (
        await payment.search({
          options: { external_reference: paymentSessionId },
        })
      )?.results ?? [];
    if (!results.length) {
      this.logger_.warn(
        `No payment found in Mercado Pago for payment session: ${paymentSessionId}\n This could be caused by lag in Mercado Pago's system and doesn't mean the payment was not created`
      );
    }
    data = results[0] ?? data;

    // Returning PaymentSessionStatus.CAPTURED for auto capture, since for UY card method they are captured automatically
    // TODO: Should make it conditionally in cases where a method could be not auto captured (maybe cash or another country)
    return {
      data: data,
      status: PaymentSessionStatus.CAPTURED,
    };
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    // For now, we assume auto capture, so no need to do anything else with Mercado Pago
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const paymentId = input.data?.id;
    if (!paymentId || !isString(paymentId)) {
      return { data: input.data ?? {} };
    }
    const payment = new Payment(this.client_);
    const paymentData = await payment.cancel({ id: paymentId });
    return { data: paymentData as unknown as Record<string, unknown> };
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const paymentId = input.data?.id;
    const payment = new Payment(this.client_);
    const paymentData = await payment.get({ id: paymentId as string });
    const status = paymentData.status;

    switch (status) {
      case "authorized":
        return { status: "authorized" };
      case "approved":
      case "in_mediation":
        return { status: "captured" };

      case "cancelled":
      case "refunded":
        return { status: "canceled" };
      default:
        return { status: "pending" };
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const paymentId = this.getIdOrThrow(input.data);
    const payment = new Payment(this.client_);
    const paymentData = await payment.get({ id: paymentId });

    const refundAmount = input.amount;
    const isPartial =
      (paymentData.transaction_amount ?? input.amount) > input.amount;
    const refund = new PaymentRefund(this.client_);
    const refundData = await refund.create({
      payment_id: paymentId,
      body: {
        amount: isPartial ? Number(refundAmount) : undefined,
      },
    });
    return { data: refundData as unknown as Record<string, unknown> };
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const paymentId = this.getIdOrThrow(input.data);
    const payment = new Payment(this.client_);
    const paymentData = await payment.get({ id: paymentId });
    return { data: paymentData as unknown as Record<string, unknown> };
  }

  updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // TODO: Until working with preferences, we won't have a need for this method. After including preferences, it should update preference items and total amount
    // when items are added / removed from cart
    return Promise.resolve({ data: input.data });
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    this.validateWebhookSignature(payload);
    const mercadopagoData = payload.data as MercadopagoWebhookPayload;
    const eventType = mercadopagoData.action;

    try {
      switch (eventType) {
        case "payment.created":
        case "payment.updated":
          const payment = new Payment(this.client_);
          const paymentData = await payment.get({
            id: mercadopagoData.data.id as string,
          });
          const paymentSessionId = paymentData.external_reference;

          if (!paymentSessionId) {
            throw new Error(
              "No external_reference found in mercadopago payload, unable to match against Medusa payment session"
            );
          }

          if (["authorized", "approved"].includes(paymentData.status ?? "")) {
            return {
              action:
                paymentData.status === "approved"
                  ? PaymentActions.SUCCESSFUL
                  : PaymentActions.AUTHORIZED,
              data: {
                session_id: paymentSessionId,
                amount: paymentData.transaction_amount!,
              },
            };
          }
        default:
          return { action: "not_supported" };
      }
    } catch (error) {
      return { action: "failed" };
    }
  }

  async createAccountHolder?({
    context
  }: CreateAccountHolderInput
  ): Promise<CreateAccountHolderOutput> {
    const { account_holder, customer, idempotency_key } = context

    const id = account_holder?.data.id as string | undefined

    if (id) {
      return { id }
    }

    if (!customer) {
      throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "No customer provided while creating account holder")
    }

    try {
      const customerClient = new Customer(this.client_);
      const body: CustomerRequestBody = {
        email: customer.email,
        first_name: customer.first_name || undefined,
        last_name: customer.last_name || undefined,
        date_registered: new Date().toISOString(),
      };

      const createdCustomer = await customerClient.create({
        body: body,
        requestOptions: {
          idempotencyKey: idempotency_key,
        },
      });

      return {
        id: createdCustomer.id!,
        data: createdCustomer as unknown as Record<string, unknown>
      }
    } catch (error) {
      throw new MedusaError(MedusaErrorTypes.UNEXPECTED_STATE, "An error occurred while trying to create a Mercado Pago customer")
    }
  }

  async updateAccountHolder({
    context,
  }: UpdateAccountHolderInput): Promise<UpdateAccountHolderOutput> {
    const { account_holder, customer, idempotency_key } = context

    const accountHolderId = account_holder.data?.id as string | undefined

    if (!accountHolderId) {
      throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "No account holder provided while updating account holder")
    }

    // No customer, nothing to upodate with third party
    if (!customer) {
      return {}
    }

    try {
      const customerClient = new Customer(this.client_);
      const body: CustomerRequestBody = {
        first_name: customer.first_name ?? undefined,
        last_name: customer.last_name ?? undefined,
        phone: { number: customer.phone ?? undefined },
        identification: account_holder.data.identification ?? undefined,
      }
      if (!account_holder.data.email) {
        body.email = customer.email
      }

      const payload: CustomerUpdateData = {
        customerId: accountHolderId,
        body: body,
        requestOptions: {
          idempotencyKey: idempotency_key,
        }
      } 

      const updatedCustomer = await customerClient.update(payload);

      return {
        data: updatedCustomer as unknown as Record<string, unknown>,
      }
    } catch (e) {
      throw new MedusaError(MedusaErrorTypes.UNEXPECTED_STATE, "An error occurred in updateAccountHolder when updating a Stripe customer")
    }
  }

  async savePaymentMethod({
    context,
    data,
  }: SavePaymentMethodInput): Promise<SavePaymentMethodOutput> {
    const accountHolderId = context?.account_holder?.data?.id as
      | string
      | undefined

    if (!accountHolderId) {
      throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Account holder not set while saving a payment method")
    }

    const paymentMethodData = data as PaymentCreateRequest

    const card = new CustomerCard(this.client_)

    // I opened a support ticket with Mercado Pago, as this call randomly fails or succeeds
    // for now, the step that calls this method has a try / catch, to allow the Payment to cotinue even if this fails
    const created = await card.create({
      customerId: accountHolderId,
      body: { 
        token: paymentMethodData.token, 
      },
      requestOptions: {
        idempotencyKey: context?.idempotency_key
      }
    })

    return { id: created.id!, data: created as unknown as Record<string, unknown> }
  }

  async listPaymentMethods({
    context,
  }: ListPaymentMethodsInput): Promise<ListPaymentMethodsOutput> {
    const accountHolderId = context?.account_holder?.data?.id as
      | string
      | undefined
    if (!accountHolderId) {
      return []
    }

    const cardClient = new CustomerCard(this.client_)

    const paymentMethods = await cardClient.list({
      customerId: accountHolderId
    })

    return paymentMethods.map((method) => ({
      id: method.id!,
      data: method as unknown as Record<string, unknown>,
    }))
  }

  async createPayment({
    paymentSessionId,
    payload,
  }: {
    paymentSessionId: string;
    payload: PostStoreMercadopagoPaymentType['paymentData'];
  }) {
    const payment = new Payment(this.client_);
    return payment.create({
      body: {
        ...payload,
        external_reference: paymentSessionId,
      },
    });
  }

  protected validateWebhookSignature(data: ProviderWebhookPayload["payload"]) {
    const secret = this.options_.webhookSecret;
    // If no webhookSecret is set, the assumption is this protection is not required
    if (!secret) {
      return;
    }

    const headers = data.headers;

    const xSignature = (headers["x-signature"] ?? "noop") as string;
    const xRequestId = (headers["x-request-id"] ?? "noop") as string;
    const body = data?.data as MercadopagoWebhookPayload;
    const dataId = (body.data?.id ?? "noop") as string;

    const parts = xSignature.split(",");
    let timestamp: string | undefined;
    let hash: string | undefined;

    parts.forEach((part) => {
      const [key, val] = part.split("=");
      if (key && val) {
        const [trimmedKey, trimmedVal] = [key.trim(), val.trim()];
        if (trimmedKey === "ts") {
          timestamp = trimmedVal;
        } else if (trimmedKey === "v1") {
          hash = trimmedVal;
        }
      }
    });
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
    const hmac = createHmac("sha256", secret);
    hmac.update(manifest);
    const sha = hmac.digest("hex");
    if (sha !== hash) {
      this.logger_
        .warn(`Unable to verify Mercado Pago authenticity of request with headers:\n
                ${headers}
            `);
      throw new MedusaError(MedusaErrorTypes.INVALID_DATA, "Invalid signature");
    }
  }

  getIdOrThrow(data?: Record<string, unknown>) {
    const id = data?.id;
    if (!id || !isString(id)) {
      throw new MedusaError(
        MedusaErrorTypes.INVALID_DATA,
        "No valid string stored against 'id' key of data object"
      );
    }
    return id as string;
  }
}

export default MercadopagoProviderService;
