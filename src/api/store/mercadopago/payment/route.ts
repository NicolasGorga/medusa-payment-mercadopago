import { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { PostStoreMercadopagoPaymentType } from "./validators";
import { createMercadopagoPaymentWorkflow } from "../../../../workflows/mercadopago/workflows/create-payment";

export const POST = async (req: MedusaRequest<PostStoreMercadopagoPaymentType>, res: MedusaResponse) => {
    const { paymentSessionId, paymentData } = req.validatedBody;
    await createMercadopagoPaymentWorkflow(req.scope).run({
        input: { paymentSessionId, paymentData }
    });
    return res.status(201).json({});
}