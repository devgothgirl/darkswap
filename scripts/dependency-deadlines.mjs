// Shared by preflight and the phase runners so their effective budgets agree.
export function installTimeout(env = process.env) {
  return parseTimeout(env.DEPENDENCY_INSTALL_TIMEOUT_MS ?? "90000",
    "Dependency install setup stopped. Set DEPENDENCY_INSTALL_TIMEOUT_MS to an integer from 1 to 120000 (default 90000).");
}

export function checkTimeout(kind, env = process.env) {
  return parseTimeout(env.DEPENDENCY_CHECK_TIMEOUT_MS ?? (kind === "pool" ? "120000" : "15000"),
    "Dependency check setup stopped. Use wallet or pool and set DEPENDENCY_CHECK_TIMEOUT_MS to an integer from 1 to 120000 (defaults: wallet 15000, pool 120000).");
}

// Leave 10 seconds of the existing 30-second reserve for termination,
// shell/Node startup and diagnostics. Overrides may shorten, never extend it.
export function migrationTimeout(env = process.env) {
  const value = env.MIGRATION_TIMEOUT_MS ?? "20000";
  const timeout = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(timeout) || timeout > 20000) {
    throw new Error("Database migration setup stopped. Set MIGRATION_TIMEOUT_MS to an integer from 1 to 20000 (default 20000).");
  }
  return timeout;
}

function parseTimeout(value, message) {
  const timeout = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(timeout) || timeout > 120000) {
    throw new Error(message);
  }
  return timeout;
}
