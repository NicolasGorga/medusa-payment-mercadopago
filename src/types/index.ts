import { AutoRecurringResponse } from "mercadopago/dist/clients/preApproval/commonTypes";
import { z } from "@medusajs/framework/zod";

export interface MercadopagoOptions {
  /**
   * Private key for your Mercado Pago application, for use in the backend to generate Payments
   */
  accessToken: string;
  /**
   * Webhook secret included in webhook notifications from Mercado Pago, useful to verify
   * their authenticity
   */
  webhookSecret: string;
}

export type MercadopagoWebhookPayload = {
  action: string;
  /**
   * Notification topic. One-off payments send "payment"; subscriptions send
   * "subscription_preapproval" and "subscription_authorized_payment"
   */
  type?: string;
  data: {
    id: string;
  };
};

/**
 * Shape of the `data` the storefront passes to Medusa's standard
 * `POST /store/payment-collections/:id/payment-sessions` when (re)initiating a
 * session for the subscription provider.
 */
export const MercadopagoSubscriptionInitiateData = z.object({
  /** Card token from the Payment Brick / CardForm. Omit to create an empty session (method selection). */
  card_token_id: z.string().min(1).optional(),
  /** Falls back to the authenticated customer's email. In test mode it must be the buyer test user's email. */
  payer_email: z.email().optional(),
  /** Shown to the buyer in Mercado Pago as the subscription description */
  reason: z.string().optional(),
  back_url: z.url().optional(),
  auto_recurring: z
    .object({
      frequency: z.number().int().min(1),
      frequency_type: z.enum(["days", "months"]),
      start_date: z.iso.datetime().optional(),
      end_date: z.iso.datetime().optional(),
      /**
       * Nullish is accepted because Mercado Pago returns `free_trial: null` on
       * the preapproval, and Medusa replays stored session data back into
       * `initiatePayment` when it compensates a deleted session.
       */
      free_trial: z
        .object({
          frequency: z.number().int().min(1),
          frequency_type: z.enum(["days", "months"]),
        })
        .nullish(),
    })
    .optional(),
});
export type MercadopagoSubscriptionInitiateDataType = z.infer<
  typeof MercadopagoSubscriptionInitiateData
>;

/**
 * Shape stored in the Medusa payment session `data` for the subscription provider
 * after the preapproval is created
 */
export type MercadopagoSubscriptionSessionData = {
  session_id?: string;
  amount?: number;
  preapproval_id?: string;
  preapproval_status?: string;
  init_point?: string;
  next_payment_date?: string;
  payer_id?: number;
  payment_method_id?: string | null;
  reason?: string;
  auto_recurring?: AutoRecurringResponse;
};

/**
 * Events emitted on Medusa's event bus by the subscription provider while it
 * handles Mercado Pago webhooks. Subscribe to these from your own subscription
 * engine — the plugin is intentionally not coupled to any.
 *
 * Delivery is at-least-once: Mercado Pago re-sends webhooks and Medusa's
 * webhook subscriber retries, so consumers should deduplicate (e.g. key on
 * invoice_id + status)
 */
export const MercadopagoSubscriptionEvents = {
  /** A subscription (preapproval) was created or changed status */
  SUBSCRIPTION_UPDATED: "mercadopago.subscription.updated",
  /** A recurring charge (authorized payment / invoice) was created or updated */
  CHARGE_UPDATED: "mercadopago.subscription.charge.updated",
} as const;

export type SubscriptionUpdatedEventPayload = {
  preapproval_id: string | null;
  /** Medusa payment session id used at checkout (MP external_reference) */
  session_id: string | null;
  status: string | null;
  next_payment_date: string | null;
  payer_id: number | null;
  transaction_amount: number | null;
  currency_id: string | null;
};

export type SubscriptionChargeEventPayload = {
  preapproval_id: string | null;
  /** Medusa payment session id used at checkout (MP external_reference) */
  session_id: string | null;
  invoice_id: string | null;
  /** Invoice status (scheduled | processed | recycling) */
  status: string | null;
  /** The underlying MP payment for this cycle — its id can be refunded via the exported workflow */
  payment: { id: string; status: string; status_detail: string } | null;
  transaction_amount: number | null;
  currency_id: string | null;
  debit_date: string | null;
  retry_attempt: number | null;
};

export type MercadopagoError = {
  error: string;
  message: string;
  status: string;
  cause:
    | {
        code: string;
        description: string;
      }[]
    | undefined;
};
