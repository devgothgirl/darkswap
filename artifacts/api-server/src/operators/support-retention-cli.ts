// Restricted operator utility; intentionally not exposed through an HTTP route.
import { parseArgs } from "node:util";

class OperatorInputError extends Error {}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift(); // pnpm run passes its separator through.
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true, strict: true,
    options: {
      "case-id": { type: "string" }, outcome: { type: "string" },
      "fund-review": { type: "string" }, enabled: { type: "string" },
      limit: { type: "string" }, "confirm-reviewed": { type: "boolean" },
      "confirm-delete-support-reports": { type: "boolean" },
    },
  });
  const command = positionals[0] ?? "preview";
  if (positionals.length > 1 || !["preview", "cleanup", "close", "reopen", "hold"].includes(command)) {
    throw new OperatorInputError("Use preview, cleanup, close, reopen, or hold.");
  }
  const allowed = command === "preview" ? ["limit"]
    : command === "cleanup" ? ["limit", "confirm-delete-support-reports"]
      : command === "close" ? ["case-id", "outcome", "fund-review", "confirm-reviewed"]
        : command === "reopen" ? ["case-id", "confirm-reviewed"]
          : ["case-id", "enabled", "confirm-reviewed"];
  if (Object.keys(values).some(key => !allowed.includes(key))) throw new OperatorInputError("Unexpected option for this command.");
  if (command === "cleanup" && !values["confirm-delete-support-reports"]) {
    throw new OperatorInputError("Deletion is irreversible. Preview first, then pass --confirm-delete-support-reports.");
  }
  if (values.limit !== undefined && !/^[1-9]\d{0,3}$/.test(values.limit)) throw new OperatorInputError("Invalid limit.");
  const limit = values.limit === undefined ? 100 : Number(values.limit);
  if (limit > 1000) throw new OperatorInputError("Limit must be from 1 to 1000.");
  const operatorAction = ["close", "reopen", "hold"].includes(command);
  if (operatorAction && (!values["case-id"] || !values["confirm-reviewed"])) {
    throw new OperatorInputError("Case actions require --case-id and --confirm-reviewed.");
  }
  if (command === "close" && (!["resolved", "expired"].includes(values.outcome ?? "")
    || !["resolved", "non-fund"].includes(values["fund-review"] ?? "")
    || (values.outcome === "expired" && values["fund-review"] !== "non-fund"))) {
    throw new OperatorInputError("Use --outcome resolved|expired --fund-review resolved|non-fund; expiry requires non-fund review.");
  }
  if (command === "hold" && !["true", "false"].includes(values.enabled ?? "")) {
    throw new OperatorInputError("Hold requires --enabled true|false.");
  }
  // Load the database only after all destructive-intent checks have passed.
  const { pool } = await import("@workspace/db");
  try {
    const { reviewSupportCase, runSupportRetention } = await import("../lib/support-retention");
    const result = operatorAction ? await reviewSupportCase({
      id: values["case-id"]!, action: command as "close" | "reopen" | "hold",
      outcome: values.outcome as "resolved" | "expired" | undefined,
      fundReview: values["fund-review"] as "resolved" | "non-fund" | undefined,
      enabled: values.enabled === undefined ? undefined : values.enabled === "true",
    }) : await runSupportRetention({ apply: command === "cleanup", limit });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  // SQL errors can include row contents. Never emit arbitrary errors to logs.
  process.stderr.write(error instanceof OperatorInputError ? `${error.message}\n`
    : "Support retention failed; no success confirmed. Check arguments, schema, and database access in the restricted operator environment.\n");
  process.exitCode = 1;
});