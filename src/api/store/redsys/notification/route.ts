import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import RedsysProviderService from "../../../../providers/redsys/service"; // Adjust path as per your structure
import { PaymentModuleService, Logger } from "@medusajs/medusa";
// For Medusa v2, PaymentActions might be different or handled by the module service directly.
// Let's assume getWebhookActionAndData returns string actions like "PROCESS_PAYMENT", "PROCESS_REFUND", "CANCEL_PAYMENT"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve<Logger>("logger");
  const paymentModuleService = req.scope.resolve<PaymentModuleService>("paymentModuleService");
  // Resolve the RedsysProviderService. Ensure it's registered correctly in Medusa's container.
  // The name usually follows `pp_<provider_id>` e.g. `pp_redsys`.
  // We need to confirm the exact registration name. For now, using the class name as a placeholder for direct instantiation if needed,
  // but ideally, it's resolved from the scope.
  let redsysService: RedsysProviderService;
  try {
    redsysService = req.scope.resolve<RedsysProviderService>("pp_redsys"); // pp_redsys is the typical Medusa way
  } catch (e) {
    logger.error("Redsys notification handler: Failed to resolve RedsysProviderService from scope 'pp_redsys'. Ensure it's registered.", e);
    // Fallback for local testing if not fully integrated: new RedsysProviderService({ logger }, {});
    // This fallback is NOT for production and assumes default/empty options.
    // It's better to ensure the service is correctly registered.
    return res.status(500).send("Internal server error: Payment provider not configured.");
  }

  const notificationData = req.body as Record<string, unknown>;
  logger.info(`Redsys notification received: ${JSON.stringify(notificationData)}`);

  if (!notificationData.Ds_MerchantParameters || !notificationData.Ds_Signature) {
    logger.warn("Redsys notification: Missing Ds_MerchantParameters or Ds_Signature.");
    return res.status(400).send("Malformed Redsys notification.");
  }

  try {
    const { action, data: redsysParams, error, cart_id } = await redsysService.getWebhookActionAndData(notificationData);

    if (error) {
      logger.error(`Redsys notification validation/processing error for cart_id ${cart_id}: ${error}`);
      // Respond with an error but Redsys might still expect 200 OK to stop retries.
      // Check Redsys documentation for error response expectations.
      // For now, sending 200 to acknowledge, but logging error.
      return res.status(200).send(`Notification processed with error: ${error}`);
    }

    if (action === "IGNORE" || !cart_id) {
      logger.info(`Redsys notification for cart_id ${cart_id} resulted in action: ${action}. No further processing by Medusa.`);
      return res.status(200).send("Notification acknowledged, no action taken or cart_id missing.");
    }

    // At this point, cart_id should be valid (resource_id from payment session)
    logger.info(`Redsys notification for cart_id ${cart_id}: Action is '${action}'. Processing with PaymentModuleService.`);

    // Retrieve the payment session associated with the cart_id (which is resource_id)
    // Note: Medusa's PaymentSession resource_id is typically the cart_id.
    // The payment module service might require the payment session ID itself, or payment ID.
    // Let's assume we need to find the payment session by its resource_id (cart_id).
    // This part might need adjustment based on how Medusa links Redsys order ID back to its entities.
    // `redsysParams.Ds_Order` (which is cart_id) is the key.

    // We need to find the payment associated with this cart_id and provider.
    // This typically involves using the cartService or orderSerivce to find the payment collections,
    // then filtering by provider_id. Or, if the payment_session_id is the Ds_Order, use that.
    // For now, we assume cart_id (Ds_Order) is the payment_session_id for simplicity in this example.
    // In a real scenario, you'd look up the Payment or PaymentSession using the Ds_Order/cart_id.
    // The `paymentModuleService.updatePaymentSession` might be what we need if cart_id is the session id.
    // Or, more likely, we need to find the Medusa internal Payment ID.

    // Ds_Order from Redsys is our cart_id / resource_id
    const resourceId = cart_id;

    // Find the corresponding Medusa Payment Session
    const paymentSessions = await paymentModuleService.listPaymentSessions({ resource_id: resourceId, provider_id: "redsys" });

    if (!paymentSessions || paymentSessions.length === 0) {
      logger.error(`Redsys notification: No payment session found for resource_id (cart_id) '${resourceId}' and provider 'redsys'.`);
      return res.status(404).send("Payment session not found for corresponding Redsys order.");
    }

    if (paymentSessions.length > 1) {
      // This case should ideally not happen if cart_id + provider_id is a unique enough constraint for active sessions.
      logger.warn(`Redsys notification: Multiple payment sessions found for resource_id '${resourceId}' and provider 'redsys'. Using the first one. Sessions: ${paymentSessions.map(ps => ps.id).join(', ')}`);
    }

    const paymentSession = paymentSessions[0];
    const paymentSessionId = paymentSession.id; // This is the actual Medusa PaymentSession ID

    logger.info(`Redsys notification: Matched to Medusa PaymentSession ID '${paymentSessionId}' for cart_id '${resourceId}'.`);

    // It's crucial that `redsysParams` (the decoded Ds_MerchantParameters) are stored
    // in the payment session's `data` field.
    // in the payment session's `data` field.
    // The capturePayment, refundPayment etc. on module service usually handle this by merging data.

    // Update the payment session with the new data from Redsys first.
    // This ensures that subsequent calls to provider methods (like capturePayment via PaymentModuleService)
    // will have the latest Redsys parameters (e.g., Ds_Response) available in session data.
    await paymentModuleService.updatePaymentSession(paymentSession.id, { data: { ...paymentSession.data, ...redsysParams } });
    logger.info(`PaymentSession ${paymentSession.id} data updated with Redsys params.`);

    switch (action) {
      case "PROCESS_PAYMENT": // Indicates successful authorization
        logger.info(`Action PROCESS_PAYMENT for session ${paymentSession.id}. Order processing should proceed based on authorization.`);
        // Medusa's order processing flow typically handles capture after authorization.
        // If explicit capture is needed and not handled by order flow, it would be here.
        // For many Redsys setups, authorization implies capture.
        // The `RedsysProviderService.capturePayment` method checks this.
        // To trigger capture via Medusa's standard mechanism (if necessary):
        // This would require finding the `Payment` associated with the `PaymentSession`.
        const payments = await paymentModuleService.listPayments({ session_id: paymentSession.id });
        if (payments && payments.length > 0) {
          const paymentToCapture = payments[0]; // Assuming one payment per session for this provider
          logger.info(`Attempting to capture Medusa payment ${paymentToCapture.id} linked to session ${paymentSession.id}.`);
          try {
            // The capturePayment in PaymentModuleService will call our RedsysProviderService.capturePayment
            await paymentModuleService.capturePayment(paymentToCapture.id!);
            logger.info(`Capture successful for Medusa payment ${paymentToCapture.id}.`);
          } catch (captureError) {
            logger.error(`Failed to capture Medusa payment ${paymentToCapture.id}: ${captureError.message}`, captureError);
            // Decide if this is critical enough to not send 200 OK to Redsys.
            // Usually, if Redsys confirmed payment, we should still acknowledge.
          }
        } else {
          logger.warn(`No Medusa payment found for session ${paymentSession.id} to attempt capture.`);
        }
        break;

      case "PROCESS_REFUND":
        logger.info(`Action PROCESS_REFUND for session ${paymentSession.id}. This typically means Redsys confirmed a refund.`);
        // This would usually follow a refund request initiated from Medusa.
        // If Redsys sends unsolicited refund notifications, Medusa needs to handle this by potentially creating a Refund record.
        // The amount can be found in `redsysParams.Ds_Amount`.
        // For now, we've updated the session data; further refund processing logic would be needed if Redsys pushes refunds.
        // Example: await paymentModuleService.createRefund(paymentId, amount, reason, { data: redsysParams });
        logger.info(`Refund for session ${paymentSession.id} noted as processed by Redsys.`);
        break;

      case "CANCEL_PAYMENT": // If Redsys confirms a cancellation/void
        logger.info(`Action CANCEL_PAYMENT for session ${paymentSession.id}.`);
        // Similar to capture, find the Medusa Payment ID.
        const paymentsToCancel = await paymentModuleService.listPayments({ session_id: paymentSession.id });
         if (paymentsToCancel && paymentsToCancel.length > 0) {
          const paymentToCancel = paymentsToCancel[0];
          logger.info(`Attempting to cancel Medusa payment ${paymentToCancel.id} linked to session ${paymentSession.id}.`);
          try {
            await paymentModuleService.cancelPayment(paymentToCancel.id!);
            logger.info(`Cancellation successful for Medusa payment ${paymentToCancel.id}.`);
          } catch (cancelError) {
             logger.error(`Failed to cancel Medusa payment ${paymentToCancel.id}: ${cancelError.message}`, cancelError);
          }
        } else {
          logger.warn(`No Medusa payment found for session ${paymentSession.id} to attempt cancellation.`);
        }
        break;

      // Add FAIL_PAYMENT or other custom actions if your getWebhookActionAndData supports them
      // case "FAIL_PAYMENT":
      //   logger.warn(`Payment failed for session ${paymentSession.id} as per Redsys notification.`);
      //   // Update payment status to error, this might be done by updating the payment object itself.
      //   break;

      default:
        logger.warn(`Unhandled action '${action}' for Redsys notification on session ${paymentSession.id}.`);
        break;
    }

    // Acknowledge receipt to Redsys.
    // Redsys usually expects a 200 OK. Some systems might require a specific string response.
    // For example, some TPVs require "ACK" or "OK" in the body. Check Redsys docs.
    res.status(200).send("Notification processed successfully.");

  } catch (err) {
    logger.error(`Unexpected error in Redsys notification handler: ${err.message}`, err);
    // Even with an internal error, Redsys might expect a 200 OK to prevent retries.
    // Sending 500 might cause Redsys to retry. Consult Redsys documentation.
    res.status(500).send("Internal server error processing notification.");
  }
}
