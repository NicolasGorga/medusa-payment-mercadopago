import {
  AbstractPaymentProcessor,
  PaymentProcessorContext,
  PaymentProcessorError,
  PaymentProcessorSessionResponse,
  PaymentSessionStatus,
  Logger, // Added Logger
} from "@medusajs/medusa";
import { Redsys } from "redsys-easy";

interface RedsysOptions {
  kc: string; // Merchant code
  secretKey: string; // Secret encryption key
  terminal: string; // Terminal number
  environment: "live" | "test";
  currency: string; // Default currency (e.g., "EUR")
  merchantUrl: string; // URL for notifications
  returnUrl: string; // URL to redirect after payment
  paymentMethods?: Record<string, string>; // Optional: Specific payment methods for Redsys
}

class RedsysProviderService extends AbstractPaymentProcessor {
  static identifier = "redsys";

  static validateOptions(options: Record<string, unknown>): void | never {
    if (!options.kc) {
      throw new PaymentProcessorError("Redsys option 'kc' (Merchant Code) is required.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    if (typeof options.kc !== 'string') {
      throw new PaymentProcessorError("Redsys option 'kc' must be a string.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    if (!options.secretKey) {
      throw new PaymentProcessorError("Redsys option 'secretKey' is required.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    if (typeof options.secretKey !== 'string') {
      throw new PaymentProcessorError("Redsys option 'secretKey' must be a string.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    if (!options.terminal) {
      throw new PaymentProcessorError("Redsys option 'terminal' is required.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    if (typeof options.terminal !== 'string') {
      throw new PaymentProcessorError("Redsys option 'terminal' must be a string.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    if (!options.environment) {
      throw new PaymentProcessorError("Redsys option 'environment' ('test' or 'live') is required.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    if (options.environment !== 'test' && options.environment !== 'live') {
      throw new PaymentProcessorError("Redsys option 'environment' must be either 'test' or 'live'.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    // Optional fields validation (type checks if present)
    if (options.currency && typeof options.currency !== 'string') {
      throw new PaymentProcessorError("Redsys option 'currency' must be a string if provided.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
    if (options.merchantUrl && typeof options.merchantUrl !== 'string') {
      throw new PaymentProcessorError("Redsys option 'merchantUrl' must be a string if provided.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
     if (options.returnUrl && typeof options.returnUrl !== 'string') {
      throw new PaymentProcessorError("Redsys option 'returnUrl' must be a string if provided.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT);
    }
  }

  protected readonly options_: RedsysOptions;
  protected readonly redsys_: Redsys;
  protected readonly logger_: Logger; // Added logger property

  constructor({ logger }, options: RedsysOptions) { // Injected logger, options typed
    super({ logger }, options);
    RedsysProviderService.validateOptions(options); // Validate options in constructor
    this.options_ = options;
    this.logger_ = logger; // Assign logger

    this.redsys_ = new Redsys({
      kc: this.options_.kc,
      secretKey: this.options_.secretKey,
      terminal: this.options_.terminal,
      environment: this.options_.environment,
      currency: this.options_.currency,
      merchantUrl: this.options_.merchantUrl,
      returnUrl: this.options_.returnUrl,
      paymentMethods: this.options_.paymentMethods,
    });
  }

  async getPaymentStatus(
    paymentSessionData: Record<string, unknown>
  ): Promise<PaymentSessionStatus> {
    // paymentSessionData might contain decoded merchant parameters from webhook or redirect
    const dsResponse = paymentSessionData.Ds_Response as string | undefined;
    const dsOrder = paymentSessionData.Ds_Order as string | undefined;

    if (dsResponse) {
      const responseCode = parseInt(dsResponse, 10);
      if (responseCode >= 0 && responseCode <= 99) {
        // Typically means authorized, and often captured in Redsys's default "implicit confirmation"
        return PaymentSessionStatus.AUTHORIZED;
      } else if (responseCode === 900 || responseCode === 400) { // 900: Devolución, 400: Anulada
        return PaymentSessionStatus.CANCELED; // Or a more specific status if Medusa supports it for refunds
      } else if (responseCode >= 100) { // Errors or rejected
        return PaymentSessionStatus.ERROR;
      }
    }

    // If no Ds_Response, or it's not yet set, treat as pending.
    // For a more robust check, consider calling retrievePayment if dsOrder is available.
    if (dsOrder && !dsResponse) {
        this.logger_?.warn(`Redsys getPaymentStatus for order ${dsOrder}: Ds_Response not found, consider retrievePayment. Defaulting to PENDING.`);
    } else if (!dsOrder && !dsResponse) {
        this.logger_?.info(`Redsys getPaymentStatus: No Ds_Order or Ds_Response in session data. Status is PENDING.`);
    }
    return PaymentSessionStatus.PENDING;
  }

  async initiatePayment(
    context: PaymentProcessorContext
  ): Promise<PaymentProcessorSessionResponse> {
    const { amount, currency_code, resource_id, customer } = context;

    const orderId = resource_id; // Or generate a unique order ID

    try {
      const paymentParameters = this.redsys_.createPaymentParameters({
        // Redsys expects amount in cents
        amount: Math.round(amount), // Ensure it's an integer
        order: orderId,
        merchantName: "My Medusa Store", // Replace with actual store name or config
        productDescription: `Payment for order ${orderId}`,
        holder: customer?.email || "N/A", // Or other customer identification
        // currency: currency_code, // Redsys instance is already configured with currency
      });

      return {
        session_data: {
          ...paymentParameters,
          url: this.redsys_.getRedirectUrl(),
        },
        update_requests: {},
      };
    } catch (error) {
      this.logger_?.error("Error initiating Redsys payment:", error);
      throw new PaymentProcessorError("Failed to initiate Redsys payment", error.message);
    }
  }

  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown>
  ): Promise<{
    status: PaymentSessionStatus;
    data: Record<string, unknown>;
  }> {
    // Redsys authorizes payment upon successful completion of the redirect flow.
    // The webhook (getWebhookActionAndData) or the redirect handler in Medusa
    // should update the payment session data with the outcome.
    // This method relies on that updated information.
    try {
      const status = await this.getPaymentStatus(paymentSessionData);
      this.logger_?.info(`Redsys authorizePayment for order ${paymentSessionData.Ds_Order}, current status: ${status}, data: ${JSON.stringify(paymentSessionData)}`);

      // If Redsys indicates success (Ds_Response 0-99), it's authorized.
      // No separate API call is typically needed here for basic Redsys flow.
      return {
        status,
        data: paymentSessionData,
      };
    } catch (error) {
      this.logger_?.error(`Error in Redsys authorizePayment for order ${paymentSessionData.Ds_Order}:`, error);
      return {
        status: PaymentSessionStatus.ERROR,
        data: { ...paymentSessionData, error: error.message },
      };
    }
  }

  async capturePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{
    status: PaymentSessionStatus;
    data: Record<string, unknown>;
  }> {
    // For many Redsys configurations (e.g., "implicit confirmation"),
    // authorization implies capture. There isn't a separate capture API call.
    // If the merchant uses "explicit confirmation" (Autorización y Confirmación separada),
    // then a specific API call would be needed here. redsys-easy might need a method for this.
    // Assuming implicit confirmation for now.
    const orderId = paymentSessionData.Ds_Order as string;
    this.logger_?.info(`Redsys capturePayment attempt for order ${orderId}. Data: ${JSON.stringify(paymentSessionData)}`);

    const currentStatus = await this.getPaymentStatus(paymentSessionData);

    if (currentStatus === PaymentSessionStatus.AUTHORIZED) {
      // In implicit confirmation, AUTHORIZED means effectively captured.
      // If explicit capture is configured on Redsys and `redsys-easy` supports it,
      // an API call like `this.redsys_.confirmTransaction({ order: orderId, ... })` would be here.
      // Lacking that, we consider AUTHORIZED as sufficient for CAPTURED in the common case.
      this.logger_?.info(`Redsys capturePayment for order ${orderId}: Payment is AUTHORIZED, considering it CAPTURED.`);
      return { status: PaymentSessionStatus.CAPTURED, data: paymentSessionData };
    }

    this.logger_?.warn(`Redsys capturePayment for order ${orderId}: Payment is not in AUTHORIZED state (current: ${currentStatus}). Cannot capture.`);
    return { status: currentStatus, data: paymentSessionData };
  }

  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number,
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{
    status: PaymentSessionStatus;
    data: Record<string, unknown>;
  }> {
    const orderId = paymentSessionData.Ds_Order as string;
    const refundAmountInCents = Math.round(refundAmount);

    this.logger_?.info(`Redsys refundPayment for order ${orderId}, amount ${refundAmountInCents} cents: Operation is manual. Please perform this refund via the Redsys merchant dashboard.`);

    // Since the operation is manual, we reflect the intent to refund in Medusa.
    // The actual confirmation might need a separate process or webhook if Redsys supports it for manual actions.
    // For now, we'll optimistically set status to REFUNDED.
    // Alternatively, a custom status like `REQUIRES_MANUAL_ACTION` could be used if the system supports it.
    return {
      status: PaymentSessionStatus.REFUNDED,
      data: {
        ...paymentSessionData,
        last_refund_amount: refundAmountInCents,
        refund_status: "Manual refund initiated; confirm status via Redsys dashboard.",
      },
    };
  }

  async cancelPayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{
    status: PaymentSessionStatus;
    data: Record<string, unknown>;
  }> {
    const orderId = paymentSessionData.Ds_Order as string;
    const currentStatus = await this.getPaymentStatus(paymentSessionData);

    this.logger_?.info(`Redsys cancelPayment requested for order ${orderId}. Current status: ${currentStatus}`);

    if (currentStatus === PaymentSessionStatus.PENDING) {
      // If the payment is only PENDING in Medusa (i.e., no confirmation from Redsys yet, or user abandoned before paying),
      // it can be marked as CANCELED locally. No API call to Redsys is made as no transaction was finalized.
      this.logger_?.info(`Redsys cancelPayment for order ${orderId}: Payment is PENDING. Marking as CANCELED locally.`);
      return {
        status: PaymentSessionStatus.CANCELED,
        data: { ...paymentSessionData, cancellation_reason: "Canceled while pending in Medusa." },
      };
    } else if (currentStatus === PaymentSessionStatus.AUTHORIZED || currentStatus === PaymentSessionStatus.CAPTURED) {
      // If payment is already AUTHORIZED or CAPTURED, cancellation (void) must be done via Redsys dashboard.
      this.logger_?.warn(`Redsys cancelPayment for order ${orderId}: Payment is ${currentStatus}. Cancellation (void) must be performed via the Redsys merchant dashboard.`);
      // We don't change the status here as the API call is not made.
      // The status should reflect the actual state on Redsys.
      // To indicate an attempt, custom data can be added.
      return {
        status: currentStatus, // Keep current status
        data: {
          ...paymentSessionData,
          cancellation_status: "Manual cancellation (void) required via Redsys dashboard.",
        },
      };
    }

    // For other statuses (ERROR, CANCELED already), no action.
    this.logger_?.info(`Redsys cancelPayment for order ${orderId}: Payment is ${currentStatus}. No cancellation action taken.`);
    return { status: currentStatus, data: paymentSessionData };
  }

  async deletePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{
    status: PaymentSessionStatus;
    data: Record<string, unknown>;
  }> {
    const orderId = paymentSessionData.Ds_Order as string ?? paymentSessionData.id as string; // Try to get some identifier
    this.logger_?.info(`Redsys deletePayment called for order/id ${orderId}. Data: ${JSON.stringify(paymentSessionData)}`);

    // "Delete" in Medusa often means "cancel" if the payment isn't fully processed.
    // If it's captured, it usually can't be "deleted" but might be "refunded".
    // If it's pending, it can be "canceled".

    if (!orderId && !(paymentSessionData.id || paymentSessionData.cart_id)) { // cart_id is often the resource_id
       this.logger_?.warn("Redsys deletePayment: No order identifier (Ds_Order, id, or cart_id) found. Cannot determine status or take action.");
       // Return UNKNOWN or keep current if no way to identify the payment for an action.
       // If paymentSessionData itself has status, reflect that.
       return { status: (paymentSessionData.status as PaymentSessionStatus) || PaymentSessionStatus.UNKNOWN, data: paymentSessionData };
    }

    try {
      const status = await this.getPaymentStatus(paymentSessionData);
      this.logger_?.info(`Redsys deletePayment: Current status for ${orderId} is ${status}.`);

      if (status === PaymentSessionStatus.PENDING || status === PaymentSessionStatus.AUTHORIZED) {
        this.logger_?.info(`Redsys deletePayment: Payment for ${orderId} is ${status}. Attempting to cancel.`);
        // Attempt to cancel it. `cancelPayment` will handle API calls if possible.
        return this.cancelPayment(paymentSessionData, context);
      } else if (status === PaymentSessionStatus.CAPTURED) {
         this.logger_?.warn(`Redsys deletePayment: Payment for ${orderId} is CAPTURED. Cannot be deleted. A refund would be required. No action taken by deletePayment.`);
         // Cannot delete a captured payment. Return current status.
         return { status, data: paymentSessionData };
      } else {
        this.logger_?.info(`Redsys deletePayment: Payment for ${orderId} is ${status}. No specific delete/cancel action taken.`);
        return { status, data: paymentSessionData };
      }
    } catch (error) {
        this.logger_?.error(`Error during Redsys deletePayment for ${orderId}: ${error.message}`);
        // This could be an error from getPaymentStatus or cancelPayment.
        // We should propagate the error state.
        const dataWithError = { ...paymentSessionData, error_message: error.message };
        throw new PaymentProcessorError(
          `Failed to delete/cancel Redsys payment for ${orderId}: ${error.message}`,
          PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE,
          dataWithError
        );
    }
  }

  async retrievePayment(
    paymentSessionData: Record<string, unknown>, // Contains current session data, may include Ds_Order or other IDs
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<Record<string, unknown>> {
    // `paymentSessionData` should contain `Ds_Order` if payment was initiated or webhook processed.
    const orderId = paymentSessionData.Ds_Order as string ?? (context.cart_id as string) ?? (paymentSessionData.id as string);

    this.logger_?.warn(`Redsys retrievePayment for order ${orderId}: Real-time retrieval of payment details post-transaction is not directly supported by redsys-easy. Returning last known session data. Status should be updated via webhooks or manual checks on Redsys dashboard.`);

    // `redsys-easy` does not provide a method to fetch payment details via API after the transaction.
    // The status and details are primarily updated via webhook notifications.
    // Therefore, this method will return the data currently stored in the payment session.
    return paymentSessionData;
  }

  async updatePaymentData(
    sessionId: string, // This is Medusa's payment session ID
    data: Record<string, unknown>, // This is the new data to be merged into payment_session.data
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<Record<string, unknown>> {
    // This Medusa method is typically for updating the `payment_session.data` field in Medusa's database.
    // It's not usually intended for making calls to the payment provider to update payment instrument details
    // (like changing a card, which would be a different flow).
    // Therefore, we usually just return the data, and Medusa handles saving it.
    this.logger_?.info(`Redsys updatePaymentData called for session ${sessionId}. New data to be merged by Medusa: ${JSON.stringify(data)}`);
    try {
      // No specific Redsys action needed here. Medusa will merge `data` into the existing session data.
      // The promise should resolve with the data that Medusa expects to be the *complete* new session_data.
      // However, the core AbstractPaymentProcessor seems to expect the input `data` to be returned,
      // and Medusa merges it. If the entire updated session data is needed, one might have to fetch current
      // session data from Medusa context if passed, merge, and return. But typically, just returning `data` is fine.
      return data;
    } catch (e) {
      this.logger_?.error(`Error in Redsys updatePaymentData for session ${sessionId}: ${e.message}`);
      throw new PaymentProcessorError(
          `Error updating payment data for Redsys session ${sessionId}: ${e.message}`,
          PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE,
          e
       );
    }
  }

   async updatePayment(
      // Assuming it returns a success indicator or throws an error
      // For example, if it returns an object with a response code:
      // if (refundResponse.success) { // or check a specific response code
      // The actual refund confirmation might come via webhook later.
      return {
        status: PaymentSessionStatus.REFUNDED, // Or PENDING_REFUND if it's asynchronous
        data: { ...paymentSessionData, refund_details: refundResponse, last_refund_amount: refundAmountInCents },
      };
      // } else {
      //   const errorMessage = `Redsys refund failed for order ${orderId}. Response: ${JSON.stringify(refundResponse)}`;
      //   this.logger_?.error(errorMessage);
      //   throw new PaymentProcessorError(errorMessage, PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE);
      // }
    } catch (error) {
      this.logger_?.error(`Error during Redsys refundPayment for order ${orderId}: ${error.message}`);
      const dataWithError = {
        ...paymentSessionData,
        refund_error: error.message,
      };
      throw new PaymentProcessorError(
        `Failed to refund Redsys payment for order ${orderId}: ${error.message}`,
        PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE,
        dataWithError
      );
    }
  }

  async cancelPayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{
    status: PaymentSessionStatus;
    data: Record<string, unknown>;
  }> {
    const orderId = paymentSessionData.Ds_Order as string;

    if (!orderId) {
      this.logger_?.warn("Redsys cancelPayment: No Ds_Order found in paymentSessionData. Cannot proceed with API cancellation.");
      // If no orderId, we can't call an API.
      // If payment is PENDING locally, we can mark it CANCELED.
      const localStatus = await this.getPaymentStatus(paymentSessionData);
      if (localStatus === PaymentSessionStatus.PENDING) {
        return { status: PaymentSessionStatus.CANCELED, data: paymentSessionData };
      }
      return { status: localStatus, data: paymentSessionData };
    }

    this.logger_?.info(`Redsys cancelPayment requested for order ${orderId}.`);

    try {
      // `redsys-easy` might have a specific method for void/cancellation (anulación).
      // This is typically used if a payment was authorized but not yet captured/settled.
      // If Redsys is in "implicit confirmation" mode, AUTHORIZED usually means CAPTURED,
      // in which case a REFUND is needed, not a cancellation.
      // This call assumes `requestCancel` is for pre-settlement voids.
      const cancellationResponse = await this.redsys_.requestCancel({ // Or a method like `requestVoid`
        order: orderId,
        // currency: this.options_.currency,
        // terminal: this.options_.terminal,
        // kc: this.options_.kc,
        // Potentially Ds_TransactionType for "anulación"
      });

      this.logger_?.info(`Redsys cancel API response for order ${orderId}: ${JSON.stringify(cancellationResponse)}`);

      // Process cancellationResponse. Similar to refund, success might be indicated by absence of error
      // or specific fields in the response.
      return {
        status: PaymentSessionStatus.CANCELED,
        data: { ...paymentSessionData, cancellation_details: cancellationResponse },
      };
    } catch (error) {
      this.logger_?.error(`Error cancelling Redsys payment for order ${orderId}: ${error.message}`);
       const dataWithError = {
        ...paymentSessionData,
        cancellation_error: error.message,
      };
       throw new PaymentProcessorError(
        `Failed to cancel Redsys payment for order ${orderId}: ${error.message}`,
        PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE,
        dataWithError
      );
    }
  }

  async deletePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{
    status: PaymentSessionStatus;
    data: Record<string, unknown>;
  }> {
    const orderId = paymentSessionData.Ds_Order as string ?? paymentSessionData.id as string; // Try to get some identifier
    this.logger_?.info(`Redsys deletePayment called for order/id ${orderId}. Data: ${JSON.stringify(paymentSessionData)}`);

    // "Delete" in Medusa often means "cancel" if the payment isn't fully processed.
    // If it's captured, it usually can't be "deleted" but might be "refunded".
    // If it's pending, it can be "canceled".

    if (!orderId && !(paymentSessionData.id || paymentSessionData.cart_id)) { // cart_id is often the resource_id
       this.logger_?.warn("Redsys deletePayment: No order identifier (Ds_Order, id, or cart_id) found. Cannot determine status or take action.");
       // Return UNKNOWN or keep current if no way to identify the payment for an action.
       // If paymentSessionData itself has status, reflect that.
       return { status: (paymentSessionData.status as PaymentSessionStatus) || PaymentSessionStatus.UNKNOWN, data: paymentSessionData };
    }

    try {
      const status = await this.getPaymentStatus(paymentSessionData);
      this.logger_?.info(`Redsys deletePayment: Current status for ${orderId} is ${status}.`);

      if (status === PaymentSessionStatus.PENDING || status === PaymentSessionStatus.AUTHORIZED) {
        this.logger_?.info(`Redsys deletePayment: Payment for ${orderId} is ${status}. Attempting to cancel.`);
        // Attempt to cancel it. `cancelPayment` will handle API calls if possible.
        return this.cancelPayment(paymentSessionData, context);
      } else if (status === PaymentSessionStatus.CAPTURED) {
         this.logger_?.warn(`Redsys deletePayment: Payment for ${orderId} is CAPTURED. Cannot be deleted. A refund would be required. No action taken by deletePayment.`);
         // Cannot delete a captured payment. Return current status.
         return { status, data: paymentSessionData };
      } else {
        this.logger_?.info(`Redsys deletePayment: Payment for ${orderId} is ${status}. No specific delete/cancel action taken.`);
        return { status, data: paymentSessionData };
      }
    } catch (error) {
        this.logger_?.error(`Error during Redsys deletePayment for ${orderId}: ${error.message}`);
        // This could be an error from getPaymentStatus or cancelPayment.
        // We should propagate the error state.
        const dataWithError = { ...paymentSessionData, error_message: error.message };
        throw new PaymentProcessorError(
          `Failed to delete/cancel Redsys payment for ${orderId}: ${error.message}`,
          PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE,
          dataWithError
        );
    }
  }

  async retrievePayment(
    paymentSessionData: Record<string, unknown>, // Contains current session data, may include Ds_Order or other IDs
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<Record<string, unknown>> {
    // `paymentSessionData` should contain `Ds_Order` if payment was initiated or webhook processed.
    // Or `id` could be the Medusa payment ID, but Redsys needs its own order ID.
    const orderId = paymentSessionData.Ds_Order as string ?? (context.cart_id as string) ?? (paymentSessionData.id as string);

    if (!orderId) {
      this.logger_?.error("Redsys retrievePayment: Missing order identifier (Ds_Order, context.cart_id, or paymentSessionData.id).");
      throw new PaymentProcessorError(
        "Cannot retrieve Redsys payment without an order identifier.",
        PaymentProcessorError.PaymentProcessorErrors.INVALID_DATA
        );
    }

    this.logger_?.info(`Redsys retrievePayment requested for order ${orderId}.`);

    try {
      // `redsys-easy` should have a method to fetch transaction details by order ID.
      // This is a conceptual call, e.g., `requestPaymentDetails` or `queryTransaction`.
      const paymentDetailsFromRedsys = await this.redsys_.requestPaymentDetails({
        order: orderId,
        // currency: this.options_.currency, // May be needed or set by lib
        // terminal: this.options_.terminal, // May be needed or set by lib
        // kc: this.options_.kc,           // May be needed or set by lib
      });

      this.logger_?.info(`Redsys retrievePayment API response for order ${orderId}: ${JSON.stringify(paymentDetailsFromRedsys)}`);

      // The response from `redsys-easy` needs to be mapped to Medusa's `session_data` structure.
      // It's crucial that this data includes fields like `Ds_Response`, `Ds_Amount`, `Ds_Order`, etc.,
      // that `getPaymentStatus` and other methods rely on.
      // We merge it with existing data, with new data from Redsys taking precedence.
      // Example: if paymentDetailsFromRedsys is { Ds_Response: "0", Ds_Amount_EUR: "1000", ... }
      // Ensure that the structure returned by redsys-easy is compatible or transformed here.
      // A common issue is Redsys returning HTML for errors; redsys-easy should handle this.
      if (typeof paymentDetailsFromRedsys !== 'object' || paymentDetailsFromRedsys === null) {
        this.logger_?.error(`Redsys retrievePayment for order ${orderId}: Received non-object response: ${paymentDetailsFromRedsys}`);
        throw new PaymentProcessorError("Invalid response from Redsys provider library during retrievePayment.", PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE);
      }

      return { ...paymentSessionData, ...paymentDetailsFromRedsys };
    } catch (error) {
      this.logger_?.error(`Error retrieving Redsys payment for order ${orderId}: ${error.message}`);
      const dataWithError = { ...paymentSessionData, retrieve_error: error.message };
      throw new PaymentProcessorError(
        `Failed to retrieve Redsys payment for order ${orderId}: ${error.message}`,
        PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE,
        dataWithError
      );
    }
  }

  async updatePaymentData(
    sessionId: string, // This is Medusa's payment session ID
    data: Record<string, unknown>, // This is the new data to be merged into payment_session.data
    context: Record<string, unknown> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<Record<string, unknown>> {
    // This Medusa method is typically for updating the `payment_session.data` field in Medusa's database.
    // It's not usually intended for making calls to the payment provider to update payment instrument details
    // (like changing a card, which would be a different flow).
    // Therefore, we usually just return the data, and Medusa handles saving it.
    this.logger_?.info(`Redsys updatePaymentData called for session ${sessionId}. New data to be merged by Medusa: ${JSON.stringify(data)}`);
    try {
      // No specific Redsys action needed here. Medusa will merge `data` into the existing session data.
      // The promise should resolve with the data that Medusa expects to be the *complete* new session_data.
      // However, the core AbstractPaymentProcessor seems to expect the input `data` to be returned,
      // and Medusa merges it. If the entire updated session data is needed, one might have to fetch current
      // session data from Medusa context if passed, merge, and return. But typically, just returning `data` is fine.
      return data;
    } catch (e) {
      this.logger_?.error(`Error in Redsys updatePaymentData for session ${sessionId}: ${e.message}`);
      throw new PaymentProcessorError(
          `Error updating payment data for Redsys session ${sessionId}: ${e.message}`,
          PaymentProcessorError.PaymentProcessorErrors.UNEXPECTED_STATE,
          e
       );
    }
  }

   async updatePayment(
    context: PaymentProcessorContext
  ): Promise<PaymentProcessorSessionResponse | void> {
    // This method is typically called when cart details change (e.g., amount).
    // Redsys flow usually involves creating a new payment form.
    // So, we can re-initiate the payment.
    return this.initiatePayment(context);
  }

  /**
   * Validates and processes Redsys webhook notifications.
   * @param {Record<string, unknown>} notificationData - The raw notification data from Redsys (typically req.body).
   * @returns {Promise<{action: string, data: Record<string, unknown>, error?: string}>}
   *          An object indicating the action to take and the processed data, or an error.
   *          Possible actions: "PROCESS_PAYMENT", "PROCESS_REFUND", "IGNORE".
   */
  async getWebhookActionAndData(
    notificationData: Record<string, unknown>
  ): Promise<{action: string; data: Record<string, unknown>; error?: string, cart_id?: string}> {
    try {
      const merchantParameters = notificationData.Ds_MerchantParameters as string;
      const signature = notificationData.Ds_Signature as string;
      const signatureVersion = notificationData.Ds_SignatureVersion as string;

      if (!merchantParameters || !signature || !signatureVersion) {
        this.logger_?.warn("Redsys Webhook: Missing one or more required parameters (Ds_MerchantParameters, Ds_Signature, Ds_SignatureVersion).");
        return {
          action: "IGNORE",
          data: notificationData,
          error: "Missing Redsys notification parameters.",
        };
      }

      const isValid = this.redsys_.checkNotificationSignature(
        merchantParameters,
        signature,
        signatureVersion
      );

      if (!isValid) {
        this.logger_?.error("Redsys Webhook: Invalid signature.");
        return {
          action: "IGNORE",
          data: notificationData,
          error: "Invalid Redsys notification signature.",
        };
      }

      const params = this.redsys_.decodeMerchantParameters(merchantParameters);
      const orderId = params.Ds_Order as string;
      const responseCodeString = params.Ds_Response as string;

      if (!orderId || typeof responseCodeString === 'undefined') {
        this.logger_?.error(`Redsys Webhook: Decoded parameters missing Ds_Order or Ds_Response. Order: ${orderId}, Response: ${responseCodeString}`);
        return { action: "IGNORE", data: params, error: "Missing Ds_Order or Ds_Response in decoded parameters."};
      }

      const responseCode = parseInt(responseCodeString, 10);
      this.logger_?.info(`Redsys Webhook: Received for order ${orderId}, response code ${responseCode}. Decoded params: ${JSON.stringify(params)}`);


      if (responseCode >= 0 && responseCode <= 99) { // Successful authorization/payment
        return {
          action: "PROCESS_PAYMENT",
          data: params, // This data will be stored in payment_session.data
          cart_id: orderId,
        };
      } else if (responseCode === 900) { // Confirmed refund (as an example, actual codes might vary)
        return {
          action: "PROCESS_REFUND",
          data: params,
          cart_id: orderId,
        };
      } else if (responseCode === 400) { // Cancellation (Anulación)
         return {
            action: "CANCEL_PAYMENT", // Or a custom action Medusa can map to order cancellation/payment void
            data: params,
            cart_id: orderId,
         };
      }
      // Example: Specific error code handling for payment failure
      // else if (responseCode === 104 || responseCode === 180 || responseCode === 184) { // Specific Redsys error codes for card denied/problem
      //   return {
      //     action: "FAIL_PAYMENT", // This might map to order failure or payment status update
      //     data: params,
      //     cart_id: orderId,
      //     error: `Payment failed with Redsys error code: ${responseCode}`,
      //   };
      // }

      this.logger_?.warn(`Redsys Webhook: Unhandled Redsys response code ${responseCode} for order ${orderId}. Ignoring.`);
      return {
        action: "IGNORE",
        data: params,
        cart_id: orderId,
        error: `Unhandled Redsys response code: ${responseCode}`,
      };
    } catch (error) {
      this.logger_?.error(`Error processing Redsys webhook: ${error.message}`, error);
      return {
        action: "IGNORE",
        data: notificationData, // Raw data in case of decoding failure
        error: `Internal error processing webhook: ${error.message}`,
      };
    }
  }
}

export default RedsysProviderService;
