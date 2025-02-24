import { AbstractPaymentProvider, isString, MedusaError, MedusaErrorTypes, PaymentSessionStatus } from "@medusajs/framework/utils";
import { AuthorizePaymentInput, AuthorizePaymentOutput, CancelPaymentInput, CancelPaymentOutput, CapturePaymentInput, CapturePaymentOutput, DeletePaymentInput, DeletePaymentOutput, GetPaymentStatusInput, GetPaymentStatusOutput, InitiatePaymentInput, InitiatePaymentOutput, PaymentActions, PaymentStatus, ProviderWebhookPayload, RefundPaymentInput, RefundPaymentOutput, RetrievePaymentInput, RetrievePaymentOutput, UpdatePaymentInput, UpdatePaymentOutput, WebhookActionResult } from "@medusajs/types";
import MercadoPagoConfig, { Payment, PaymentRefund } from "mercadopago";
import { PaymentCreateRequest } from "mercadopago/dist/clients/payment/create/types";
import { PaymentSearchResult } from "mercadopago/dist/clients/payment/search/types";
import { MercadopagoOptions, MercadopagoWebhookPayload } from "../../types";
import { createHmac } from "crypto";
import { Logger } from "@medusajs/medusa";

type InjectedDependencies = {
    logger: Logger,
}

class MercadopagoProviderService extends AbstractPaymentProvider<MercadopagoOptions> {
    static identifier = 'mercadopago'
    protected options_: MercadopagoOptions
    protected client_: MercadoPagoConfig
    protected logger_: Logger

    constructor(container: InjectedDependencies, options: MercadopagoOptions) {
        super(container, options)

        this.options_ = options
        this.client_ = new MercadoPagoConfig({
            accessToken: options.accessToken
        })
    }

    static validateOptions(options: Record<any, any>): void | never {
        if (!options.accessToken || !isString(options.accessToken)) {
            throw new MedusaError(
                MedusaErrorTypes.INVALID_DATA,
                'Mercado pago \'accessToken\' needs to be a non empty string',
            )
        }
    }

    async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
        return {
            id: '',
            data: {
                session_id: input.data?.session_id,
            }
        }
    }

    async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
        const paymentId = input.data?.id
        if (paymentId) {
            const payment = new Payment(this.client_)
            await payment.cancel({ id: paymentId as string })
        }
        return {}
    }

    async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
        const paymentSessionId = input.data?.session_id as string | undefined;
        let data: PaymentSearchResult = {};
        if (paymentSessionId) {
            const payment = new Payment(this.client_);
            const results = (await payment.search({ options: { external_reference: paymentSessionId } }))?.results ?? [];
            data = results[0] ?? {}
        }
        // Returning PaymentSessionStatus.CAPTURED for auto capture, since for UY card method they are captured automatically
        // Should make it conditionally in cases where a method could be not auto captured (maybe cash or another country)
        return Promise.resolve({
            data: data,
            status: PaymentSessionStatus.CAPTURED,
        })
    }

    capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
        return Promise.resolve({ data: input.data })
    }

    async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
        const paymentId = input.data?.id
        if (!paymentId || !isString(paymentId)) {
            return { data: input.data ?? {} }
        }
        const payment = new Payment(this.client_)
        const paymentData = await payment.cancel({ id: paymentId })
        return { data: paymentData as unknown as Record<string, unknown> }
    }

    async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
        const paymentId = input.data?.id
        const payment = new Payment(this.client_)
        const paymentData = await payment.get({ id: paymentId as string })
        const status = paymentData.status

        switch (status) {
            case 'authorized':
                return { status: 'authorized' }
            case 'approved':
            case 'in_mediation':
                return { status: 'captured' }

            case 'cancelled':
            case 'refunded':
                return { status: 'canceled' }
            default:
                return { status: 'pending' }
        }
    }

    async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
        const paymentId = this.getIdOrThrow(input.data)
        const payment = new Payment(this.client_)
        const paymentData = await payment.get({ id: paymentId })

        const refundAmount = input.amount
        const isPartial = (paymentData.transaction_amount ?? input.amount) > input.amount
        const refund = new PaymentRefund(this.client_)
        const refundData = await refund.create({
            payment_id: paymentId, body: {
                amount: isPartial ? Number(refundAmount) : undefined
            }
        })
        return { data: refundData as unknown as Record<string, unknown> }
    }

    async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
        const paymentId = this.getIdOrThrow(input.data)
        const payment = new Payment(this.client_)
        const paymentData = await payment.get({ id: paymentId })
        return { data: paymentData as unknown as Record<string, unknown> }
    }

    updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
        return Promise.resolve({ data: input.data })
    }

    async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
        this.validateWebhookSignature(payload);
        const mercadopagoData = payload.data as MercadopagoWebhookPayload;
        const eventType = mercadopagoData.action;

        try {
            switch (eventType) {
                case 'payment.created':
                case 'payment.updated':
                    const payment = new Payment(this.client_)
                    const paymentData = await payment.get({ id: mercadopagoData.data.id as string })
                    const paymentSessionId = paymentData.external_reference;

                    if (!paymentSessionId) {
                        throw new Error('No external_reference found in mercadopago payload, unable to match against Medusa payment session')
                    }

                    if (['authorized', 'approved'].includes(paymentData.status ?? '')) {
                        return {
                            action: paymentData.status === 'approved' ? 'captured' : paymentData.status as PaymentActions,
                            data: {
                                session_id: paymentSessionId,
                                amount: paymentData.transaction_amount!
                            }
                        }
                    }
                default:
                    return { action: 'not_supported' }
            }
        } catch (error) {
            return { action: 'failed' }
        }
    }

    async createPayment({ paymentSessionId, payload }: { paymentSessionId: string, payload: PaymentCreateRequest }) {
        const payment = new Payment(this.client_)
        return payment.create({
            body: {
                ...payload,
                external_reference: paymentSessionId,
            }
        })
    }

    protected validateWebhookSignature(data: ProviderWebhookPayload['payload']) {
        const secret = this.options_.webhookSecret
        // If no webhookSecret is set, the assumption is this protection is not required
        if (!secret) {
            return
        }

        const headers = data.headers;

        const xSignature = (headers['x-signature'] ?? 'noop') as string
        const xRequestId = (headers['x-request-id'] ?? 'noop') as string
        const body = (data?.data as MercadopagoWebhookPayload)
        const dataId = (body.data?.id ?? 'noop') as string

        const parts = xSignature.split(',')
        let timestamp: string | undefined;
        let hash: string | undefined;

        parts.forEach(part => {
            const [key, val] = part.split('=')
            if (key && val) {
                const [trimmedKey, trimmedVal] = [key.trim(), val.trim()]
                if (trimmedKey === 'ts') {
                    timestamp = trimmedVal
                } else if (trimmedKey === 'v1') {
                    hash = trimmedVal
                }
            }
        })
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`
        const hmac = createHmac('sha256', secret)
        hmac.update(manifest)
        const sha = hmac.digest('hex')
        if (sha !== hash) {
            this.logger_.warn(`Unable to verify Mercado Pago authenticity of request with headers:\n
                ${headers}
            `)
            throw new MedusaError(
                MedusaErrorTypes.INVALID_DATA,
                'Invalid signature'
            )
        }
    }

    getIdOrThrow(data?: Record<string, unknown>) {
        const id = data?.id
        if (!id || !isString(id)) {
            throw new MedusaError(
                MedusaErrorTypes.INVALID_DATA,
                'No valid string stored against \'id\' key of data object'
            )
        }
        return id as string
    }
}

export default MercadopagoProviderService