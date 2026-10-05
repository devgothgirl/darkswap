"use strict";
// Installing the toolkit separately bypasses the audited security patches.
if (!process.env.npm_config_user_agent?.startsWith("pnpm/")) {
  console.error("Install from the repository root with: pnpm install --frozen-lockfile");
  process.exit(1);
}