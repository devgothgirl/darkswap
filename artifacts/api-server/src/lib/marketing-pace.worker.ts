import { createInterface } from "node:readline";

if (process.env.MARKETING_HEALTH_TEST_DB !== "true"
  || !/^postgresql:\/\/marketing_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Campaign pace worker requires the temporary marketing test database.");
}

const { pool } = await import("@workspace/db");
const { sendCampaign } = await import("./marketing");

process.env.MARKETING_PUBLIC_URL = "https://example.invalid";
process.env.MARKETING_FROM_EMAIL = "never-send@example.invalid";
process.env.MARKETING_POSTAL_ADDRESS = "Test-only postal address";
process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-only-secret-".repeat(4);
process.env.MARKETING_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
process.env.MARKETING_WEBHOOK_READY = "true";

const key = process.argv[2];
if (!key || !/^[a-z-]+$/.test(key)) throw new Error("Missing test campaign key.");
const lines = createInterface({ input: process.stdin });
console.log("ready");
await new Promise<void>(resolve => lines.once("line", () => resolve()));
lines.close();
try {
  const result = await sendCampaign({ key, subject: "Mock", text: "Mock", html: "<p>Mock</p>" }, {
    async send(message) {
      if (key === "pace-one") {
        console.log("transport-entered");
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      console.log(JSON.stringify({ at: Date.now(), email: message.to, key }));
      return `mock-${key}`;
    },
  }, false);
  if (result.sent !== 1) throw new Error(`Expected exactly one send for ${key}: ${JSON.stringify(result)}`);
} finally {
  await pool.end();
}