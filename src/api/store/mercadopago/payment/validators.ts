import { z } from 'zod'

export type PostStoreMercadopagoPaymentType = z.infer<typeof PostStoreMercadopagoPayment>
export const PostStoreMercadopagoPayment = z.object({
    paymentSessionId: z.string().min(1),
    paymentData: z.object({
        token: z.string().min(1),
        transaction_amount: z.number().min(1),
        installments: z.number(),
        payer: z.union([
            z.object({
                email: z.string().optional(),
                identification: z.object({
                    type: z.string(),
                    number: z.string()
                }).optional(),
            }).strict(),
            z.object({
                type: z.string(),
                id: z.string(),
            }).strict()
        ]),
        payment_method_id: z.string(),
    })
})