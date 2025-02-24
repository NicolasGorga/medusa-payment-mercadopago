import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { PaymentCreateRequest } from "mercadopago/dist/clients/payment/create/types";
import MercadopagoProviderService from "../../../providers/mercado-pago/service";

type CreatePaymentStepInput = {
    paymentSessionId: string;
    paymentData: PaymentCreateRequest
}

export const createPaymentStep = createStep<CreatePaymentStepInput, void, undefined>(
    'create-mercado-pago-payment',
    async ({ paymentSessionId, paymentData }, { container }) => {
        //@ts-ignore
        const mercadopagoPaymentProvider = container.resolve('payment').paymentProviderService_
            .retrieveProvider('pp_mercadopago_mercadopago') as MercadopagoProviderService;
        await mercadopagoPaymentProvider.createPayment({ paymentSessionId, payload: paymentData });
        return new StepResponse()
    }
)