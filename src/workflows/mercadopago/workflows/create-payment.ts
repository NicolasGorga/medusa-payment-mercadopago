import {
  useQueryGraphStep,
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
  CustomerDTO,
  PaymentCustomerDTO,
  PaymentSessionDTO,
  UpdateAccountHolderDTO,
} from "@medusajs/framework/types";
import {
  validateTransactionAmountStep,
  ValidateTransactionStepInput,
} from "../steps/validate-transaction-amount";
import { createPaymentStep } from "../steps/create-payment";
import { createPaymentMethodStep } from "../steps/create-payment-method";
import { udpateAccountHolderStep } from "../steps/update-account-holder";
import { CustomerResponse } from "mercadopago/dist/clients/customer/commonTypes";
import { PostStoreMercadopagoPaymentType } from "../../../api/store/mercadopago/payment/validators";

type CreatePaymentWorkflowInput = {
  paymentSessionId: string;
  paymentData: PostStoreMercadopagoPaymentType['paymentData'];
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

    const validateTransactionStepInput: ValidateTransactionStepInput =
      transform(
        { paymentSession, paymentData },
        ({ paymentSession, paymentData }) => ({
          medusaAmount: Number(paymentSession.amount),
          transactionAmount: paymentData.transaction_amount ?? 0,
        })
      );

    validateTransactionAmountStep(validateTransactionStepInput);

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
        "account_holders.*",
        "metadata",
      ],
      filters: { id: customerId },
    }).config({ name: "get-customer" });

    const customer: (CustomerDTO & { account_holders: AccountHolderDTO[] }) | undefined = transform({ customerQuery }, ({ customerQuery }) => {
      return customerQuery.data[0]
    })

    const paymentCustomer = transform({ customer }, (data) => {
      return {
        ...data.customer,
        billing_address:
          data.customer?.addresses?.find((a) => a.is_default_billing) ??
          data.customer?.addresses?.[0] ?? null,
      };
    }) as PaymentCustomerDTO;

    const accountHolderPaymentMethodsInput = transform({ paymentSession, paymentCustomer, customer, paymentData }, ({ paymentSession, paymentCustomer, customer, paymentData }) => {
      return {
        provider_id: paymentSession.provider_id,
        data: paymentData,
        context: {
          account_holder: customer?.account_holders.filter(holder => holder.provider_id === 'pp_mercadopago_mercadopago')[0],
          customer: paymentCustomer,
          idempotency_key: paymentData.token,
        },
      };
    });

    when({ accountHolderPaymentMethodsInput, customer }, (input) => 
      !!input.customer
    ).then(() => {
      createPaymentMethodStep(accountHolderPaymentMethodsInput).config({
        // until this pull request is released, this won't continue on failure. See: https://github.com/medusajs/medusa/pull/12027
        continueOnPermanentFailure: true,
      });
    })

    when({ accountHolderPaymentMethodsInput }, (input) => {
      const accountHolderData = input.accountHolderPaymentMethodsInput.context.account_holder?.data as unknown as CustomerResponse
      const payerData = input.accountHolderPaymentMethodsInput.data.payer
      // Only update identification when the data we get is for a non saved card
      // saved cards will not hold identification property
      return 'identification' in payerData && payerData.identification?.number !== accountHolderData?.identification?.number
    }
    ).then(() => {
      const updateInput = transform({ accountHolderPaymentMethodsInput }, ({ accountHolderPaymentMethodsInput: { context, data, provider_id } }) => {
        context.account_holder!.data = {
          ...context.account_holder!.data,
          //@ts-expect-error when condition guarantees type
          identification: data.payer.identification
        }

        return {
          id: context.account_holder!.id,
          provider_id,
          context,
          }
        }
      ) as UpdateAccountHolderDTO

      udpateAccountHolderStep(updateInput).config({
        // until this pull request is released, this won't continue on failure. See: https://github.com/medusajs/medusa/pull/12027
        continueOnPermanentFailure: true,
      });
    })

    return new WorkflowResponse(
      createPaymentStep({ paymentSessionId, paymentData })
    );
  }
);
