import { createFindParams } from "@medusajs/medusa/api/utils/validators";
import { z } from "zod";

export const GetStoreMercadopagoPaymentMethodsParamsFields = z.object({
    provider_id: z.string(),
})

export const GetStoreMercadopagoPaymentMethodsParams = createFindParams({
  limit: 50,
  offset: 0,
}).merge(
    GetStoreMercadopagoPaymentMethodsParamsFields,
);

export type GetStoreMercadopagoPaymentMethodsParamsType = z.infer<
  typeof GetStoreMercadopagoPaymentMethodsParams
>;
