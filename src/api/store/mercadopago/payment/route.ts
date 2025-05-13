import { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { PostStoreMercadopagoPaymentType } from "./validators";
import { createMercadopagoPaymentWorkflow } from "../../../../workflows/mercadopago/workflows/create-payment";
import { MedusaError, MedusaErrorTypes } from "@medusajs/framework/utils";

export const POST = async (req: AuthenticatedMedusaRequest<PostStoreMercadopagoPaymentType>, res: MedusaResponse) => {
    const { paymentSessionId, paymentData } = req.validatedBody
    const { result: paymentSession } = await createMercadopagoPaymentWorkflow(req.scope).run({
        input: { paymentSessionId, paymentData, customerId: req.auth_context?.actor_id }
    });

    const errorMessage = paymentSession.data?.error_message as string | undefined
    if (errorMessage) {
        throw new MedusaError(MedusaErrorTypes.PAYMENT_AUTHORIZATION_ERROR, errorMessage)
    }

    return res.status(201).json({});
}