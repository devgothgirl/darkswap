import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { test } from "node:test";
import { campaignConfig, campaignUnsubscribeToken, confirmationMessage, hashToken, newToken, sendConfig, validPostalAddress, validToken, verifyWebhook, webhookSignalHealth, type MailTransport } from "./marketing";

test("marketing health fails closed for missing receipts and overdue sends", () => {
  assert.equal(webhookSignalHealth(false, false), "stale");
  assert.equal(webhookSignalHealth(false, true), "healthy");
  assert.equal(webhookSignalHealth(true, true), "backlog");
  assert.equal(webhookSignalHealth(true, false), "backlog");
});

test("mailing footer rejects ZIP-only and obviously incomplete values", () => {
  for (const address of [undefined, "", "90292", "90292-1234", "90292 1234 5678 9101", "USA"]) {
    assert.equal(validPostalAddress(address), false);
  }
  assert.equal(validPostalAddress("PO Box 123, Example City, CA 90292, USA"), true);
});

test("tokens are opaque, hashed at rest, and HMAC unsubscribe tokens stable", () => {
  const token = newToken();
  assert.ok(validToken(token));
  assert.notEqual(hashToken(token), token);
  assert.equal(hashToken(token), hashToken(token));
  process.env.MARKETING_UNSUBSCRIBE_SECRET = "a".repeat(32);
  assert.equal(campaignUnsubscribeToken("person@example.com"), campaignUnsubscribeToken("person@example.com"));
  assert.notEqual(campaignUnsubscribeToken("person@example.com"), campaignUnsubscribeToken("other@example.com"));
});

test("signed webhook rejects tampered body, wrong signature and stale timestamp", () => {
  const key = randomBytes(32);
  const secret = `whsec_${key.toString("base64")}`;
  const raw = Buffer.from('{"type":"email.bounced"}');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const id = "evt_test";
  const signature = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.`).update(raw).digest("base64")}`;
  const headers = { id, timestamp, signature };
  assert.equal(verifyWebhook(raw, headers, secret), true);
  assert.equal(verifyWebhook(Buffer.from("{}"), headers, secret), false);
  assert.equal(verifyWebhook(raw, { ...headers, signature: "v1,invalid" }, secret), false);
  assert.equal(verifyWebhook(raw, headers, secret, Date.now() + 600_000), false);
});

test("confirmation template includes confirm and unsubscribe and uses only mock transport", async () => {
  const sent: string[] = [];
  const mock: MailTransport = {
    async send(message, key) {
      sent.push(message.text, message.html, message.headers?.["List-Unsubscribe"] ?? "", key);
      return "mock-message-id";
    },
  };
  const message = confirmationMessage("person@example.com", "b".repeat(64), "c".repeat(64), {
    url: "https://darkswap.app", from: "sender@example.com", postal: "Provided postal address",
  });
  assert.equal(await mock.send(message, "test-only"), "mock-message-id");
  assert.match(sent[0], /\/api\/marketing\/confirm\?token=/);
  assert.match(sent[0], /\/api\/marketing\/unsubscribe\?token=/);
  assert.match(sent[2], /unsubscribe/);
  assert.match(sent[1], /Provided postal address/);
});

test("sends fail closed without sender/address and campaign webhook readiness", () => {
  const original = {
    MARKETING_PUBLIC_URL: process.env.MARKETING_PUBLIC_URL,
    MARKETING_FROM_EMAIL: process.env.MARKETING_FROM_EMAIL,
    MARKETING_POSTAL_ADDRESS: process.env.MARKETING_POSTAL_ADDRESS,
    MARKETING_UNSUBSCRIBE_SECRET: process.env.MARKETING_UNSUBSCRIBE_SECRET,
    MARKETING_RESEND_WEBHOOK_SECRET: process.env.MARKETING_RESEND_WEBHOOK_SECRET,
    MARKETING_WEBHOOK_READY: process.env.MARKETING_WEBHOOK_READY,
  };
  try {
    delete process.env.MARKETING_FROM_EMAIL;
    assert.throws(() => sendConfig());
    process.env.MARKETING_PUBLIC_URL = "https://darkswap.app";
    process.env.MARKETING_FROM_EMAIL = "verified@example.com";
    process.env.MARKETING_POSTAL_ADDRESS = "Provided physical address";
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "a".repeat(32);
    assert.doesNotThrow(() => sendConfig());
    process.env.MARKETING_POSTAL_ADDRESS = "90292";
    assert.throws(() => sendConfig());
    process.env.MARKETING_POSTAL_ADDRESS = "Provided physical address";
    delete process.env.MARKETING_WEBHOOK_READY;
    assert.throws(() => campaignConfig());
    process.env.MARKETING_WEBHOOK_READY = "true";
    process.env.MARKETING_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.alloc(32, 1).toString("base64")}`;
    assert.doesNotThrow(() => campaignConfig());
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});