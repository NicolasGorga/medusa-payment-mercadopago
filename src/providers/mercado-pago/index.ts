import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import MercadopagoProviderService from "../mercado-pago/service";

export default ModuleProvider(Modules.PAYMENT, {
    services: [MercadopagoProviderService],
})