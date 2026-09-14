import { PaymentSessionStatus } from "@medusajs/framework/utils";
import { PreApprovalResponse } from "mercadopago/dist/clients/preApproval/commonTypes";
import { InvoiceResponse } from "mercadopago/dist/clients/invoice/commonTypes";
import {
  MercadopagoSubscriptionSessionData,
  SubscriptionChargeEventPayload,
  SubscriptionUpdatedEventPayload,
} from "../../types";

/**
 * Maps a Mercado Pago preapproval status to a Medusa payment session status.
 * "paused" maps to authorized: the mandate still exists, the pause is surfaced
 * to consumers via the subscription events instead.
 */
export function mapPreapprovalStatus(status?: string): PaymentSessionStatus {
  switch (status) {
    case "authorized":
    case "paused":
      return PaymentSessionStatus.AUTHORIZED;
    case "cancelled":
      return PaymentSessionStatus.CANCELED;
    case "pending":
    default:
      return PaymentSessionStatus.PENDING;
  }
}

export function buildSubscriptionSessionData(
  preapproval: PreApprovalResponse,
  existing?: Record<string, unknown>,
): MercadopagoSubscriptionSessionData & Record<string, unknown> {
  return {
    ...existing,
    preapproval_id: preapproval.id,
    preapproval_status: preapproval.status,
    init_point: preapproval.init_point,
    next_payment_date: preapproval.next_payment_date,
    payer_id: preapproval.payer_id,
    payment_method_id: preapproval.payment_method_id,
    reason: preapproval.reason,
    auto_recurring: stripNullishFreeTrial(preapproval.auto_recurring),
  };
}

/**
 * Mercado Pago reports `free_trial: null` when a subscription has no trial.
 * Keeping that null in the session data makes the stored data fail validation
 * if Medusa ever re-initiates the session with it.
 */
function stripNullishFreeTrial(
  autoRecurring: PreApprovalResponse["auto_recurring"],
) {
  if (!autoRecurring || autoRecurring.free_trial != null) {
    return autoRecurring;
  }

  const { free_trial: _freeTrial, ...rest } = autoRecurring;

  return rest;
}

export function buildSubscriptionUpdatedEventPayload(
  preapproval: PreApprovalResponse,
): SubscriptionUpdatedEventPayload {
  return {
    preapproval_id: preapproval.id ?? null,
    session_id: preapproval.external_reference ?? null,
    status: preapproval.status ?? null,
    next_payment_date: preapproval.next_payment_date ?? null,
    payer_id: preapproval.payer_id ?? null,
    transaction_amount: preapproval.auto_recurring?.transaction_amount ?? null,
    currency_id: preapproval.auto_recurring?.currency_id ?? null,
  };
}

export function buildSubscriptionChargeEventPayload(
  invoice: InvoiceResponse,
): SubscriptionChargeEventPayload {
  return {
    preapproval_id: invoice.preapproval_id ?? null,
    session_id: invoice.external_reference ?? null,
    invoice_id: invoice.id ?? null,
    status: invoice.status ?? null,
    payment: invoice.payment ?? null,
    transaction_amount: invoice.transaction_amount ?? null,
    currency_id: invoice.currency_id ?? null,
    debit_date: invoice.debit_date ?? null,
    retry_attempt: invoice.retry_attempt ?? null,
  };
}
