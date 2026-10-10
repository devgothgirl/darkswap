import { spawn } from "node:child_process";
import { migrationTimeout } from "./dependency-deadlines.mjs";

let timeout;
try {
  timeout = migrationTimeout();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Preserve the existing non-forced schema push policy. Closed stdin prevents
// an interactive schema decision from waiting for operator input during setup.
// Linux process groups cover pnpm, drizzle and any children they launch.
const child = spawn("pnpm", ["--filter", "db", "push"], {
  stdio: ["ignore", "inherit", "inherit"],
  detached: true,
});
const graceMs = 1000;
let stopping = false;
let failedToStart = false;
let escalation;

function signalGroup(signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") {
      console.error(`Database migration process group could not receive ${signal}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  process.exitCode = code;
  signalGroup("SIGTERM");
  // Do not cancel escalation when pnpm exits: a descendant may still be
  // running in its group, ignoring SIGTERM even after the leader has closed.
  escalation = setTimeout(() => {
    signalGroup("SIGKILL");
  }, graceMs);
}

const timer = setTimeout(() => {
  console.error(`Database migration timed out after ${timeout} ms; setup stopped before workflow startup. Sent SIGTERM to the pnpm migration process group; any remaining processes will be killed after ${graceMs} ms. Inspect database connectivity, locks and migration output, and verify the schema state before retrying pnpm --filter db push. No force-push or automatic retry was attempted.`);
  stop(1);
}, timeout);

for (const [signal, code] of [["SIGTERM", 143], ["SIGINT", 130]]) {
  process.on(signal, () => {
    console.error(`Database migration runner received ${signal}; stopping its process group before workflow startup. Verify the schema state before retrying setup.`);
    stop(code);
  });
}

child.on("error", error => {
  failedToStart = true;
  clearTimeout(timer);
  clearTimeout(escalation);
  console.error(`Database migration could not start; setup stopped before workflow startup. ${error.message}`);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  if (stopping || failedToStart) return;
  clearTimeout(timer);
  if (signal) {
    console.error(`Database migration terminated by ${signal}; setup stopped before workflow startup.`);
    process.exitCode = 1;
  } else {
    // A pnpm exit of 124 or 137 is not evidence that our deadline fired.
    process.exitCode = code ?? 1;
  }
});
