# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 0.4.0 - 2026-09-14
### Added
- Recurring payments via Mercado Pago Subscriptions (preapproval) through the new `mercadopago-subscription` provider (`pp_mercadopago-subscription_mercadopago`): the client passes the Payment Brick card token and `auto_recurring` config as session `data` when (re)initiating the payment session, `initiatePayment` creates the preapproval (amount/currency always taken from the session), and the regular cart completion authorizes it. The payment captures when the first charge webhook arrives.
- Webhooks flow through Medusa's standard `/hooks/payment/mercadopago-subscription_<id>`. The subscription provider handles all Mercado Pago topics — it maps subscription notifications itself and delegates the `payment` topic to the card implementation — so one webhook URL serves both providers (Mercado Pago allows a single URL per application). While handling them it re-emits `mercadopago.subscription.updated` and `mercadopago.subscription.charge.updated` on the event bus (at-least-once delivery) so any subscription engine can consume recurring charge outcomes.
- Medusa's standard refund on a subscription payment refunds the most recent charged cycle at Mercado Pago; older cycles are refunded directly at Mercado Pago using the payment id from the charge events.
- `/types` package export with the event names and payload types.

### Changed
- Restructured the plugin around a shared `MercadopagoBase` so it can expose multiple payment providers: a regular card provider (`mercadopago`) and a new recurring/subscription provider (`mercadopago-subscription`). Both are registered from a single entry point and become independently selectable at checkout.
  - **BREAKING:** the provider `resolve` path changed from `@nicogorga/medusa-payment-mercadopago/providers/mercado-pago` to `@nicogorga/medusa-payment-mercadopago/providers`. Update the `providers` array in `medusa-config` accordingly. The regular provider keeps its id (`mercadopago`), so existing payment provider ids (`pp_mercadopago_mercadopago`) are unchanged.
- The create-payment workflow step now resolves the provider from the payment session's `provider_id` instead of a hardcoded id.
- **Chore:** upgraded to Medusa 2.21.0 (from 2.16.0). Peer dependencies now require `@medusajs/*` 2.21.0 and `@medusajs/ui` 4.2.4, and `engines.node` is `^20.19.0 || >=22.12.0` to match the Node floor Medusa 2.19 introduced with Vite 7.
  - Note for consumers: since Medusa 2.20, `createPaymentSessionsWorkflow` rejects a `provider_id` that is not enabled in the cart's region, so both `pp_mercadopago_mercadopago` and `pp_mercadopago-subscription_mercadopago` must be linked to every region that offers them.

## 0.3.0 - 2026-06-22
### Added
- Upgraded to Medusa 2.16.0

## 0.2.6 - 2025-10-22
### Added
- Upgraded to Medusa 2.11.0

### Fixed
- Error caused when trying to save a payment method when an account holder isn't available, like on guest checkout flow

## 0.2.5 - 2025-05-19
### Changed
- cancelPayment now checks MP status, to correctly decide if we shold cancel (an authorized payment) or refund (a captured payment)

### Fixed
- Corrected getIdOrThrow utility function, which was causing problems due to incorrect type check

## 0.2.4 - 2025-05-13
### Fixed
- Correct response body of create payment endpoint

## 0.2.3 - 2025-05-13

## 0.2.2 - 2025-05-13
### Added
- Check if creating customer in MP fails because it already exists and if so, store it in Medusa

### Fixed
- Fix authorizePayment, getting the approved payment in case of multiple attempts

## 0.2.1 - 2025-05-12
### Added
- New function to get a sanitized error message, based on the status and status_detail retuned in Mercado Pago PaymentResponse object
- Throw in /store/mercadopago/payment with sanitized error message if payment is rejected

## 0.2.0 - 2025-04-17
### Added
- Upgraded to Medusa 2.7.0
- Implemented createAccountHolder, updateAccountHolder and savePaymentMethods
- Added try / catch block to savePaymentMethods method, since for some payment methods i saw it randomly failing. Also, when the card is already saved, trying to save it again raises a strange error (previously this didn't happened). Opened a ticket with Mercado Pago to find the root cause of this. Ideally, when this pull request https://github.com/medusajs/medusa/pull/12027 is merged, i will remove this try / catch block, and leave the config continueOnPermanentFailure at the createPayment workflow level.
- Created /store/mercadopago/payment-methods GET endpoint to get a list of savedPaymentMethods for the logged in user

## 0.1.2 - 2025-04-15

## 0.1.1 - 2025-04-12
### Added
- Upgraded to Medusa 2.6.1
- Added Changelog and automatic releases
- Corrected Readme
- Fixed race condition between completeCartWorkflow and getWebhookActionAndData that caused payment.data to be cleared
