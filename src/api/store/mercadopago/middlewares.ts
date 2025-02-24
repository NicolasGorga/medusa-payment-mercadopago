import { MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework";
import { PostStoreMercadopagoPayment } from "./payment/validators";

export const mercadopagoMiddlewares: MiddlewareRoute[] = [
    {
        matcher: '/store/mercadopago/payment',
        method: 'POST',
        middlewares: [
            validateAndTransformBody(PostStoreMercadopagoPayment),
        ]
    }
]