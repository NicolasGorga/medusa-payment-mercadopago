import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { PaymentCreateRequest } from "mercadopago/dist/clients/payment/create/types";
import MercadopagoProviderService from "../../../providers/mercado-pago/service";
import {
  MedusaError,
  MedusaErrorTypes,
  Modules,
} from "@medusajs/framework/utils";
import { PostStoreMercadopagoPaymentType } from "../../../api/store/mercadopago/payment/validators";
import { PaymentSessionDTO } from "@medusajs/framework/types";

type CreatePaymentStepInput = {
  paymentSessionId: string;
  paymentData: PostStoreMercadopagoPaymentType['paymentData'];
};

export const createPaymentStep = createStep<
  CreatePaymentStepInput,
  PaymentSessionDTO,
  undefined
>(
  "create-mercado-pago-payment",
  async ({ paymentSessionId, paymentData }, { container }) => {

    const mercadopagoPaymentProvider = container
      .resolve("payment")
      //@ts-ignore
      .paymentProviderService_.retrieveProvider(
        "pp_mercadopago_mercadopago"
      ) as MercadopagoProviderService;
    const paymentModuleService = container.resolve(Modules.PAYMENT);

    const paymentSession = await paymentModuleService.retrievePaymentSession(
      paymentSessionId,
      {
        select: ["amount", "currency_code"],
        filters: {
          id: paymentSessionId,
        },
      }
    );
    if (!paymentSession) {
      throw new MedusaError(
        MedusaErrorTypes.NOT_FOUND,
        `Payment session with id ${paymentSessionId} was not found`
      );
    }

    const paymentResponse = await mercadopagoPaymentProvider.createPayment({
      paymentSessionId,
      payload: paymentData,
    });
    
    const updatedSession = await paymentModuleService.updatePaymentSession({
      id: paymentSessionId,
      amount: paymentSession.amount,
      currency_code: paymentSession.currency_code,
      data: paymentResponse as unknown as Record<string, unknown>,
    });
    return new StepResponse(updatedSession);
  }
);
