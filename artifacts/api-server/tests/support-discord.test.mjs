import assert from "node:assert/strict";
import { test } from "node:test";
import { postSupportToDiscord } from "../src/lib/support-discord.ts";

const report = {
  id: "test-reference",
  email: "customer@example.com",
  issue: "delayed_swap",
  route: "private_route",
  orderReference: "order-123",
  transactionHash: "tx-123",
  message: "@everyone " + "A".repeat(1985),
};

test("rejects unsafe webhook URLs without sending a report", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Should not fetch"); };
  try {
    assert.equal(await postSupportToDiscord(report, "https://discord.com.evil.example/api/webhooks/123/token"), false);
    assert.equal(await postSupportToDiscord(report, "http://discord.com/api/webhooks/123/token"), false);
    assert.equal(await postSupportToDiscord(report, "https://discord.com/api/webhooks/123/token?thread_id=123"), false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("posts the complete report without allowing user pings and waits for confirmation", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://discord.com/api/webhooks/123/token?wait=true");
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.allowed_mentions, { parse: [] });
    assert.match(body.content, /test-reference/);
    assert.equal(body.embeds[0].fields.filter(field => field.name.startsWith("Customer message")).map(field => field.value).join(""), report.message);
    assert.equal(body.embeds[0].fields.find(field => field.name === "Reply email").value, report.email);
    return { ok: true, json: async () => ({ id: "456" }) };
  };
  try {
    assert.equal(await postSupportToDiscord(report, "https://discord.com/api/webhooks/123/token"), true);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("does not claim success when Discord fails or omits its message ID", async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 429 });
    assert.equal(await postSupportToDiscord(report, "https://discord.com/api/webhooks/123/token"), false);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    assert.equal(await postSupportToDiscord(report, "https://discord.com/api/webhooks/123/token"), false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});