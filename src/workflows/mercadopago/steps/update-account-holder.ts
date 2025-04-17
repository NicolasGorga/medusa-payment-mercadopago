import { UpdateAccountHolderDTO, UpdateAccountHolderInput } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export const updateAccountHolderStepId = "update-account-holder"

export const udpateAccountHolderStep = createStep(
    updateAccountHolderStepId,
    async (data: UpdateAccountHolderDTO, { container }) => {
        const service = container.resolve(Modules.PAYMENT)
        const updated = await service.updateAccountHolder(data)
        return new StepResponse(updated)
    }
)