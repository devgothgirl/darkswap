// Real independent process, mock mail only, disposable database only.
import { createInterface } from "node:readline";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";

if (process.env.MARKETING_HEALTH_TEST_DB !== "true"
  || !/^postgresql:\/\/marketing_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Marketing health worker requires the isolated temporary database.");
}
const { pool } = await import("@workspace/db");
const { marketingHealth, sendCampaign } = await import("./marketing");
const { default: router } = await import("../routes/marketing");
const app = express();
app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
app.use("/api/marketing/webhook/resend", express.raw({ type: "application/json" }));
app.use("/api", router);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Missing worker port");
process.stdout.write(JSON.stringify({ base: `http://127.0.0.1:${address.port}` }) + "\n");
const commands = createInterface({ input: process.stdin });
for await (const line of commands) {
  const { key } = JSON.parse(line) as { key: string };
  let sends = 0;
  let paused = false;
  const health = await marketingHealth();
  try {
    await sendCampaign({ key, subject: "Mock", html: "<p>Mock</p>", text: "Mock" }, {
      async send() { sends++; return `mock-${key}`; },
    }, false);
  } catch (error) {
    if (!/campaigns paused/.test(String(error))) throw error;
    paused = true;
  }
  process.stdout.write(JSON.stringify({ health, sends, paused }) + "\n");
}
await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
await pool.end();