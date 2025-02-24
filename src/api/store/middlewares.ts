import { MiddlewareRoute } from "@medusajs/framework";
import { mercadopagoMiddlewares } from "./mercadopago/middlewares";

export const storeMiddlewares: MiddlewareRoute[] = [
    ...mercadopagoMiddlewares,
]