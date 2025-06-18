import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import RedsysProviderService from "./service";

export default ModuleProvider(Modules.PAYMENT, {
  services: [RedsysProviderService],
});
