import { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { PostStoreMercadopagoPaymentType } from "./validators";
import { createMercadopagoPaymentWorkflow } from "../../../../workflows/mercadopago/workflows/create-payment";

export const POST = async (req: AuthenticatedMedusaRequest<PostStoreMercadopagoPaymentType>, res: MedusaResponse) => {
    const { paymentSessionId, paymentData } = req.validatedBody
    await createMercadopagoPaymentWorkflow(req.scope).run({
        input: { paymentSessionId, paymentData, customerId: req.auth_context?.actor_id }
    });
    return res.status(201).json({});
}