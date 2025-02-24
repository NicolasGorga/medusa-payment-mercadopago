import { MedusaError, MedusaErrorTypes } from "@medusajs/framework/utils";
import { createStep } from "@medusajs/framework/workflows-sdk";

export type ValidateTransactionStepInput = {
    transactionAmount: number;
    medusaAmount: number;
}

export const validateTransactionAmountStep = createStep<ValidateTransactionStepInput, void, undefined>(
    'vaidate-transaction-amount',
    async ({ transactionAmount, medusaAmount }) => {
        if (medusaAmount !== transactionAmount) {
            throw new MedusaError(
                MedusaErrorTypes.PAYMENT_AUTHORIZATION_ERROR,
                'CMedusa amount doesn\'t match Mercado Pago amount, unable to generate payment'
            )
        }
    }
)