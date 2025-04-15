import {
  useQueryGraphStep,
  useRemoteQueryStep,
} from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { PaymentCreateRequest } from "mercadopago/dist/clients/payment/create/types";
import {
  AccountHolderDTO,
  AdminPaymentSession,
  CreatePaymentMethodDTO,
  CustomerDTO,
  PaymentSessionDTO,
} from "@medusajs/framework/types";
import {
  validateTransactionAmountStep,
  ValidateTransactionStepInput,
} from "../steps/validate-transaction-amount";
import { createPaymentStep } from "../steps/create-payment";
import { createPaymentMethodStep } from "../steps/create-payment-method";

type CreatePaymentWorkflowInput = {
  paymentSessionId: string;
  paymentData: PaymentCreateRequest;
  customerId?: string;
};

export const createMercadopagoPaymentWorkflow = createWorkflow(
  "create-mercadopago-payment",
  ({
    paymentSessionId,
    paymentData,
    customerId,
  }: CreatePaymentWorkflowInput) => {
    //@ts-ignore
    const { data: paymentSessions } = useQueryGraphStep({
      entity: "payment_session",
      fields: ["amount", "provider_id"],
      filters: {
        id: paymentSessionId,
      },
      options: {
        throwIfKeyNotFound: true,
      },
    }).config({
      name: "get-payment-session",
    });

    const paymentSession = transform(
      { paymentSessions },
      ({ paymentSessions }) =>
        paymentSessions[0] as unknown as PaymentSessionDTO
    );

    when({ customerId }, ({ customerId }) => !!customerId).then(() => {
      const customerQuery = useQueryGraphStep({
        entity: "customer",
        fields: [
          "id",
          "email",
          "company_name",
          "first_name",
          "last_name",
          "phone",
          "addresses.*",
          "account_holder.*",
          "metadata",
        ],
        filters: { id: customerId },
      }).config({ name: "get-customer" });



      const customer: CustomerDTO & { account_holder: AccountHolderDTO } = transform({ customerQuery }, ({ customerQuery }) => {
        return customerQuery.data[0]
      })

      const paymentCustomer = transform({ customer }, (data) => {
        return {
          ...data.customer,
          billing_address:
            data.customer.addresses?.find((a) => a.is_default_billing) ??
            data.customer.addresses?.[0],
        };
      });

      const paymentMethodInput = transform({ paymentSession, paymentCustomer, customer, paymentData }, ({ paymentSession, paymentCustomer, customer, paymentData }) => {
        return {
          provider_id: paymentSession.provider_id,
          data: paymentData,
          context: {
            account_holder: customer.account_holder,
            customer: paymentCustomer,
            idempotency_key: paymentData.token,
          },
        };
      });

      createPaymentMethodStep(paymentMethodInput);
    });

    const validateTransactionStepInput: ValidateTransactionStepInput =
      transform(
        { paymentSession, paymentData },
        ({ paymentSession, paymentData }) => ({
          medusaAmount: Number(paymentSession.amount),
          transactionAmount: paymentData.transaction_amount ?? 0,
        })
      );

    validateTransactionAmountStep(validateTransactionStepInput);

    return new WorkflowResponse(
      createPaymentStep({ paymentSessionId, paymentData })
    );
  }
);
