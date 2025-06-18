import { MedusaRequest, MedusaResponse } from "@medusajs/medusa";
import { createRedsysPaymentWorkflow } from "../../../../workflows/redsys/workflows/create-payment"; // Adjust path as necessary
import { object, string, InferType } from "yup";

// Validator for the request body
const RedsysPaymentRequestBodySchema = object({
  payment_session_id: string().required("payment_session_id is required."),
  // Add other fields if Redsys requires them at this stage, e.g., specific payment method chosen by user
  // For a simple redirect, payment_session_id might be enough to fetch all context.
});

type RedsysPaymentRequestBody = InferType<typeof RedsysPaymentRequestBodySchema>;

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { body } = req;

  try {
    // Validate request body
    const validatedBody = await RedsysPaymentRequestBodySchema.validate(body, {
      abortEarly: false,
    }).catch((errors) => {
      throw new Error(errors.inner.map((e) => e.message).join(", "));
    });

    const { payment_session_id } = validatedBody as RedsysPaymentRequestBody;

    // Retrieve cart_id or other necessary context from payment_session_id if needed
    // For this example, we assume payment_session_id is sufficient to initiate the workflow
    // The workflow itself will query the payment session details.
    // If customer_id is available (e.g. from logged-in user), it can be passed too.
    // const customerId = req.user?.customer_id; // Example if authentication is in place

    const workflowInput = {
      paymentSessionId: payment_session_id,
      // paymentData: {}, // If any specific data needs to be passed from client to override/add to Redsys params
      // customerId: customerId,
    };

    // Invoke the create Redsys payment workflow
    const { result, errors: workflowErrors } = await createRedsysPaymentWorkflow(req.scope).run({
      input: workflowInput,
      throwOnError: false, // Handle errors manually
    });

    if (workflowErrors && workflowErrors.length > 0) {
      // Log the errors for debugging
      req.scope.resolve("logger").error(`Redsys payment workflow failed for session ${payment_session_id}: ${workflowErrors.map(e => e.message).join(", ")}`);
      // Return a generic error or specific details based on desired security/verbosity
      return res.status(500).json({
        error: "Payment initiation failed.",
        details: workflowErrors.map(e => ({ message: e.message, action: e.action }))
      });
    }

    // The result from the workflow should contain the Redsys form parameters
    // and the redirect URL, which was set up in the service's initiatePayment method
    // and passed through the createRedsysPaymentStep.
    // Example structure of result might be: { Ds_SignatureVersion: "...", Ds_MerchantParameters: "...", Ds_Signature: "...", url: "..." }

    if (!result || !result.session_data?.url || !result.session_data?.Ds_MerchantParameters) {
        req.scope.resolve("logger").error(`Redsys payment workflow for session ${payment_session_id} did not return expected Redsys form data.`);
        return res.status(500).json({ error: "Payment initiation failed to produce Redsys form data." });
    }

    // Send the Redsys form parameters back to the client
    // The client will use these to auto-submit a form to Redsys
    res.status(200).json({
      provider_id: "redsys", // Or the actual provider_id used
      data: result.session_data, // This should contain all Redsys form fields (Ds_SignatureVersion, Ds_MerchantParameters, Ds_Signature) and the 'url'
    });

  } catch (error) {
    // Log the error
    req.scope.resolve("logger").error(`Error in Redsys payment POST handler: ${error.message}`);

    // Handle validation errors or other errors
    if (error.message.includes("is required") || error.message.includes(",")) { // Basic check for validation style errors
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "An unexpected error occurred during payment processing." });
  }
}
