import { useQueryGraphStep } from "@medusajs/medusa/core-flows";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { PaymentCreateRequest } from "mercadopago/dist/clients/payment/create/types";
import { PaymentSessionDTO } from "@medusajs/framework/types";
import { validateTransactionAmountStep, ValidateTransactionStepInput } from "../steps/validate-transaction-amount";
import { createPaymentStep } from "../steps/create-payment";

type CreatePaymentWorkflowInput = {
    paymentSessionId: string;
    paymentData: PaymentCreateRequest;
}

export const createMercadopagoPaymentWorkflow = createWorkflow(
    'create-mercadopago-payment',
    ({ paymentSessionId, paymentData }: CreatePaymentWorkflowInput) => {
        //@ts-ignore
        const { data: paymentSessions } = useQueryGraphStep({
            entity: 'payment_session',
            fields: ['amount'],
            filters: {
                id: paymentSessionId
            },
            options: {
                throwIfKeyNotFound: true
            }
        });
        const paymentSession = transform({ paymentSessions }, ({ paymentSessions }) => paymentSessions[0] as unknown as PaymentSessionDTO);
        const validateTransactionStepInput: ValidateTransactionStepInput = transform(
            { paymentSession, paymentData },
            ({ paymentSession, paymentData }) => ({ medusaAmount: Number(paymentSession.amount), transactionAmount: paymentData.transaction_amount ?? 0 })
        );
        validateTransactionAmountStep(validateTransactionStepInput);
        return new WorkflowResponse(createPaymentStep({ paymentSessionId, paymentData }));
    }
)