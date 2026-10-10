import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkTimeout } from "./dependency-deadlines.mjs";

const checks = {
  wallet: {
    script: "check-wallet-dependencies.mjs",
    label: "Installed wallet dependency compatibility check",
    patch: "query-string",
  },
  pool: {
    script: "check-pool-dependencies.mjs",
    label: "Installed private-pool crypto dependency compatibility check",
    patch: "circomlibjs",
  },
};
const check = checks[process.argv[2]];
// Each check gets its own deadline, below the overall setup budget.
// Allow a shorter deadline for isolated fixtures, or a bounded increase on
// slower machines. Invalid configuration must never disable the deadline.
// Loading both circomlibjs entrypoints and building the real crypto primitives
// can exceed a minute on a cold workspace. Wallet parsing is much lighter.
let timeout;
try {
  if (!check) throw new Error("Dependency check setup stopped. Use wallet or pool.");
  timeout = checkTimeout(process.argv[2]);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// A timer in the consumer process cannot interrupt a synchronous parser or
// crypto loop. Enforce the deadline from outside and kill unconditionally,
// rather than waiting forever for a consumer's SIGTERM handler.
// Keep the runner's event loop available for direct cancellation too; shell
// process-group forwarding is not present in standalone invocations.
const child = spawn(process.execPath, [fileURLToPath(new URL(check.script, import.meta.url))], {
  stdio: "inherit",
});
// Completion and cancellation share one terminal latch: whichever the runner
// observes first owns both the exit code and the diagnostic.
let settled = false;

function stop(code) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  process.exitCode = code;
  // No grace period: synchronous consumers cannot run signal handlers, and
  // consumers that ignore signals must not extend cancellation or deadlines.
  child.kill("SIGKILL");
}

const timer = setTimeout(() => {
  if (settled) return;
  console.error(`${check.label} timed out after ${timeout} ms; setup stopped before migrations. The check process was killed. Inspect the installed ${check.patch} compatibility patch and rerun node scripts/run-dependency-check.mjs ${process.argv[2]} before retrying setup.`);
  stop(1);
}, timeout);

for (const [signal, code] of [["SIGTERM", 143], ["SIGINT", 130]]) {
  process.on(signal, () => {
    if (settled) return;
    console.error(`${check.label} runner received ${signal}; setup stopped before migrations. The check process was killed.`);
    stop(code);
  });
}

child.on("error", error => {
  clearTimeout(timer);
  if (settled) return;
  settled = true;
  console.error(`${check.label} could not complete; setup stopped before migrations.`, error);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  clearTimeout(timer);
  if (settled) return;
  settled = true;
  if (signal) {
    console.error(`${check.label} could not complete; setup stopped before migrations.`, `Terminated by ${signal}`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
