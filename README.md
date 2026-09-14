# @nicogorga/medusa-payment-mercadopago

Receive payments on your Medusa commerce application using Mercado Pago.

[Medusa Payment Mercadopago Repository](https://github.com/NicolasGorga/medusa-payment-mercadopago) | [Medusa Website](https://medusajs.com/) | [Medusa Repository](https://github.com/medusajs/medusa)

> [!WARNING]
> This plugin is a WIP and has only been tested for Credit / Debit Card methods following Mercado Pago docs for Uruguay. You can sumbit issues through [GitHub Issues](https://github.com/NicolasGorga/medusa-payment-mercadopago/issues). Feel free to make contributions by making pull requests and proposing ideas / new flows to implement via [Discussions](https://github.com/NicolasGorga/medusa-payment-mercadopago/discussions)

## Features

- Mercado Pago integration via Checkout API
- Payments created asynchronously via webhook event.
- Payments automatically captured (so far as for Uruguay, Credit / Debit is auto capture)
- Customers and Cards automatically saved to Mercado Pago, so you can implement saved cards in the frontend
- Recurring payments via [Mercado Pago Subscriptions](https://www.mercadopago.com.uy/developers/es/docs/subscriptions/overview) (preapproval)

---

## Prerequisites

- [Node.js v20.19 or greater](https://nodejs.org/en) (`^20.19.0 || >=22.12.0`)
- [A Medusa backend](https://docs.medusajs.com/learn/installation) on v2.21.0 or greater
- For local testing, you need to expose localhost. You can use [ngrok](https://ngrok.com/)
- Mercado Pago developers setup:
  - [Mercadopago developer account](https://www.mercadopago.com.uy/hub/registration/splitter)
  - [Mercado Pago Checkout API application](https://www.mercadopago.com.uy/developers/panel/app/create-app)
    - Name your app
    - Choose _Pagos Online_ under "Solution Type"
    - Select _Yes_ to ecommerce platform question and select _Otrasplataformas_ from the dropdown
    - Select _CheckoutAPI_ from the "Product to integrate" dropdown
    - Create application. For more information visit [Your Integrations](https://www.mercadopago.com.uy/developers/en/docs/checkout-api/additional-content/your-integrations/introduction)
- Setup Mercado Pago (credentials)[https://www.mercadopago.com.uy/developers/es/docs/your-integrations/credentials]:
  - Generate test credentials and optionally, production credentials.
- Setup Mercado Pago [webhook notifications](https://www.mercadopago.com.uy/developers/es/docs/your-integrations/notifications)
  - Under "Eventos", select _Pagos_. If you use subscriptions, also select _Planes y Suscripciones_ (topics `subscription_preapproval` and `subscription_authorized_payment`)
  - (Optional) Generate a webhook secret. Although it is optional, it is recommended for security purposes.
  - Go to your Medusa backend, run `yarn dev` and in a separate terminal `ngrok http 9000`. If you are serving the backend in a port other than 9000, change the last argument accordingly.
    - Your localhost will be exposed by a URL like: `https://d76b-2800-a4-15d2-2900-1105-b8e5-c64-7697.ngrok-free.app`.
    - Grab the generated URL and go to Mercado Pago webhook configuration. Under "URL para prueba", specify (replacing `ngrok URL` accordingly):
      - `[ngrok URL]/hooks/payment/mercadopago_mercadopago` if you only use one-off card payments
      - `[ngrok URL]/hooks/payment/mercadopago-subscription_mercadopago` if you use subscriptions — the subscription provider also handles the one-off `payment` topic, so this single URL serves both providers (Mercado Pago only allows one webhook URL per application). These are Medusa's standard webhook routes, which process events asynchronously with built-in delay and retries (configurable via the payment module's `webhook_delay` / `webhook_retries` options).
- A frontend that integrates [Payment brick](https://www.mercadopago.com.uy/developers/es/docs/checkout-bricks/payment-brick/introduction). I suggest you clone this [Storefront](https://github.com/NicolasGorga/medusa-payment-mercadopago-storefront)

---

## How to Install

1\. Run the following command in the directory of the Medusa backend using your package manager (for example for npm):

```bash
npm install @nicogorga/medusa-payment-mercadopago
```

2\. Set the following environment variables in `.env`:

```bash
# Access Token available in your Mercado Pago application Test Credentials section
MERCADOPAGO_ACCESS_TOKEN=
# (Optional) Webhook secret available in your Mercado Pago application Webhooks section
MERCADOPAGO_WEBHOOK_SECRET=
```

3\. In `medusa-config.ts` add the following at the end of the `plugins` array in your project config object:

```js
projectConfig: {
  plugins = [
    // ...
    {
      resolve: `@nicogorga/medusa-payment-mercadopago`,
      options: {},
    },
  ];
}
```

4\. In `medusa-config.ts` add the following to the `modules` array in your project config object:

```js
  modules: [
    {
      resolve: '@medusajs/medusa/payment',
      options: {
        providers: [
          {
            resolve: '@nicogorga/medusa-payment-mercadopago/providers',
            id: 'mercadopago',
            options: {
              accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
              webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
            },
            dependencies: [
              ContainerRegistrationKeys.LOGGER,
              Modules.EVENT_BUS
            ]
          }
        ],
      }
    }
  ],
```

The single `providers` entry registers two payment providers that share a common base:

| Provider           | Payment provider id                       | Use case                   |
| ------------------ | ----------------------------------------- | -------------------------- |
| Regular payments   | `pp_mercadopago_mercadopago`              | One-off card payments      |
| Recurring payments | `pp_mercadopago-subscription_mercadopago` | Mercado Pago subscriptions |

Both become selectable at checkout — enable whichever you need per region/payment configuration. They share the `options` block above.

## Subscriptions (recurring payments)

The `mercadopago-subscription` provider creates a [preapproval](https://www.mercadopago.com.uy/developers/es/docs/subscriptions/overview) (a recurring charge mandate) at checkout, reusing the same Payment Brick card tokenization as one-off payments. Mercado Pago's engine then charges the buyer automatically every cycle — no cron or capture logic needed on your side.

### Checkout flow

1. The storefront initiates a payment session for `pp_mercadopago-subscription_mercadopago` when the buyer selects the method (no `data` yet — nothing is created at Mercado Pago).
2. The Payment Brick tokenizes the card. The storefront then **re-initiates the session** through the standard `POST /store/payment-collections/:id/payment-sessions` (`sdk.store.payment.initiatePaymentSession`), passing the subscription config as the session `data`:

```ts
await sdk.store.payment.initiatePaymentSession(cart, {
  provider_id: "pp_mercadopago-subscription_mercadopago",
  data: {
    card_token_id: "<Brick formData.token>",
    payer_email: "buyer@example.com", // optional — falls back to the authenticated customer's email
    reason: "Monthly box", // optional
    auto_recurring: {
      frequency: 1,
      frequency_type: "months", // or "days"; end_date and free_trial also supported
    },
  },
});
```

The provider's `initiatePayment` creates the preapproval with `status: authorized` and `external_reference` = payment session id. Re-initiating a session deletes the previous one, which cancels any stale preapproval automatically. 3. The storefront completes the cart as usual (`placeOrder` → `completeCartWorkflow`); `authorizePayment` verifies the preapproval and the Medusa payment is **authorized**. 4. Mercado Pago creates the first charge asynchronously (it can take minutes to hours). When its webhook reports the charge approved, the Medusa payment flips to **captured**.

Canceling the Medusa payment cancels the whole subscription at Mercado Pago. See [Refunds](#refunds) below.

### Events for your subscription engine

Recurring charges beyond the first have no Medusa payment session, so while handling webhooks the provider re-emits every subscription notification on Medusa's event bus. Subscribe from your own subscription module — the plugin is intentionally not coupled to any:

| Event                                     | Emitted when                                                                           | Payload                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mercadopago.subscription.updated`        | Preapproval created / status change (authorized, paused, cancelled)                    | `{ preapproval_id, session_id, status, next_payment_date, payer_id, transaction_amount, currency_id }`                                                   |
| `mercadopago.subscription.charge.updated` | A recurring charge (invoice) is created or updated — every cycle, approved or rejected | `{ preapproval_id, session_id, invoice_id, status, payment: { id, status, status_detail }, transaction_amount, currency_id, debit_date, retry_attempt }` |

`session_id` is the Medusa payment session id used at checkout — correlate it (or `preapproval_id`, stored in the payment's `data`) with your own subscription records. Event names and payload types are exported from the package (`MercadopagoSubscriptionEvents`, `SubscriptionUpdatedEventPayload`, `SubscriptionChargeEventPayload`).

> [!NOTE]
> Delivery is **at-least-once**: Mercado Pago re-sends webhooks and Medusa's webhook subscriber retries failed events, so the same notification can produce duplicate events. Deduplicate in your subscriber — e.g. key on `invoice_id` + `status` for charges, `preapproval_id` + `status` for subscription updates.

Example subscriber:

```ts
// src/subscribers/mp-subscription-charge.ts
import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { SubscriptionChargeEventPayload } from "@nicogorga/medusa-payment-mercadopago/types";

export default async function chargeHandler({
  event: { data },
}: SubscriberArgs<SubscriptionChargeEventPayload>) {
  // e.g. create a new order for this cycle, or flag a failed charge
}

export const config: SubscriberConfig = {
  event: "mercadopago.subscription.charge.updated",
};
```

### Refunds

Use Medusa's standard refund (admin UI or the payment module's `refundPayment`) — the provider maps it to refunding the **most recent** charged cycle at Mercado Pago (partial amounts supported). Only the checkout cycle has a Medusa payment record, so older cycles are refunded directly at Mercado Pago (dashboard or [refunds API](https://www.mercadopago.com.uy/developers/es/reference/chargebacks/_payments_id_refunds/post)) using the `payment.id` from the `mercadopago.subscription.charge.updated` event.

### Testing subscriptions

Subscriptions have stricter test-mode requirements than one-off payments:

1. In your Mercado Pago application, create **two test users** (Test accounts section): a **seller** and a **buyer**.
2. Log into the **seller test user** (use an incognito window), open its own developer panel and use its Access Token as `MERCADOPAGO_ACCESS_TOKEN` and its Public Key in the storefront.
3. Configure the webhook (URL + secret) **inside the seller test user's application**, pointing at your ngrok URL `/hooks/payment/mercadopago-subscription_mercadopago`, with the payment + subscription topics enabled. Re-check after every ngrok restart.
4. `payer_email` must be the **buyer test user's email** (it must differ from the seller's). Checkout as guest or with a Medusa customer whose email matches the buyer test user.
5. Use [test cards](https://www.mercadopago.com.uy/developers/es/docs/checkout-api/additional-content/your-integrations/test/cards) — cardholder name `APRO` approves, `OTHE` rejects.
6. After checkout, verify the preapproval in the seller test user's [subscriptions panel](https://www.mercadopago.com.uy/subscriptions), and expect the first charge webhook within minutes to a few hours.

Deferred for now (contributions welcome): redirect-based authorization via `init_point` (subscription without card token), preapproval plans (`preapproval_plan_id`).

---

## Test the Plugin

1\. Run the following command in the directory of the Medusa backend to run the backend:

```bash
npm run dev
```

2\. Enable Mercadopago in a [region in the admin](https://docs.medusajs.com/resources/references/payment/provider#5-test-it-out). Alternatively, you can use the [Admin APIs](https://docs.medusajs.com/api/admin#regions_postregionsid).

3\. Place an order using a frontend that collects payment data using [Mercadopago Payment brick](https://www.mercadopago.com.uy/developers/es/docs/checkout-bricks/payment-brick/introduction) like [this](https://github.com/NicolasGorga/medusa-payment-mercadopago-storefront). Send a POST to `localhost:9000/store/mercadopago/payment` with a body that adheres to [validator](https://github.com/NicolasGorga/medusa-payment-mercadopago/blob/master/src/api/store/mercadopago/payment/validators.ts)

---

## Additional Resources

- [Mercado Pago Online Payments Docs](https://www.mercadopago.com.uy/developers/es/docs#online-payments)
