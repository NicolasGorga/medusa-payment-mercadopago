import { CreatePaymentMethodDTO, PaymentMethodDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export const createPaymentMethodStepId = "create-payment-method"

export const createPaymentMethodStep = createStep<CreatePaymentMethodDTO, PaymentMethodDTO | null, undefined>(
    createPaymentMethodStepId,
    async (data: CreatePaymentMethodDTO, { container }) => {
        const service = container.resolve(Modules.PAYMENT)
        const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

        
        let paymentMethod: PaymentMethodDTO | null = null
        try {
            paymentMethod = await service.createPaymentMethods(data)
        } catch (error) {
            // Until this pull request is merged, we catch to allow payment to continue,
            // as the continueOnPermanentFailure config at the workflow level doesn't work: https://github.com/medusajs/medusa/pull/12027
            logger.error(`Error occurred while trying to save payment method for provider ${data.provider_id}`, error)
        }

        return new StepResponse(paymentMethod)
    }
)