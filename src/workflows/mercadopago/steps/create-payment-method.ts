import { CreatePaymentMethodDTO, PaymentMethodDTO } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export const createPaymentMethodStepId = "create-payment-method"

export const createPaymentMethodStep = createStep<CreatePaymentMethodDTO, PaymentMethodDTO, undefined>(
    createPaymentMethodStepId,
    async (data: CreatePaymentMethodDTO, { container }) => {
        const service = container.resolve(Modules.PAYMENT)
        
        const paymentMethod = await service.createPaymentMethods(data)

        return new StepResponse(paymentMethod)
    }
)