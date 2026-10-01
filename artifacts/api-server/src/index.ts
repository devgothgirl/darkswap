import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { campaignConfig, marketingHealth, pruneWebhookReceipts, sendConfig, type MarketingHealth } from "./lib/marketing";
import { pollRewardsOrders } from "./lib/rewards";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

pool.on("error", (err) => logger.error({ err }, "Idle database connection failed"));

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // Configuration functions emit fixed messages, never credential values or contacts.
  // Check on startup so operators can distinguish bad config from a disabled send gate.
  try {
    sendConfig();
    logger.info("Marketing base configuration accepted");
    try {
      campaignConfig();
      logger.info("Marketing sending gate enabled");
    } catch {
      logger.warn("Marketing sending disabled until signed webhook setup is verified");
    }
  } catch {
    logger.warn("Marketing sending disabled: sender, address, public URL or unsubscribe secret configuration is invalid");
  }
});

// Independent of swap health. Transition-only alerts avoid repeated logs during an outage.
let lastMarketingHealth: MarketingHealth | "unavailable" | undefined;
async function checkMarketingHealth(): Promise<void> {
  let status: MarketingHealth | "unavailable";
  try { status = await marketingHealth(); }
  catch { status = "unavailable"; }
  if (status !== lastMarketingHealth) {
    if (status === "healthy") logger.info("Marketing webhook health restored");
    else logger.error({ status }, "Marketing webhook unhealthy; campaigns paused");
    lastMarketingHealth = status;
  }
}
void checkMarketingHealth();
const marketingHealthTimer = setInterval(() => { void checkMarketingHealth(); }, 60_000);
marketingHealthTimer.unref();

// Run independently of the send gate so retention continues during quiet periods.
async function pruneMarketingHistory(): Promise<void> {
  try { await pruneWebhookReceipts(); }
  catch { logger.error("Marketing webhook receipt retention failed"); }
}
void pruneMarketingHistory();
const marketingRetentionTimer = setInterval(() => { void pruneMarketingHistory(); }, 24 * 60 * 60 * 1000);
marketingRetentionTimer.unref();

async function checkRewardsOrders(): Promise<void> {
  try {
    await pollRewardsOrders();
  } catch {
    logger.error("Rewards order polling failed; eligible orders will be retried");
  }
}
void checkRewardsOrders();
const rewardsOrderTimer = setInterval(() => { void checkRewardsOrders(); }, 30_000);
rewardsOrderTimer.unref();

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  clearInterval(marketingHealthTimer);
  clearInterval(marketingRetentionTimer);
  clearInterval(rewardsOrderTimer);
  logger.info({ signal }, "Draining API requests");
  server.close(async (err) => {
    if (err) logger.error({ err }, "API server shutdown failed");
    try {
      await pool.end();
    } catch (poolError) {
      logger.error({ err: poolError }, "Database pool shutdown failed");
      process.exitCode = 1;
    }
    if (err) process.exitCode = 1;
  });
  setTimeout(() => {
    logger.error("API shutdown exceeded the drain deadline");
    server.closeAllConnections();
    process.exitCode = 1;
  }, 30_000).unref();
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
