import RedsysProviderService from "../service";
import { PaymentProcessorError, PaymentSessionStatus, Logger } from "@medusajs/medusa";

// Mock the Redsys class from redsys-easy
const mockCreatePaymentParameters = jest.fn();
const mockGetRedirectUrl = jest.fn();
const mockCheckNotificationSignature = jest.fn();
const mockDecodeMerchantParameters = jest.fn();

jest.mock("redsys-easy", () => {
  return {
    Redsys: jest.fn().mockImplementation(() => {
      return {
        createPaymentParameters: mockCreatePaymentParameters,
        getRedirectUrl: mockGetRedirectUrl,
        checkNotificationSignature: mockCheckNotificationSignature,
        decodeMerchantParameters: mockDecodeMerchantParameters,
      };
    }),
  };
});

const validOptions = {
  kc: "test_kc",
  secretKey: "test_secret",
  terminal: "1",
  environment: "test" as "test" | "live",
  currency: "EUR",
  merchantUrl: "https://test.com/notification",
  returnUrl: "https://test.com/return",
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;


describe("RedsysProviderService", () => {
  let service: RedsysProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RedsysProviderService({ logger: mockLogger }, validOptions);
  });

  describe("validateOptions", () => {
    it("should not throw for valid options", () => {
      expect(() => RedsysProviderService.validateOptions(validOptions)).not.toThrow();
    });

    it("should throw if kc is missing", () => {
      expect(() => RedsysProviderService.validateOptions({ ...validOptions, kc: undefined })).toThrow(
        new PaymentProcessorError("Redsys option 'kc' (Merchant Code) is required.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT)
      );
    });
    it("should throw if secretKey is missing", () => {
       expect(() => RedsysProviderService.validateOptions({ ...validOptions, secretKey: undefined })).toThrow(
        new PaymentProcessorError("Redsys option 'secretKey' is required.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT)
      );
    });
     it("should throw if terminal is missing", () => {
       expect(() => RedsysProviderService.validateOptions({ ...validOptions, terminal: undefined })).toThrow(
        new PaymentProcessorError("Redsys option 'terminal' is required.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT)
      );
    });
    it("should throw if environment is invalid", () => {
       expect(() => RedsysProviderService.validateOptions({ ...validOptions, environment: "prod" as any })).toThrow(
        new PaymentProcessorError("Redsys option 'environment' must be either 'test' or 'live'.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT)
      );
    });
  });

  describe("constructor", () => {
    it("should initialize Redsys client with correct options", () => {
      expect(require("redsys-easy").Redsys).toHaveBeenCalledWith(validOptions);
    });
     it("should throw if options are invalid on construction", () => {
      const invalidOptions = { ...validOptions, kc: undefined };
      expect(() => new RedsysProviderService({ logger: mockLogger }, invalidOptions as any)).toThrow(
         new PaymentProcessorError("Redsys option 'kc' (Merchant Code) is required.", PaymentProcessorError.PaymentProcessorErrors.INVALID_ARGUMENT)
      );
    });
  });

  describe("initiatePayment", () => {
    it("should call createPaymentParameters and return session_data", async () => {
      const mockPaymentParams = { Ds_SignatureVersion: "test_version", Ds_MerchantParameters: "params", Ds_Signature: "sig" };
      const mockRedirectUrl = "https://redsys.example.com/pay";
      mockCreatePaymentParameters.mockReturnValue(mockPaymentParams);
      mockGetRedirectUrl.mockReturnValue(mockRedirectUrl);

      const context = {
        amount: 1000, // 10.00 EUR in cents
        currency_code: "EUR",
        resource_id: "cart_123",
        customer: { email: "customer@test.com" },
        context: {},
        paymentSessionData: {},
      };
      const result = await service.initiatePayment(context as any);

      expect(mockCreatePaymentParameters).toHaveBeenCalledWith({
        amount: 1000,
        order: "cart_123",
        merchantName: "My Medusa Store",
        productDescription: "Payment for order cart_123",
        holder: "customer@test.com",
      });
      expect(result.session_data).toEqual({
        ...mockPaymentParams,
        url: mockRedirectUrl,
      });
    });
  });

  describe("getPaymentStatus", () => {
    it("should return AUTHORIZED for response codes 0-99", async () => {
      const status = await service.getPaymentStatus({ Ds_Response: "0" });
      expect(status).toBe(PaymentSessionStatus.AUTHORIZED);
    });
    it("should return CANCELED for response code 900 (refund)", async () => {
      const status = await service.getPaymentStatus({ Ds_Response: "900" });
      expect(status).toBe(PaymentSessionStatus.CANCELED);
    });
    it("should return CANCELED for response code 400 (void/cancelled)", async () => {
      const status = await service.getPaymentStatus({ Ds_Response: "400" });
      expect(status).toBe(PaymentSessionStatus.CANCELED);
    });
    it("should return ERROR for response codes >= 100", async () => {
      const status = await service.getPaymentStatus({ Ds_Response: "101" });
      expect(status).toBe(PaymentSessionStatus.ERROR);
    });
    it("should return PENDING if Ds_Response is missing", async () => {
      const status = await service.getPaymentStatus({ Ds_Order: "order123" });
      expect(status).toBe(PaymentSessionStatus.PENDING);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
     it("should return PENDING if paymentSessionData is empty", async () => {
      const status = await service.getPaymentStatus({});
      expect(status).toBe(PaymentSessionStatus.PENDING);
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe("authorizePayment", () => {
     it("should return status from getPaymentStatus", async () => {
      // getPaymentStatus will use Ds_Response from paymentSessionData
      const paymentSessionData = { Ds_Response: "0", Ds_Order: "order123" };
      const result = await service.authorizePayment(paymentSessionData, {});
      expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED);
      expect(result.data).toEqual(paymentSessionData);
    });
  });

  describe("capturePayment", () => {
    it("should return CAPTURED if status is AUTHORIZED", async () => {
      const paymentSessionData = { Ds_Response: "0", Ds_Order: "order123" }; // Results in AUTHORIZED
      const result = await service.capturePayment(paymentSessionData, {});
      expect(result.status).toBe(PaymentSessionStatus.CAPTURED);
    });
     it("should return current status if not AUTHORIZED", async () => {
      const paymentSessionData = { Ds_Response: "101", Ds_Order: "order123" }; // Results in ERROR
      const result = await service.capturePayment(paymentSessionData, {});
      expect(result.status).toBe(PaymentSessionStatus.ERROR);
    });
  });

  describe("refundPayment", () => {
    it("should log manual operation and return REFUNDED", async () => {
      const paymentSessionData = { Ds_Order: "order123", Ds_Amount: "1000" };
      const refundAmount = 500;
      const result = await service.refundPayment(paymentSessionData, refundAmount, {});

      expect(mockLogger.info).toHaveBeenCalledWith(
        `Redsys refundPayment for order order123, amount ${refundAmount} cents: Operation is manual. Please perform this refund via the Redsys merchant dashboard.`
      );
      expect(result.status).toBe(PaymentSessionStatus.REFUNDED);
      expect(result.data).toEqual(expect.objectContaining({
        last_refund_amount: refundAmount,
        refund_status: "Manual refund initiated; confirm status via Redsys dashboard.",
      }));
    });
  });

  describe("cancelPayment", () => {
    it("should return CANCELED if status is PENDING", async () => {
      const paymentSessionData = { Ds_Order: "order123" }; // No Ds_Response means PENDING
      const result = await service.cancelPayment(paymentSessionData, {});
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Payment is PENDING. Marking as CANCELED locally."));
      expect(result.status).toBe(PaymentSessionStatus.CANCELED);
    });

    it("should log manual operation if status is AUTHORIZED or CAPTURED", async () => {
      const paymentSessionData = { Ds_Response: "0", Ds_Order: "order123" }; // AUTHORIZED
      const result = await service.cancelPayment(paymentSessionData, {});
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Cancellation (void) must be performed via the Redsys merchant dashboard."));
      expect(result.status).toBe(PaymentSessionStatus.AUTHORIZED);
      expect(result.data).toEqual(expect.objectContaining({
         cancellation_status: "Manual cancellation (void) required via Redsys dashboard.",
      }))
    });
  });

  describe("retrievePayment", () => {
    it("should log warning and return current paymentSessionData", async () => {
      const paymentSessionData = { Ds_Order: "order123", current_data: "exists" };
      const result = await service.retrievePayment(paymentSessionData, {});
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Real-time retrieval of payment details post-transaction is not directly supported by redsys-easy."));
      expect(result).toEqual(paymentSessionData);
    });
  });

  describe("getWebhookActionAndData", () => {
    const mockNotification = {
      Ds_SignatureVersion: "HMAC_SHA256_V1",
      Ds_MerchantParameters: "encoded_params",
      Ds_Signature: "valid_signature",
    };

    it("should process valid payment notification", async () => {
      mockCheckNotificationSignature.mockReturnValue(true);
      mockDecodeMerchantParameters.mockReturnValue({ Ds_Order: "cart_123", Ds_Response: "0" });

      const result = await service.getWebhookActionAndData(mockNotification);

      expect(mockCheckNotificationSignature).toHaveBeenCalledWith("encoded_params", "valid_signature", "HMAC_SHA256_V1");
      expect(mockDecodeMerchantParameters).toHaveBeenCalledWith("encoded_params");
      expect(result.action).toBe("PROCESS_PAYMENT");
      expect(result.cart_id).toBe("cart_123");
      expect(result.data).toEqual({ Ds_Order: "cart_123", Ds_Response: "0" });
    });

    it("should ignore notification with invalid signature", async () => {
      mockCheckNotificationSignature.mockReturnValue(false);
      const result = await service.getWebhookActionAndData(mockNotification);
      expect(result.action).toBe("IGNORE");
      expect(result.error).toBe("Invalid Redsys notification signature.");
    });

    it("should return PROCESS_REFUND for refund code", async () => {
      mockCheckNotificationSignature.mockReturnValue(true);
      mockDecodeMerchantParameters.mockReturnValue({ Ds_Order: "cart_123", Ds_Response: "900" });
      const result = await service.getWebhookActionAndData(mockNotification);
      expect(result.action).toBe("PROCESS_REFUND");
    });

    it("should return CANCEL_PAYMENT for cancellation code", async () => {
      mockCheckNotificationSignature.mockReturnValue(true);
      mockDecodeMerchantParameters.mockReturnValue({ Ds_Order: "cart_123", Ds_Response: "400" });
      const result = await service.getWebhookActionAndData(mockNotification);
      expect(result.action).toBe("CANCEL_PAYMENT");
    });

    it("should ignore if Ds_Order or Ds_Response is missing from decoded params", async () => {
      mockCheckNotificationSignature.mockReturnValue(true);
      mockDecodeMerchantParameters.mockReturnValue({ Ds_Response: "0" }); // Missing Ds_Order
      let result = await service.getWebhookActionAndData(mockNotification);
      expect(result.action).toBe("IGNORE");
      expect(result.error).toContain("Missing Ds_Order or Ds_Response");

      mockDecodeMerchantParameters.mockReturnValue({ Ds_Order: "cart_123" }); // Missing Ds_Response
      result = await service.getWebhookActionAndData(mockNotification);
      expect(result.action).toBe("IGNORE");
      expect(result.error).toContain("Missing Ds_Order or Ds_Response");
    });
  });
});
