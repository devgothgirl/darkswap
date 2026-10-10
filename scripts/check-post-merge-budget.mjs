import { readFileSync } from "node:fs";
import { installTimeout, checkTimeout, migrationTimeout } from "./dependency-deadlines.mjs";

// Reserve time for the bounded migration command, process startup, and
// reporting a phase timeout before the platform kills the entire setup.
const reserve = 30000;

try {
  const install = installTimeout();
  const wallet = checkTimeout("wallet");
  const pool = checkTimeout("pool");
  migrationTimeout();
  // Read the actual platform deadline, never a duplicated default or an env
  // override that could claim more time than the platform grants. Only the
  // integer timeoutMs field in [postMerge] is needed; fail closed if absent
  // or ambiguous rather than guessing a deadline.
  const config = readFileSync(".replit", "utf8");
  const sections = [...config.matchAll(/^\s*\[postMerge\]\s*(?:#.*)?\r?\n([\s\S]*?)(?=^\s*\[|(?![\s\S]))/gm)];
  const fields = sections.length === 1
    ? [...sections[0][1].matchAll(/^\s*timeoutMs\s*=\s*([^\r\n]*)/gm)] : [];
  const value = fields.length === 1 ? fields[0][1].replace(/#.*$/, "").trim() : "";
  const deadline = Number(value.replaceAll("_", ""));
  if (!/^[1-9](?:_?\d)*$/.test(value) || !Number.isSafeInteger(deadline)) {
    throw new Error("Post-merge budget validation stopped before installation. Configure one positive integer timeoutMs in .replit [postMerge]; no overall deadline was assumed.");
  }
  const required = install + wallet + pool + reserve;
  if (required > deadline) {
    throw new Error(`Post-merge budget validation stopped before installation: install ${install} ms + wallet ${wallet} ms + pool ${pool} ms + migration/startup reserve ${reserve} ms = ${required} ms, exceeding .replit [postMerge].timeoutMs (${deadline} ms) by ${required - deadline} ms. Lower DEPENDENCY_INSTALL_TIMEOUT_MS and/or DEPENDENCY_CHECK_TIMEOUT_MS so the phase total is at most ${Math.max(0, deadline - reserve)} ms; DEPENDENCY_CHECK_TIMEOUT_MS applies to BOTH checks. Unset overrides to use defaults only if they fit this deadline. The overall limit has not been changed.`);
  }
} catch (error) {
  console.error(error.code === "ENOENT"
    ? "Post-merge budget validation stopped before installation: .replit is missing; restore the configured [postMerge] deadline before retrying setup."
    : error.message);
  process.exitCode = 1;
}
