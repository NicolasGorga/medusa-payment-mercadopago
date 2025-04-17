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

---

## Prerequisites

- [Node.js v20 or greater](https://nodejs.org/en)
- [A Medusa backend](https://docs.medusajs.com/learn/installation)
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
- Setup Mercado Pago [webhok notifications](https://www.mercadopago.com.uy/developers/es/docs/your-integrations/notifications)
  - Under "Eventos", select _Pagos_
  - (Optional) Generate a webhook secret. Although it is optional, it is recommended for security purposes.
  - Go to your Medusa backend, run `yarn dev` and in a separate terminal `ngrok http 9000`. If you are serving the backend in a port other than 9000, change the last argument accordingly.
    - Your localhost will be exposed by a URL like: `https://d76b-2800-a4-15d2-2900-1105-b8e5-c64-7697.ngrok-free.app`.
    - Grab the generated URL and go to Mercado Pago webhook configuration. Under "URL para prueba", specify `[ngrok URL]/hooks/payment/mercadopago_mercadopago`, replaceing `ngrok URL` accordingly
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
      options: {
        accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
        webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
      },
    },
  ]
  }
  ```

4\.  In `medusa-config.ts` add the following to the `modules` array in your project config object:

```js
  modules: [
    {
      resolve: '@medusajs/medusa/payment',
      options: {
        providers: [
          {
            resolve: '@nicogorga/medusa-payment-mercadopago/providers/mercado-pago',
            id: 'mercadopago',
            options: {
              accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
              webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
            },
            dependencies: [
              ContainerRegistrationKeys.LOGGER
            ]
          }
        ],
      }
    }
  ],
```

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