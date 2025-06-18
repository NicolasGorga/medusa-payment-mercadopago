import {
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  // when, // Commented out as Redsys flow might be simpler
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
// import { PaymentCreateRequest } from "mercadopago/dist/clients/payment/create/types"; // Removed MercadoPago specific import
import {
  // AccountHolderDTO, // Potentially not needed for basic Redsys
  // CustomerDTO, // Potentially not needed for basic Redsys
  // PaymentCustomerDTO, // Potentially not needed for basic Redsys
  PaymentSessionDTO,
  // UpdateAccountHolderDTO, // Potentially not needed for basic Redsys
} from "@medusajs/framework/types";
import {
  validateTransactionAmountStep, // This can be a generic step
  ValidateTransactionStepInput,
} from "../../steps/validate-transaction-amount"; // Assuming a generic path
import { createRedsysPaymentStep } from "../steps/create-redsys-payment"; // Conceptual Redsys step
// import { createRedsysPaymentMethodStep } from "../steps/create-redsys-payment-method"; // Conceptual, might not apply
// import { updateRedsysAccountHolderStep } from "../steps/update-redsys-account-holder"; // Conceptual, might not apply

// Define a generic input type for Redsys payment data for now
type RedsysPaymentWorkflowInput = {
  paymentSessionId: string;
  paymentData?: Record<string, unknown>; // Redsys data is different, more for redirect params
  customerId?: string; // May or may not be used depending on Redsys specific logic
};

export const createRedsysPaymentWorkflow = createWorkflow(
  "create-redsys-payment",
  ({
    paymentSessionId,
    paymentData, // This will likely be empty or minimal for Redsys initial creation
    customerId,  // Retained for now, but its usage might differ
  }: RedsysPaymentWorkflowInput) => {
    //@ts-ignore
    const { data: paymentSessions } = useQueryGraphStep({
      entity: "payment_session",
      fields: ["amount", "provider_id", "data"], // Added 'data' to potentially pass to Redsys
      filters: {
        id: paymentSessionId,
        // TODO: Ensure this provider_id is correct for Redsys
        // provider_id: "pp_redsys", // Example provider ID
      },
      options: {
        throwIfKeyNotFound: true,
      },
    }).config({
      name: "get-redsys-payment-session",
    });

    const paymentSession = transform(
      { paymentSessions },
      ({ paymentSessions }) =>
        paymentSessions[0] as unknown as PaymentSessionDTO
    );

    // The amount validation might still be relevant if amount is fixed before redirect
    // Redsys usually takes amount in its own form, so this step might be less critical
    // or need adjustment depending on how amount is passed to Redsys service.
    // For now, we assume paymentData might contain an amount to validate, or this step
    // primarily validates the session amount itself.
    const validateTransactionStepInput: ValidateTransactionStepInput =
      transform(
        { paymentSession, paymentData },
        ({ paymentSession, paymentData }) => ({
          medusaAmount: Number(paymentSession.amount),
          // Redsys paymentData is not like MercadoPago's, so this might be 0 or not applicable here
          // Or, if paymentData is used to override amount, it could be paymentData.Ds_Merchant_Amount
          transactionAmount: paymentData?.Ds_Merchant_Amount ? Number(paymentData.Ds_Merchant_Amount) : Number(paymentSession.amount),
        })
      );

    validateTransactionAmountStep(validateTransactionStepInput);

    // Customer fetching and complex account holder/payment method logic from MercadoPago
    // is simplified here. Redsys typically doesn't require pre-creating payment methods
    // or extensive customer objects on the PSP side before initiating payment.
    // The customer ID might be used to enrich the payment description or for local records.

    // const customerQuery = useQueryGraphStep({ ... }); // Simplified
    // const customer = transform({ customerQuery }, ...); // Simplified
    // const paymentCustomer = transform({ customer }, ...); // Simplified

    // The following `when` blocks for creating/updating payment methods and account holders
    // are very specific to MercadoPago's tokenization and customer management.
    // Redsys flow is usually a direct redirect, so these are commented out for now.
    // If Redsys had similar features that needed to be integrated, these would be adapted.

    /*
    when({ accountHolderPaymentMethodsInput, customer }, (input) =>
      !!input.customer
    ).then(() => {
      createRedsysPaymentMethodStep(accountHolderPaymentMethodsInput).config({
        continueOnPermanentFailure: true,
      });
    })

    when({ accountHolderPaymentMethodsInput }, (input) => {
      // ... Redsys equivalent logic if any ...
    }).then(() => {
      // ... updateRedsysAccountHolderStep if any ...
    })
    */

    // The primary step for Redsys would be to prepare data for the redirect.
    // This might involve calling the RedsysProviderService.initiatePayment
    // which would return form parameters and the redirect URL.
    // The `createRedsysPaymentStep` should encapsulate this.
    // `paymentData` for this step might be the session data or specific overrides.

    const createPaymentStepInput = transform(
      { paymentSession, customerId }, // paymentData could be added if needed by the step
      (data) => {
        return {
          paymentSessionId: data.paymentSession.id,
          providerId: data.paymentSession.provider_id, // Ensure this is 'redsys'
          amount: data.paymentSession.amount,
          currencyCode: data.paymentSession.data?.currency_code ?? "", // Assuming currency_code is in session data
          customerId: data.customerId,
          context: data.paymentSession.data, // Pass existing session data as context
          // Any other Redsys specific data from paymentData if provided
        };
      }
    );

    return new WorkflowResponse(
      createRedsysPaymentStep(createPaymentStepInput)
    );
  }
);
