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

---

## Redsys Payment Provider

Receive payments on your Medusa commerce application using Redsys, a popular payment gateway in Spain.

> [!WARNING]
> This plugin is currently under development. Ensure you test thoroughly in the Redsys test environment before enabling it for live transactions.

### Features

-   **Redsys Redirect Integration**: Initiates payments by redirecting the customer to the Redsys payment page.
-   **Webhook Notifications**: Handles asynchronous payment status updates from Redsys via a dedicated notification endpoint.
-   **Signature Validation**: Validates incoming notifications using the shared secret key to ensure authenticity.

### Prerequisites

-   **Node.js v20 or greater**.
-   **A Medusa backend**.
-   **Redsys Merchant Account**: You must have an active merchant account with Redsys. This will provide you with:
    -   Merchant Code (Código FUC)
    -   Terminal Number
    -   Secret Encryption Key (Clave secreta de encriptación SHA-256)
-   **Redsys Admin Panel Configuration**:
    -   **Notification URL (URL de Notificación HTTP)**: You need to configure the "URL de Notificación HTTP" in your Redsys merchant admin panel to point to your Medusa backend's Redsys notification endpoint. The URL will be:
        `https://<your-medusa-backend-url>/store/redsys/notification`
        (Replace `<your-medusa-backend-url>` with the actual URL of your deployed Medusa backend). Redsys will send POST requests to this URL to notify Medusa about transaction outcomes. Ensure your backend is accessible from the internet for Redsys to reach this endpoint. For local testing, use a tunneling service like [ngrok](https://ngrok.com/).

### How to Install and Configure

1.  **Install the Plugin Package** (Assuming the plugin is published or installed locally):
    If this Redsys provider were part of the same `@nicogorga/medusa-payment-mercadopago` package (which it is, as per this project structure), the installation is already covered. If it were a separate package, you'd install it:
    ```bash
    # Example if it was a separate package:
    # npm install medusa-payment-redsys
    # yarn add medusa-payment-redsys
    ```

2.  **Set Environment Variables**:
    Add the following environment variables to your `.env` file. Obtain these credentials from your Redsys merchant account.

    ```bash
    REDSYS_MERCHANT_CODE=your_fuc_code_here
    REDSYS_SECRET_KEY=your_sha256_secret_key_here
    REDSYS_TERMINAL=your_terminal_number_here # Usually "1" or "001"
    REDSYS_ENVIRONMENT=test # Use 'live' for production
    # Optional: Default merchant name
    REDSYS_MERCHANT_NAME="My Medusa Store"
    # Optional: Default currency for Redsys (e.g., EUR)
    REDSYS_CURRENCY="EUR"
    # Optional: Your Medusa backend's root URL for constructing notification/return URLs if not hardcoded
    # MEDUSA_BACKEND_URL=https://api.yourstore.com
    ```

3.  **Configure in `medusa-config.js`**:
    Add the Redsys provider configuration to the `payment` module in your `medusa-config.js` (or `medusa-config.ts`):

    ```javascript
    // In medusa-config.js or medusa-config.ts

    const modules = [
      // ... other modules
      {
        resolve: "@medusajs/medusa/payment", // or your specific payment module path
        options: {
          providers: [
            // ... other payment providers like mercadopago
            {
              resolve: "@nicogorga/medusa-payment-mercadopago/providers/redsys", // Adjust path to where RedsysProviderService is exported
              id: "redsys", // Unique identifier for this provider
              options: {
                merchantCode: process.env.REDSYS_MERCHANT_CODE,
                secretKey: process.env.REDSYS_SECRET_KEY,
                terminal: process.env.REDSYS_TERMINAL,
                environment: process.env.REDSYS_ENVIRONMENT, // 'test' or 'live'
                // Optional parameters:
                merchantName: process.env.REDSYS_MERCHANT_NAME || "My Medusa Store",
                currency: process.env.REDSYS_CURRENCY || "EUR", // Default currency for Redsys
                // The notification URL is handled by the Medusa endpoint, but you might need to pass your backend base URL
                // if the provider needs to construct full URLs or for other specific return URLs.
                // urlNotification: `https://<your-backend-url>/store/redsys/notification`, (Ensure this matches your actual setup)
                // urlResponse: `https://<your-frontend-url>/order/confirmed`, (Example return URL for customer)
              },
              dependencies: [
                "logger", // Assuming logger is a dependency for RedsysProviderService
                // Add other dependencies if RedsysProviderService requires them
              ],
            },
          ],
        },
      },
    ];

    // Make sure to export the projectConfig with these modules
    // export const projectConfig = {
    //   // ... other configs
    //   modules,
    // };
    ```

    **Explanation of Options:**
    *   `merchantCode` (Código FUC): Your unique merchant identifier provided by Redsys.
    *   `secretKey`: The SHA-256 secret key used for signing and verifying requests and responses. **Crucial for security.**
    *   `terminal`: The terminal number assigned by Redsys (often "1").
    *   `environment`: Set to `"test"` for the Redsys test environment or `"live"` for production.
    *   `merchantName` (Optional): The name of your store displayed on the Redsys payment page.
    *   `currency` (Optional): Default currency to be used if not specified per transaction (e.g., "EUR"). Redsys uses numeric codes in transactions (978 for EUR).
    *   `urlNotification`: While the endpoint is fixed (`/store/redsys/notification`), you might need to configure the full URL in your Redsys admin panel. The provider itself doesn't usually need this option if Medusa handles routing.
    *   `urlResponse`: The URL the user is redirected to after completing payment on Redsys. This is usually a page on your frontend.

### Functionality & Limitations

*   **Payment Initiation**: The provider generates the necessary parameters and redirects the user to the Redsys secure payment page.
*   **Notification Handling**: It processes asynchronous notifications from Redsys to update payment statuses in Medusa. This includes handling successful payments, errors, and potentially other states if Redsys sends them.
*   **Manual Operations**:
    *   **Refunds**: Refunds must be initiated manually from your Redsys merchant dashboard. Once Redsys processes the refund and sends a notification (if configured for refunds), Medusa will update the payment status accordingly.
    *   **Cancellations (Voids)**: Similar to refunds, voiding an authorized (but not yet captured/settled) transaction, or cancelling a captured one (which might be treated as a type of refund by Redsys), must typically be done via the Redsys merchant dashboard. Medusa will reflect the change upon receiving a notification.

### Test the Plugin

1.  **Run your Medusa Backend**:
    ```bash
    npm run dev
    # or
    yarn dev
    ```
2.  **Enable Redsys**: In your Medusa Admin, navigate to Settings > Regions, select a region, and enable the "redsys" payment provider.
3.  **Redsys Test Environment**: Ensure your Redsys account is configured for the test environment and you have test card numbers provided by Redsys.
4.  **Initiate Payment**: Using your storefront, proceed to checkout and select Redsys as the payment method. You should be redirected to the Redsys test payment page.
5.  **Simulate Payment**: Use Redsys test card details to simulate a successful payment, a failed payment, etc.
6.  **Check Notifications**: Verify that your Medusa backend receives the notification at `/store/redsys/notification` and that the payment status is updated correctly in Medusa (e.g., order is marked as paid). You might need to use a tunneling service like ngrok to expose your local endpoint to Redsys for testing.

Remember to switch `environment` to `"live"` and use your live Redsys credentials when you are ready to go into production.