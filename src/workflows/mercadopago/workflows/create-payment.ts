import { useQueryGraphStep } from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  AccountHolderDTO,
  PaymentCustomerDTO,
} from "@medusajs/framework/types";
import {
  validateTransactionAmountStep,
  ValidateTransactionStepInput,
} from "../steps/validate-transaction-amount";
import { createPaymentStep } from "../steps/create-payment";
import { createPaymentMethodStep } from "../steps/create-payment-method";
import { PostStoreMercadopagoPaymentType } from "../../../api/store/mercadopago/payment/validators";

type CreatePaymentWorkflowInput = {
  paymentSessionId: string;
  paymentData: PostStoreMercadopagoPaymentType["paymentData"];
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
    const { data: paymentSession } = useQueryGraphStep({
      entity: "payment_session",
      fields: ["amount", "provider_id"],
      filters: {
        id: paymentSessionId,
      },
      options: {
        throwIfKeyNotFound: true,
        isList: false,
      },
    }).config({
      name: "get-payment-session",
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

    const updatedPaymentSession = createPaymentStep({
      paymentSessionId,
      paymentData,
    });

    const { data: customer } = useQueryGraphStep({
      entity: "customer",
      fields: [
        "id",
        "email",
        "company_name",
        "first_name",
        "last_name",
        "phone",
        "addresses.*",
        "account_holders.*",
        "metadata",
      ],
      filters: { id: customerId },
      options: { isList: false },
    }).config({ name: "get-customer" });

	const existentAccountHolder = transform({ customer, paymentSession }, ({ customer, paymentSession }) => {
		return customer.account_holders?.filter(accountHolder => accountHolder.provider_id === paymentSession.provider_id)?.[0] as AccountHolderDTO | undefined
	})

	when({ customerId, customer, existentAccountHolder }, (data) => {
		return !!data.customerId && !!data.customer && !!data.existentAccountHolder
	}).then(() => {
		const paymentCustomer = transform({ customer }, (data) => {
			return {
			  ...data.customer,
			  billing_address:
				data.customer.addresses?.find((a) => a.is_default_billing) ??
				data.customer.addresses?.[0] ?? null,
			};
		  }) as PaymentCustomerDTO;

		const accountHolderPaymentMethodsInput = transform(
			{ paymentSession, paymentCustomer, paymentData, existentAccountHolder },
			({ paymentSession, paymentCustomer, existentAccountHolder, paymentData }) => {
			  return {
				provider_id: paymentSession.provider_id,
				data: paymentData,
				context: {
				  account_holder: existentAccountHolder,
				  customer: paymentCustomer,
				  idempotency_key: paymentData.token,
				},
			  };
			}
		  );

		  createPaymentMethodStep(accountHolderPaymentMethodsInput).config({
			continueOnPermanentFailure: true,
		  });
	})

    return new WorkflowResponse(
      updatedPaymentSession
    );
  }
);
