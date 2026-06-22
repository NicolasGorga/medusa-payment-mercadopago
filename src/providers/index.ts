import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import MercadopagoProviderService from "./services/mercadopago-provider";
import MercadopagoSubscriptionProviderService from "./services/mercadopago-subscription";

export default ModuleProvider(Modules.PAYMENT, {
    services: [
        MercadopagoProviderService,
        MercadopagoSubscriptionProviderService,
    ],
})
