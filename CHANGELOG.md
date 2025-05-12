# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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
