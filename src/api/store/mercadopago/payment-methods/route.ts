import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework";
import { GetStoreMercadopagoPaymentMethodsParamsType } from "./validators";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { PaymentAccountHolderDTO } from "@medusajs/framework/types";

export const GET = async (
  req: AuthenticatedMedusaRequest<
    undefined,
    GetStoreMercadopagoPaymentMethodsParamsType
  >,
  res: MedusaResponse
) => {
  const { provider_id } = req.validatedQuery;
  const paymentModuleService = req.scope.resolve(Modules.PAYMENT);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "customer_account_holder",
    fields: req.queryConfig.fields,
    filters: {
      customer_id: req.auth_context?.actor_id,
    },
  });

  // Since we can't apply this filter when querying the pivot table, we do it in memory
  const [accountHolder] = data
  .filter(
    (customerAccountHolder) => customerAccountHolder.account_holder?.provider_id === provider_id
  )
  .map(customerAccountHolder => customerAccountHolder.account_holder);

  const paymentMethods = await paymentModuleService.listPaymentMethods({
    provider_id,
    context: {
      account_holder: accountHolder as unknown as PaymentAccountHolderDTO,
    },
  });

  return res.status(200).json({ paymentMethods });
};
