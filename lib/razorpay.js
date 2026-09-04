import crypto from "node:crypto";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

export function getRazorpayConfig() {
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay server configuration is missing."
    );
  }

  return {
    keyId,
    keySecret,
  };
}

export function razorpayAuthHeader() {
  const { keyId, keySecret } =
    getRazorpayConfig();

  return `Basic ${Buffer.from(
    `${keyId}:${keySecret}`
  ).toString("base64")}`;
}

export function verifyPaymentSignature({
  orderId,
  paymentId,
  signature,
}) {
  const { keySecret } =
    getRazorpayConfig();

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const supplied = String(
    signature || ""
  );

  if (
    supplied.length !== expected.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(supplied, "utf8")
  );
}

export function verifyWebhookSignature(
  rawBody,
  signature
) {
  const webhookSecret =
    process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error(
      "RAZORPAY_WEBHOOK_SECRET is not configured."
    );
  }

  const expected = crypto
    .createHmac(
      "sha256",
      webhookSecret
    )
    .update(rawBody)
    .digest("hex");

  const supplied = String(
    signature || ""
  );

  if (
    supplied.length !== expected.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(supplied, "utf8")
  );
}

export async function razorpayRequest(
  path,
  options = {}
) {
  const response = await fetch(
    `https://api.razorpay.com/v1${path}`,
    {
      ...options,
      headers: {
        Authorization:
          razorpayAuthHeader(),
        "Content-Type":
          "application/json",
        ...(options.headers || {}),
      },
      cache: "no-store",
    }
  );

  const text =
    await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
      : null;
  } catch {
    data = {
      error: {
        description:
          text ||
          "Razorpay returned an invalid response.",
      },
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.description ||
        data?.error?.reason ||
        "Razorpay API request failed."
    );
  }

  return data;
}
