import { z } from 'zod'

export type PostStoreMercadopagoPaymentType = z.infer<typeof PostStoreMercadopagoPayment>
export const PostStoreMercadopagoPayment = z.object({
    paymentSessionId: z.string().min(1),
    paymentData: z.object({
        token: z.string().min(1),
        transaction_amount: z.number().min(1),
        installments: z.number(),
        payer: z.object({
            email: z.string(),
        })
    })
})