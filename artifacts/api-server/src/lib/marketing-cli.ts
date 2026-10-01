import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { sendCampaign, sendWebhookProbe, type Campaign } from "./marketing";

// Run with: pnpm --dir scripts exec tsx ../artifacts/api-server/src/lib/marketing-cli.ts campaign.json
// Dry run is the default. Two separate flags are mandatory to send.
async function main() {
  const [path, ...flags] = process.argv.slice(2);
  if (path === "--probe" && flags.length === 0) {
    await sendWebhookProbe();
    logger.info("Marketing webhook probe submitted; check health after its signed event arrives");
    return;
  }
  if (!path || flags.some(flag => flag !== "--send" && !flag.startsWith("--confirm="))) {
    throw new Error("Usage: marketing-cli.ts --probe | campaign.json [--send --confirm=CAMPAIGN_KEY]");
  }
  const payload: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!payload || typeof payload !== "object" || !("key" in payload) || !("subject" in payload)
    || !("html" in payload) || !("text" in payload)
    || typeof payload.key !== "string" || typeof payload.subject !== "string"
    || typeof payload.html !== "string" || typeof payload.text !== "string") {
    throw new Error("Campaign JSON requires string key, subject, html, and text.");
  }
  const send = flags.includes("--send");
  if (send !== flags.includes(`--confirm=${payload.key}`) || flags.length !== (send ? 2 : 0)) {
    throw new Error("Sending requires both --send and --confirm=CAMPAIGN_KEY.");
  }
  const result = await sendCampaign(payload as Campaign, undefined, !send);
  logger.info({ mode: send ? "send" : "dry-run", ...result }, "Marketing campaign completed");
}

main().catch(() => {
  // Never print provider exceptions, email addresses or campaign content.
  logger.error("Campaign could not proceed. Check campaign JSON, configuration and provider availability.");
  process.exitCode = 1;
}).finally(async () => { await pool.end(); });