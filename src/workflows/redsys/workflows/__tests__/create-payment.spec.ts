import { createRedsysPaymentWorkflow } from "../create-payment";
import { WorkflowResponse } from "@medusajs/framework/workflows-sdk";

// Mock steps and core workflow utilities
const mockUseQueryGraphStep = jest.fn();
const mockTransform = jest.fn((data, cb) => cb(data)); // Simple pass-through for transform
const mockValidateTransactionAmountStep = jest.fn();
const mockCreateRedsysPaymentStep = jest.fn();

// Mock the actual implementations of steps and workflow building blocks
jest.mock("@medusajs/medusa/core-flows", () => ({
  ...jest.requireActual("@medusajs/medusa/core-flows"), // Import and retain default behavior
  useQueryGraphStep: (...args) => mockUseQueryGraphStep(...args),
}));

// For transform, we often want to see what data it's processing.
// A more sophisticated mock or spy might be needed if complex transformations are tested.
jest.mock("@medusajs/framework/workflows-sdk", () => ({
  ...jest.requireActual("@medusajs/framework/workflows-sdk"),
  transform: (deps, transformer) => {
    // This mock allows us to call the actual transformer function
    // while also spying on the call to transform itself.
    // We can't directly mock `transform` and also use it in the workflow definition easily.
    // So, we rely on testing the output of the transformer via the step inputs.
    return transformer(deps);
  },
  // `when` is not used in the simplified Redsys workflow, so not mocked for now.
  // If it were, it would be: when: jest.fn().mockReturnValue({ then: jest.fn() }),
}));


// Mock our custom steps
jest.mock("../../../steps/validate-transaction-amount", () => ({
  validateTransactionAmountStep: jest.fn((...args) => mockValidateTransactionAmountStep(...args)),
}));

jest.mock("../../steps/create-redsys-payment", () => ({
  createRedsysPaymentStep: jest.fn((...args) => mockCreateRedsysPaymentStep(...args)),
}));


describe("createRedsysPaymentWorkflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockUseQueryGraphStep.mockImplementation(() => ({
        config: jest.fn().mockReturnThis(), // Allow .config() to be chained
        data: [{ id: "payses_123", amount: 1000, provider_id: "pp_redsys", data: { currency_code: "EUR"} }]
    }));
    mockCreateRedsysPaymentStep.mockReturnValue({ someRedsysData: "mockOutput" }); // Mock output of the final step
  });

  it("should invoke steps in order and return expected response", async () => {
    const input = {
      paymentSessionId: "payses_123",
      paymentData: { Ds_Merchant_Amount: "1000" }, // Example, might differ
      customerId: "cus_abc",
    };

    // The workflow is a function that we call with the input.
    // It's already wrapped by createWorkflow from the actual file.
    const result = await createRedsysPaymentWorkflow(input);

    // 1. Verify get-payment-session step (useQueryGraphStep)
    expect(mockUseQueryGraphStep).toHaveBeenCalledWith({
      entity: "payment_session",
      fields: ["amount", "provider_id", "data"],
      filters: {
        id: input.paymentSessionId,
        // provider_id: "pp_redsys", // This was commented out in the workflow
      },
      options: {
        throwIfKeyNotFound: true,
      },
    });

    // 2. Verify validateTransactionAmountStep
    // The input to this step is transformed. We check if the mock was called,
    // implying the transform logic (which is part of the workflow definition, not a separate mock here)
    // produced something that was then passed to the step.
    expect(mockValidateTransactionAmountStep).toHaveBeenCalled();
    // More detailed check on the input to validateTransactionAmountStep:
    // The actual transform function is: ({ paymentSession, paymentData }) => ({ medusaAmount: Number(paymentSession.amount), transactionAmount: paymentData?.Ds_Merchant_Amount ? Number(paymentData.Ds_Merchant_Amount) : Number(paymentSession.amount) })
    // Given mockUseQueryGraphStep returns amount: 1000 and input.paymentData.Ds_Merchant_Amount is "1000"
    expect(mockValidateTransactionAmountStep).toHaveBeenCalledWith(
        expect.objectContaining({
            medusaAmount: 1000,
            transactionAmount: 1000,
        })
    );

    // 3. Verify createRedsysPaymentStep
    // Input to this step is also transformed.
    expect(mockCreateRedsysPaymentStep).toHaveBeenCalled();
    // The actual transform function is: (data) => { return { paymentSessionId: data.paymentSession.id, providerId: data.paymentSession.provider_id, amount: data.paymentSession.amount, currencyCode: data.paymentSession.data?.currency_code ?? "", customerId: data.customerId, context: data.paymentSession.data }; }
    // Given mockUseQueryGraphStep data for paymentSession
    expect(mockCreateRedsysPaymentStep).toHaveBeenCalledWith(
        expect.objectContaining({
            paymentSessionId: "payses_123",
            providerId: "pp_redsys",
            amount: 1000,
            currencyCode: "EUR",
            customerId: "cus_abc",
            context: { currency_code: "EUR" },
        })
    );

    // 4. Verify overall workflow response
    // The workflow is defined to return `new WorkflowResponse(createRedsysPaymentStep(...))`
    expect(result).toBeInstanceOf(WorkflowResponse);
    // The constructor of WorkflowResponse is called with the raw output of createRedsysPaymentStep
    expect(result.result).toEqual({ someRedsysData: "mockOutput" });
  });

  it("should handle missing Ds_Merchant_Amount in paymentData for validation step", async () => {
    const input = {
      paymentSessionId: "payses_123",
      paymentData: {}, // No Ds_Merchant_Amount
      customerId: "cus_abc",
    };
    mockUseQueryGraphStep.mockImplementation(() => ({
        config: jest.fn().mockReturnThis(),
        data: [{ id: "payses_123", amount: 1200, provider_id: "pp_redsys", data: {currency_code: "EUR"} }]
    }));

    await createRedsysPaymentWorkflow(input);

    expect(mockValidateTransactionAmountStep).toHaveBeenCalledWith(
        expect.objectContaining({
            medusaAmount: 1200,
            transactionAmount: 1200, // Should fallback to paymentSession.amount
        })
    );
  });

   it("should handle missing currency_code in payment session data", async () => {
    const input = {
      paymentSessionId: "payses_123",
      paymentData: {},
      customerId: "cus_abc",
    };
    mockUseQueryGraphStep.mockImplementation(() => ({
        config: jest.fn().mockReturnThis(),
        data: [{ id: "payses_123", amount: 1200, provider_id: "pp_redsys", data: {} }] // No currency_code
    }));

    await createRedsysPaymentWorkflow(input);

    expect(mockCreateRedsysPaymentStep).toHaveBeenCalledWith(
        expect.objectContaining({
            currencyCode: "", // Should default to empty string
            context: {}
        })
    );
  });

});
