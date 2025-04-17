import { MiddlewareRoute, validateAndTransformBody, validateAndTransformQuery } from "@medusajs/framework";
import { PostStoreMercadopagoPayment } from "./payment/validators";
import { GetStoreMercadopagoPaymentMethodsParams } from "./payment-methods/validators";
import { listPaymentmethodsQueryConfig } from "./payment-methods/query-config";

export const mercadopagoMiddlewares: MiddlewareRoute[] = [
    {
        matcher: '/store/mercadopago/payment',
        method: 'POST',
        middlewares: [
            validateAndTransformBody(PostStoreMercadopagoPayment),
        ]
    },
    {
        matcher: '/store/mercadopago/payment-methods',
        method: 'GET',
        middlewares: [
            validateAndTransformQuery(GetStoreMercadopagoPaymentMethodsParams, listPaymentmethodsQueryConfig)
        ]
    }
]