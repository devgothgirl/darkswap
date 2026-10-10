import { spawn } from "node:child_process";
import { installTimeout } from "./dependency-deadlines.mjs";

let timeout;
try {
  timeout = installTimeout();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// A separate process group lets the deadline kill pnpm and any lifecycle
// children, even if they ignore SIGTERM. Setup runs on Linux.
const child = spawn("pnpm", ["install", "--frozen-lockfile"], {
  stdio: "inherit",
  detached: true,
});
let timedOut = false;
let stopping = false;
let failedToStart = false;
let finished = false;
const graceMs = 1000;
let escalation;

function signalGroup(signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") {
      console.error(`Dependency install process group could not receive ${signal}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

const timer = setTimeout(() => {
  timedOut = true;
  console.error(`Dependency install timed out after ${timeout} ms; setup stopped before compatibility checks and migrations. The pnpm process group was killed. Inspect the install output and registry/network availability, then rerun pnpm install --frozen-lockfile before retrying setup.`);
  process.exitCode = 1;
  signalGroup("SIGKILL");
}, timeout);

for (const [signal, code] of [["SIGTERM", 143], ["SIGINT", 130]]) {
  process.on(signal, () => {
    // Repeated interrupts must not reset the grace period or change the
    // original failure reason (including a deadline that already fired).
    if (stopping || timedOut || failedToStart || finished) return;
    stopping = true;
    clearTimeout(timer);
    process.exitCode = code;
    console.error(`Dependency install runner received ${signal}; setup stopped before compatibility checks and migrations. Sent SIGTERM to the pnpm process group; remaining processes will be killed after ${graceMs} ms.`);
    signalGroup("SIGTERM");
    // Keep this timer alive even if pnpm exits: lifecycle descendants can
    // remain in the detached group and ignore SIGTERM after their leader dies.
    escalation = setTimeout(() => signalGroup("SIGKILL"), graceMs);
  });
}

child.on("error", error => {
  if (stopping || timedOut || failedToStart || finished) return;
  failedToStart = true;
  clearTimeout(timer);
  clearTimeout(escalation);
  console.error("Dependency install could not start; setup stopped before compatibility checks and migrations.", error.message);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  clearTimeout(timer);
  if (stopping || failedToStart) return;
  finished = true;
  if (timedOut) {
    process.exitCode = 1;
  } else if (signal) {
    console.error(`Dependency install terminated by ${signal}; setup stopped before compatibility checks and migrations.`);
    process.exitCode = 1;
    // A killed leader can leave lifecycle descendants behind. Apply the same
    // cleanup grace as cancellation without changing the recorded failure.
    signalGroup("SIGTERM");
    escalation = setTimeout(() => signalGroup("SIGKILL"), graceMs);
  } else {
    // Preserve pnpm's failure codes rather than treating them as timeouts.
    process.exitCode = code ?? 1;
  }
});
