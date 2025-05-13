export interface MercadopagoOptions {
    /**
     * Private key for your Mercado Pago application, for use in the backend to generate Payments
    */
    accessToken: string;
    /**
     * Webhook secret included in webhook notifications from Mercado Pago, useful to verify 
     * their authenticity
    */
    webhookSecret: string;
}

export type MercadopagoWebhookPayload = {
    action: string;
    data: {
        id: string;
    }
}

export type MercadopagoError = {
    error: string
    message: string
    status: string
    cause: {
        code: string
        description: string
    }[] | undefined
}