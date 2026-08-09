import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Razorpay signature verification", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_example");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "checkout-secret");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "webhook-secret");
  });

  it("accepts an authentic checkout signature", async () => {
    const { verifyCheckoutSignature } = await import("@/lib/razorpay");
    const signature = createHmac("sha256", "checkout-secret").update("order_123|pay_123").digest("hex");
    expect(verifyCheckoutSignature("order_123", "pay_123", signature)).toBe(true);
  });

  it("rejects a checkout signature for a different payment", async () => {
    const { verifyCheckoutSignature } = await import("@/lib/razorpay");
    const signature = createHmac("sha256", "checkout-secret").update("order_123|pay_other").digest("hex");
    expect(verifyCheckoutSignature("order_123", "pay_123", signature)).toBe(false);
  });

  it("rejects malformed identifiers and signatures without throwing", async () => {
    const { verifyCheckoutSignature, verifyWebhookSignature } = await import("@/lib/razorpay");
    expect(verifyCheckoutSignature("not-an-order", "pay_123", "not-hex")).toBe(false);
    expect(verifyCheckoutSignature("order_123", "not-a-payment", "a".repeat(64))).toBe(false);
    expect(verifyWebhookSignature("{}", "not-hex")).toBe(false);
  });

  it("verifies the exact raw webhook body", async () => {
    const { verifyWebhookSignature } = await import("@/lib/razorpay");
    const body = '{"event":"payment.captured","payload":{"value":39}}';
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature)).toBe(true);
    expect(verifyWebhookSignature(`${body}\n`, signature)).toBe(false);
  });

  it("converts rupees to paise and rejects invalid checkout amounts", async () => {
    const { paymentCheckoutDetails } = await import("@/lib/razorpay");
    expect(paymentCheckoutDetails("order_123", 39)).toMatchObject({ amount: 3900, currency: "INR", keyId: "rzp_test_example" });
    expect(() => paymentCheckoutDetails("order_123", 0)).toThrow("at least ₹1");
    expect(() => paymentCheckoutDetails("order_123", Number.NaN)).toThrow("at least ₹1");
  });

  it("creates an INR order without exposing the key secret in the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "order_created123", amount: 3900, currency: "INR" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createPaymentOrder } = await import("@/lib/razorpay");
    const appOrderId = "LB-12345678-1234-1234-1234-123456789abc";
    await expect(createPaymentOrder(appOrderId, 39)).resolves.toMatchObject({ id: "order_created123", amount: 3900, currency: "INR" });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = String(request.body);
    expect(JSON.parse(body)).toMatchObject({ amount: 3900, currency: "INR", receipt: appOrderId });
    expect(body).not.toContain("checkout-secret");
  });
});
