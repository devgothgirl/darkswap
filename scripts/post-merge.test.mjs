import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const appManifest = path.join(root, "artifacts/solana-privacy-swap/package.json");
let walletRequire = createRequire(appManifest);
for (const name of ["@privy-io/react-auth", "@walletconnect/ethereum-provider", "@walletconnect/utils"]) {
  walletRequire = createRequire(walletRequire.resolve(name));
}
const queryEntry = walletRequire.resolve("query-string");
const queryRequire = createRequire(queryEntry);
const poolRequire = createRequire(path.join(root, "lib/pool-client/package.json"));
const cryptoEntry = poolRequire.resolve("circomlibjs");
const cryptoDir = path.dirname(path.dirname(cryptoEntry));

function fixture(t, { missingPatch = false, walletHang = false, cryptoFault, installHang = false, installExit = 0, installBody, migrationExit = 0, migrationBody, migrationTimeout, installTimeout, checkTimeout, config = readFileSync(path.join(root, ".replit"), "utf8"), lightweight = false } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), "post-merge-compatibility-"));
  t.after(() => {
    // Even a failed cleanup assertion or an outer fixture timeout must not
    // leave the isolated install's detached process group running.
    for (const name of ["install-pid", "migration-pid", "phase-pid", "consumer-pid", "install-descendant-pid", "migration-descendant-pid"]) {
      const pidFile = path.join(cwd, name);
      if (existsSync(pidFile)) {
        const pid = Number(readFileSync(pidFile, "utf8").trim());
        for (const target of [-pid, pid]) {
          try {
            process.kill(target, "SIGKILL");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        }
      }
    }
    rmSync(cwd, { recursive: true, force: true });
  });
  const write = (name, content, options) => {
    const filename = path.join(cwd, name);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, content, options);
  };
  if (config !== null) write(".replit", config);
  for (const name of ["post-merge.sh", "check-post-merge-budget.mjs", "dependency-deadlines.mjs", "run-dependency-install.mjs", "run-dependency-check.mjs", "run-database-migration.mjs", "check-wallet-dependencies.mjs", "check-pool-dependencies.mjs"]) {
    write(`scripts/${name}`, readFileSync(path.join(root, "scripts", name)));
  }
  write("scripts/run-dependency-check.mjs",
    'import { appendFileSync } from "node:fs";\nappendFileSync("compatibility-calls", process.argv[2] + "\\n");\n'
    // When testing a pool stall, give the healthy wallet gate its own budget
    // so a slow wallet startup cannot prevent reaching the fault under test.
    + (cryptoFault?.startsWith("hang-") ? 'if (process.argv[2] === "wallet") process.env.DEPENDENCY_CHECK_TIMEOUT_MS = "30000";\n' : "")
    + readFileSync(path.join(root, "scripts/run-dependency-check.mjs"), "utf8"));
  // Stub only install/migration side effects. The shell and Node gate run for
  // real, with no installation or database writes against this workspace.
  write("bin/pnpm", `#!/bin/bash
printf '%s\\n' "$*" >> "$PWD/pnpm-calls"
case "$*" in
  "install --frozen-lockfile") ${installBody ?? (installHang ? "trap '' TERM; while true; do sleep 1; done" : `exit ${installExit}`)} ;;
  "--filter db push") ${migrationBody ?? `exit ${migrationExit}`} ;;
  *) exit 99 ;;
esac
`, { mode: 0o755 });

  const env = { ...process.env, PATH: `${path.join(cwd, "bin")}:${process.env.PATH}` };
  // Do not inherit deadline overrides from the developer's shell.
  delete env.DEPENDENCY_INSTALL_TIMEOUT_MS;
  delete env.DEPENDENCY_CHECK_TIMEOUT_MS;
  delete env.MIGRATION_TIMEOUT_MS;
  if (installTimeout !== undefined) env.DEPENDENCY_INSTALL_TIMEOUT_MS = installTimeout;
  if (checkTimeout !== undefined) env.DEPENDENCY_CHECK_TIMEOUT_MS = checkTimeout;
  if (migrationTimeout !== undefined) env.MIGRATION_TIMEOUT_MS = migrationTimeout;
  const start = (command, args) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    const done = new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
    });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
    return { child, done };
  };
  const setup = {
    start: () => start("bash", ["scripts/post-merge.sh"]),
    startCheck: phase => start(process.execPath, ["scripts/run-dependency-check.mjs", phase]),
    startInstall: () => start(process.execPath, ["scripts/run-dependency-install.mjs"]),
    write,
    exists: name => existsSync(path.join(cwd, name)),
    run: (timeout = 180000) => spawnSync("bash", ["scripts/post-merge.sh"], {
      cwd, encoding: "utf8", timeout, env,
    }),
    runInstall: (overrides = {}) => spawnSync(process.execPath, ["scripts/run-dependency-install.mjs"], {
      cwd, encoding: "utf8", timeout: 10000, env: { ...env, ...overrides },
    }),
    runMigration: (overrides = {}) => spawnSync(process.execPath, ["scripts/run-database-migration.mjs"], {
      cwd, encoding: "utf8", timeout: 10000, env: { ...env, ...overrides },
    }),
    runCheck: phase => spawnSync(process.execPath, ["scripts/run-dependency-check.mjs", phase], {
      cwd, encoding: "utf8", timeout: 10000, env,
    }),
    calls: () => existsSync(path.join(cwd, "pnpm-calls")) ? readFileSync(path.join(cwd, "pnpm-calls"), "utf8").trim().split("\n") : [],
    checks: () => existsSync(path.join(cwd, "compatibility-calls")) ? readFileSync(path.join(cwd, "compatibility-calls"), "utf8").trim().split("\n") : [],
    read: name => readFileSync(path.join(cwd, name), "utf8"),
  };
  if (lightweight) {
    // Budget fixtures exercise the real preflight, phase runners and shell
    // without crypto startup or any workspace install/database side effects.
    write("scripts/check-wallet-dependencies.mjs", "");
    write("scripts/check-pool-dependencies.mjs", "");
    return setup;
  }

  if (!missingPatch && !walletHang) {
    // A normal setup checks the actual, untouched installed wallet graph.
    mkdirSync(path.join(cwd, "artifacts"), { recursive: true });
    symlinkSync(path.join(root, "artifacts/solana-privacy-swap"), path.join(cwd, "artifacts/solana-privacy-swap"));
  } else {
    // Isolate just the resolution chain; these entrypoints are resolved but
    // never executed by the check. The parser and its dependencies are real.
    write("artifacts/solana-privacy-swap/package.json", "{}");
    for (const name of ["@privy-io/react-auth", "@walletconnect/ethereum-provider", "@walletconnect/utils"]) {
      write(`node_modules/${name}/package.json`, JSON.stringify({ name, main: "index.js" }));
      write(`node_modules/${name}/index.js`, "");
    }
    const queryDir = path.join(cwd, "node_modules/query-string");
    cpSync(path.dirname(queryEntry), queryDir, { recursive: true });
    const installed = readFileSync(queryEntry, "utf8");
    const patched = "const decoder = require('decode-uri-component');\nconst decodeComponent = decoder.default || decoder;";
    assert.ok(installed.includes(patched), "fixture must start from the installed patched parser");
    write("node_modules/query-string/index.js", walletHang
      ? 'process.on("SIGTERM", () => {}); while (true) {}\n'
      : installed.replace(patched, "const decodeComponent = require('decode-uri-component');"));
    for (const name of Object.keys(queryRequire("./package.json").dependencies)) {
      const target = path.join(cwd, "node_modules", name);
      mkdirSync(path.dirname(target), { recursive: true });
      // Follow pnpm's installed sibling link, including packages whose exports
      // deliberately do not expose package.json.
      symlinkSync(realpathSync(path.join(path.dirname(queryEntry), "..", name)), target);
    }
  }
  // Copy the real installed crypto package into an isolated consumer graph.
  // Even the intact case uses this copy; never change installed dependencies.
  write("lib/pool-client/package.json", "{}");
  const fixtureCryptoDir = path.join(cwd, "lib/pool-client/node_modules/circomlibjs");
  cpSync(cryptoDir, fixtureCryptoDir, { recursive: true });
  for (const name of Object.keys(JSON.parse(readFileSync(path.join(cryptoDir, "package.json"), "utf8")).dependencies)) {
    const target = path.join(cwd, "lib/pool-client/node_modules", name);
    mkdirSync(path.dirname(target), { recursive: true });
    symlinkSync(realpathSync(path.join(cryptoDir, "..", name)), target);
  }
  if (cryptoFault === "cjs" || cryptoFault === "esm") {
    const relative = cryptoFault === "cjs" ? "build/main.cjs" : "src/mimc7.js";
    const filename = path.join(fixtureCryptoDir, relative);
    const installed = readFileSync(filename, "utf8");
    const patched = cryptoFault === "cjs"
      ? "require('../src/ethers-utils.cjs')" : 'from "./ethers-utils.cjs"';
    const broken = cryptoFault === "cjs" ? "require('ethers')" : 'from "ethers"';
    assert.ok(installed.includes(patched), "fixture must start from patched crypto");
    writeFileSync(filename, installed.replace(patched, broken));
  } else if (cryptoFault === "helper") {
    rmSync(path.join(fixtureCryptoDir, "src/ethers-utils.cjs"));
  } else if (cryptoFault === "utility") {
    unlinkSync(path.join(cwd, "lib/pool-client/node_modules/@ethersproject/keccak256"));
  } else if (cryptoFault === "hang-cjs") {
    writeFileSync(path.join(fixtureCryptoDir, "build/main.cjs"), 'process.on("SIGTERM", () => {}); while (true) {}\n');
  } else if (cryptoFault === "hang-esm") {
    // Keep the event loop alive while module evaluation never resolves.
    writeFileSync(path.join(fixtureCryptoDir, "main.js"), 'setInterval(() => {}, 1000); await new Promise(() => {});\n');
  }
  return setup;
}

test("normal merge setup checks installed wallets and crypto and preserves the migration command", t => {
  const setup = fixture(t);
  const result = setup.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed wallet dependency compatibility check passed/);
  assert.match(result.stdout, /Installed private-pool crypto dependency compatibility check passed/);
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
  assert.deepEqual(setup.checks(), ["wallet", "pool"]);
});

test("a missing installed patch fails setup before migration without forcing a reinstall", t => {
  const setup = fixture(t, { missingPatch: true });
  const result = setup.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Installed wallet dependency compatibility check failed/);
  assert.match(result.stderr, /decodeComponent is not a function/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-pool crypto dependency compatibility check/);
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
});

for (const cryptoFault of ["cjs", "esm", "helper", "utility"]) {
  test(`broken installed crypto ${cryptoFault} fails before migration without reinstalling`, t => {
    const setup = fixture(t, { cryptoFault });
    const result = setup.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /Installed wallet dependency compatibility check passed/);
    assert.match(result.stderr, /Installed private-pool crypto dependency compatibility check failed/);
    assert.match(result.stderr, /circomlibjs compatibility patch/);
    assert.doesNotMatch(result.stdout, /Installed private-pool crypto dependency compatibility check passed/);
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
  });
}

test("an install command that cannot start gives a phase-specific error and exits with 1", t => {
  const setup = fixture(t, { lightweight: true });
  const result = setup.runInstall({ PATH: "/nonexistent" });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Dependency install could not start; setup stopped before compatibility checks and migrations/);
  assert.match(result.stderr, /spawn pnpm ENOENT/);
  assert.doesNotMatch(result.stderr, /timed out|terminated by/);
  assert.deepEqual(setup.calls(), []);
  assert.deepEqual(setup.checks(), []);
});

for (const installExit of [42, 124, 137]) {
  test(`installation failure ${installExit} remains fatal and never reaches the compatibility gate`, t => {
    const setup = fixture(t, { installExit });
    const result = setup.run();
    assert.equal(result.status, installExit, result.stderr);
    assert.doesNotMatch(result.stderr, /timed out/);
    assert.doesNotMatch(result.stdout + result.stderr, /wallet dependency compatibility check/);
    assert.doesNotMatch(result.stdout + result.stderr, /private-pool crypto dependency compatibility check/);
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
    assert.deepEqual(setup.checks(), []);
  });
}

test("a hanging install is killed before compatibility checks or migrations", t => {
  const setup = fixture(t, { installHang: true, installTimeout: "1000" });
  const started = Date.now();
  const result = setup.run();
  assert.equal(result.error, undefined, "the install deadline must fire before the fixture's outer timeout");
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(Date.now() - started < 6000, "install should not exhaust the overall setup budget");
  assert.match(result.stderr, /Dependency install timed out after 1000 ms/);
  assert.match(result.stderr, /setup stopped before compatibility checks and migrations/);
  assert.match(result.stderr, /pnpm process group was killed/);
  assert.match(result.stderr, /rerun pnpm install --frozen-lockfile/);
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
  assert.deepEqual(setup.checks(), []);
});

for (const installTimeout of ["0", "not-a-number", "120001", "1.5", ""]) {
  test(`invalid install deadline ${JSON.stringify(installTimeout)} cannot disable the install bound`, t => {
    const setup = fixture(t, { installTimeout });
    const result = setup.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /DEPENDENCY_INSTALL_TIMEOUT_MS to an integer from 1 to 120000/);
    assert.deepEqual(setup.calls(), []);
    assert.deepEqual(setup.checks(), []);
  });
}

test("migration failures remain fatal after a successful compatibility gate", t => {
  const setup = fixture(t, { migrationExit: 43 });
  const result = setup.run();
  assert.equal(result.status, 43, result.stderr);
  assert.match(result.stdout, /Installed wallet dependency compatibility check passed/);
  assert.match(result.stdout, /Installed private-pool crypto dependency compatibility check passed/);
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
});

for (const migrationExit of [42, 124, 137]) {
  test(`ordinary migration failure ${migrationExit} is not relabeled as a timeout`, t => {
    const setup = fixture(t, { lightweight: true, migrationExit });
    const result = setup.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, migrationExit, result.stderr);
    assert.doesNotMatch(result.stderr, /timed out|SIGTERM|killed/);
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
    assert.deepEqual(setup.checks(), ["wallet", "pool"]);
  });
}

// A terminated orphan can briefly remain a Linux zombie while init reaps it;
// that is no longer executing and must not be mistaken for a live process.
function assertStopped(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    assert.match(stat.slice(stat.lastIndexOf(")") + 2), /^[ZX] /,
      `fixture process ${pid} must not still be running`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function cancelShell(setup, signal, readyFile, { repeat = false } = {}) {
  const { child, done } = setup.start();
  // Always reap the shell on a failed assertion; fixture cleanup separately
  // kills phase and detached pnpm groups, even on a test failure.
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error("setup shell cancellation exceeded 8 seconds")), 8000);
  });
  try {
    return await Promise.race([deadline, (async () => {
      while (!setup.exists(readyFile)) {
        assert.equal(child.exitCode, null, "shell must reach the active fixture phase");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const started = Date.now();
      assert.equal(child.kill(signal), true, "signal only the setup shell PID");
      const interval = repeat ? setInterval(() => child.kill("SIGINT"), 50) : undefined;
      try {
        const result = await done;
        assert.equal(result.signal, null, result.stderr);
        assert.equal(result.status, signal === "SIGTERM" ? 143 : 130, result.stderr);
        assert.ok(Date.now() - started < 5000, "cancellation must not wait for the phase deadline");
        assert.match(result.stderr, new RegExp(`Setup shell received ${signal}`));
        assert.doesNotMatch(result.stderr, /timed out/);
        assertStopped(child.pid);
        return result;
      } finally {
        clearInterval(interval);
      }
    })()]);
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  for (const phase of ["wallet", "pool"]) {
    for (const blocked of [false, true]) {
      test(`direct ${phase} runner ${signal} kills a ${blocked ? "synchronously blocked" : "signal-ignoring asynchronous"} consumer`, { timeout: 12000 }, async t => {
        const setup = fixture(t, { lightweight: true, checkTimeout: "120000" });
        setup.write(`scripts/check-${phase}-dependencies.mjs`, `
import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {});
process.on("SIGINT", () => {});
writeFileSync("phase-pid", String(process.ppid));
writeFileSync("consumer-pid", String(process.pid));
${blocked ? "while (true) {}" : "setInterval(() => {}, 1000);"}
`);
        const { child, done } = setup.startCheck(phase);
        let timer;
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("direct runner cancellation exceeded 8 seconds")), 8000);
        });
        try {
          await Promise.race([deadline, (async () => {
            while (!setup.exists("consumer-pid")) {
              assert.equal(child.exitCode, null, "runner must reach its consumer");
              assert.equal(child.signalCode, null);
              await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.equal(Number(setup.read("phase-pid")), child.pid);
            const started = Date.now();
            assert.equal(child.kill(signal), true, "signal only the standalone Node runner PID");
            const result = await done;
            assert.equal(result.signal, null, result.stderr);
            assert.equal(result.status, signal === "SIGTERM" ? 143 : 130, result.stderr);
            assert.ok(Date.now() - started < 5000, "cancellation must not wait for the 120-second check deadline");
            assert.match(result.stderr, new RegExp(`runner received ${signal}`));
            assert.match(result.stderr, /setup stopped before migrations.*check process was killed/);
            assert.doesNotMatch(result.stderr, /timed out|could not complete/);
            assert.equal((result.stderr.match(/runner received/g) ?? []).length, 1);
            assertStopped(child.pid);
            assertStopped(setup.read("consumer-pid").trim());
            assert.deepEqual(setup.calls(), [], "standalone checks must not install or migrate");
            assert.deepEqual(setup.checks(), [phase]);
          })()]);
        } finally {
          clearTimeout(timer);
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }
      });
    }
  }
}

for (const phase of ["wallet", "pool"]) {
  for (const scenario of [
    { name: "repeated SIGTERM", signals: ["SIGTERM", "SIGTERM", "SIGTERM"] },
    { name: "repeated SIGINT", signals: ["SIGINT", "SIGINT", "SIGINT"] },
    { name: "SIGTERM followed by SIGINT", signals: ["SIGTERM", "SIGINT", "SIGTERM"] },
    { name: "SIGINT followed by SIGTERM", signals: ["SIGINT", "SIGTERM", "SIGINT"] },
    { name: "SIGTERM just before deadline expiry", signals: ["SIGTERM", "SIGINT"], nearDeadline: true },
    { name: "SIGINT just before deadline expiry", signals: ["SIGINT", "SIGTERM"], nearDeadline: true },
    { name: "deadline expiry followed by SIGTERM and SIGINT", signals: ["SIGTERM", "SIGINT"], timeoutFirst: true },
    { name: "deadline expiry followed by SIGINT and SIGTERM", signals: ["SIGINT", "SIGTERM"], timeoutFirst: true },
  ]) {
    test(`standalone ${phase} runner keeps its first stop on ${scenario.name}`, { timeout: 12000 }, async t => {
      const deadlineMs = scenario.nearDeadline || scenario.timeoutFirst ? 2000 : 120000;
      const setup = fixture(t, { lightweight: true, checkTimeout: String(deadlineMs) });
      // Keep the real runner and its timers/signal handlers intact. A fixture-only
      // handle delays exit after SIGKILL, making later interrupts observable rather
      // than silently sending them to an already-exited process. Listener order
      // records delivery only after the production signal handler has run.
      setup.write("scripts/run-dependency-check.mjs",
        readFileSync(path.join(root, "scripts/run-dependency-check.mjs"), "utf8") + `
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
writeFileSync("runner-armed-at", String(Date.now()));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => appendFileSync("delivered-signals", signal + "\\n"));
}
const fixtureHold = setInterval(() => {
  if (existsSync("release-runner")) clearInterval(fixtureHold);
}, 10);
`);
      setup.write(`scripts/check-${phase}-dependencies.mjs`, `
import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {});
process.on("SIGINT", () => {});
writeFileSync("phase-pid", String(process.ppid));
writeFileSync("consumer-pid", String(process.pid));
setInterval(() => {}, 1000);
`);
      const { child, done } = setup.startCheck(phase);
      let stderr = "";
      child.stderr.on("data", data => { stderr += data; });
      let timer;
      const outerDeadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("standalone signal/deadline fixture exceeded 8 seconds")), 8000);
      });
      const waitUntil = async (ready, message, budget = 1000) => {
        const end = Date.now() + budget;
        while (!ready()) {
          assert.equal(child.exitCode, null, `runner exited before ${message}`);
          assert.equal(child.signalCode, null, `runner was killed before ${message}`);
          assert.ok(Date.now() < end, `timed out waiting for ${message}`);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };
      const sleepUntil = async at => {
        while (Date.now() < at) {
          await new Promise(resolve => setTimeout(resolve, Math.min(20, at - Date.now())));
        }
      };
      try {
        await Promise.race([outerDeadline, (async () => {
          await waitUntil(() => setup.exists("consumer-pid"), "consumer readiness", 4000);
          assert.equal(Number(setup.read("phase-pid")), child.pid);
          const expiresAt = Number(setup.read("runner-armed-at")) + deadlineMs;
          const consumerPid = setup.read("consumer-pid").trim();
          if (scenario.nearDeadline) {
            assert.ok(Date.now() < expiresAt - 300, "consumer startup must leave room for the pre-deadline interrupt");
            await sleepUntil(expiresAt - 300);
          }
          if (scenario.timeoutFirst) {
            await waitUntil(() => /timed out/.test(stderr), "original check deadline", deadlineMs + 750);
            assert.ok(Date.now() < expiresAt + 750, "the check must stop at its original deadline");
          }
          const firstStopAt = Date.now();
          const delivered = [];
          for (const signal of scenario.signals) {
            assert.equal(child.kill(signal), true, "signal only the standalone runner PID");
            delivered.push(signal);
            await waitUntil(() => setup.exists("delivered-signals")
              && setup.read("delivered-signals").trim().split("\n").length === delivered.length,
            `${signal} delivery`);
            assert.deepEqual(setup.read("delivered-signals").trim().split("\n"), delivered);
            // Observe real consumer death while the runner is still held open,
            // not merely after fixture cleanup has had a chance to kill it.
            await waitUntil(() => {
              try { assertStopped(consumerPid); return true; } catch (error) {
                if (error.code !== "ERR_ASSERTION") throw error;
                return false;
              }
            }, "immediate consumer termination", 750);
          }
          assert.ok(Date.now() - firstStopAt < 750, "repeated cancellation must not postpone consumer termination");
          if (scenario.nearDeadline || scenario.timeoutFirst) {
            // Cross the original timer boundary before releasing the runner.
            // A cancelled deadline must not emit a second stop diagnostic.
            await sleepUntil(expiresAt + 100);
            assert.equal(child.kill("SIGINT"), true);
            delivered.push("SIGINT");
            await waitUntil(() => setup.read("delivered-signals").trim().split("\n").length === delivered.length,
              "post-deadline interrupt delivery");
          }
          setup.write("release-runner", "");
          const result = await done;
          const firstSignal = scenario.signals[0];
          assert.equal(result.signal, null, result.stderr);
          assert.equal(result.status, scenario.timeoutFirst ? 1 : firstSignal === "SIGTERM" ? 143 : 130, result.stderr);
          assert.match(result.stderr, /setup stopped before migrations.*check process was killed/);
          assert.equal((result.stderr.match(/setup stopped before migrations/g) ?? []).length, 1, result.stderr);
          if (scenario.timeoutFirst) {
            assert.match(result.stderr, new RegExp(`timed out after ${deadlineMs} ms`));
            assert.doesNotMatch(result.stderr, /runner received|could not complete/);
          } else {
            assert.match(result.stderr, new RegExp(`runner received ${firstSignal}`));
            assert.doesNotMatch(result.stderr, /timed out|could not complete/);
          }
          assert.ok(Date.now() - firstStopAt < 1000, "cancellation must not extend the original deadline or wait for a new one");
          assertStopped(child.pid);
          assertStopped(consumerPid);
          assert.deepEqual(setup.calls(), [], "standalone checks must not install or migrate");
          assert.deepEqual(setup.checks(), [], "fixture runs the unmodified standalone runner, not the shell");
        })()]);
      } finally {
        clearTimeout(timer);
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
    });
  }

  for (const code of [0, 7, 124, 137]) {
    for (const stop of ["SIGTERM", "SIGINT", "deadline"]) {
      for (const completionFirst of [true, false]) {
        test(`standalone ${phase} runner keeps its first outcome when exit ${code} ${completionFirst ? "precedes" : "follows"} ${stop}`, { timeout: 12000 }, async t => {
          const deadlineMs = stop === "deadline" ? 1500 : 120000;
          const setup = fixture(t, { lightweight: true, checkTimeout: String(deadlineMs) });
          // Append observation hooks to the real runner, without replacing its
          // stop/close handlers or timers. Only the stop-first fixture gates
          // close delivery: the consumer really exits normally, but the runner
          // observes cancellation before that queued completion notification.
          setup.write("scripts/run-dependency-check.mjs",
            readFileSync(path.join(root, "scripts/run-dependency-check.mjs"), "utf8") + `
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => appendFileSync("delivered-signals", signal + "\\n"));
}
child.on("close", (code, signal) => {
  writeFileSync("observed-close", JSON.stringify({ code, signal, exitCode: process.exitCode }));
});
${completionFirst ? "" : `
const originalEmit = child.emit;
let pendingClose;
child.emit = function(event, ...args) {
  if (event === "close") {
    pendingClose = args;
    writeFileSync("pending-close", JSON.stringify(args));
    return true;
  }
  return originalEmit.call(this, event, ...args);
};
`}
const fixtureHold = setInterval(() => {
  ${completionFirst ? "" : `
  if (pendingClose && existsSync("release-close")) {
    const args = pendingClose;
    pendingClose = undefined;
    originalEmit.call(child, "close", ...args);
  }
  `}
  if (existsSync("release-runner")) clearInterval(fixtureHold);
}, 10);
${stop === "deadline" ? `setTimeout(() => writeFileSync("deadline-crossed", ""), timeout + 100);` : ""}
writeFileSync("runner-ready", "");
`);
          setup.write(`scripts/check-${phase}-dependencies.mjs`, `
import { existsSync, writeFileSync } from "node:fs";
writeFileSync("phase-pid", String(process.ppid));
writeFileSync("consumer-pid", String(process.pid));
const waitForRelease = setInterval(() => {
  if (existsSync("release-consumer")) process.exit(${code});
}, 10);
`);
          const { child, done } = setup.startCheck(phase);
          let stderr = "";
          child.stderr.on("data", data => { stderr += data; });
          let timer;
          const outerDeadline = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("standalone completion/stop fixture exceeded 8 seconds")), 8000);
          });
          const waitUntil = async (ready, message, budget = 1000) => {
            const end = Date.now() + budget;
            while (!ready()) {
              assert.equal(child.exitCode, null, `runner exited before ${message}`);
              assert.equal(child.signalCode, null, `runner was killed before ${message}`);
              assert.ok(Date.now() < end, `timed out waiting for ${message}`);
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          };
          try {
            await Promise.race([outerDeadline, (async () => {
              await waitUntil(() => setup.exists("runner-ready") && setup.exists("consumer-pid"), "runner and consumer readiness", 4000);
              assert.equal(Number(setup.read("phase-pid")), child.pid);
              setup.write("release-consumer", "");
              await waitUntil(() => setup.exists(completionFirst ? "observed-close" : "pending-close"), "ordinary consumer completion");
              const consumerPid = setup.read("consumer-pid").trim();
              assertStopped(consumerPid);
              if (completionFirst) {
                assert.deepEqual(JSON.parse(setup.read("observed-close")), { code, signal: null, exitCode: code });
                assert.equal(stderr, "", "ordinary completion must not emit a stop diagnostic");
              } else {
                assert.deepEqual(JSON.parse(setup.read("pending-close")), [code, null]);
                assert.equal(stderr, "", "completion is queued, but no terminal outcome has been observed");
              }
              if (stop === "deadline") {
                await waitUntil(() => setup.exists("deadline-crossed"), "original deadline boundary", deadlineMs + 1000);
                if (!completionFirst) assert.match(stderr, new RegExp(`timed out after ${deadlineMs} ms`));
              } else {
                assert.equal(child.kill(stop), true, "signal only the still-live standalone runner");
                await waitUntil(() => setup.exists("delivered-signals"), `${stop} delivery after the production handler`);
                assert.equal(setup.read("delivered-signals"), `${stop}\n`);
                if (!completionFirst) assert.match(stderr, new RegExp(`runner received ${stop}`));
              }
              const expectedCode = completionFirst ? code : stop === "deadline" ? 1 : stop === "SIGTERM" ? 143 : 130;
              if (!completionFirst) {
                setup.write("release-close", "");
                await waitUntil(() => setup.exists("observed-close"), "queued ordinary completion after the stop");
                assert.deepEqual(JSON.parse(setup.read("observed-close")), { code, signal: null, exitCode: expectedCode });
              }
              setup.write("release-runner", "");
              const result = await done;
              assert.equal(result.signal, null, result.stderr);
              assert.equal(result.status, expectedCode, result.stderr);
              if (completionFirst) {
                assert.equal(result.stderr, "", "a later stop must not relabel ordinary completion");
              } else {
                const diagnostic = stop === "deadline" ? `timed out after ${deadlineMs} ms` : `runner received ${stop}`;
                assert.match(result.stderr, new RegExp(diagnostic));
                assert.match(result.stderr, /setup stopped before migrations.*check process was killed/);
                assert.equal((result.stderr.match(/setup stopped before migrations/g) ?? []).length, 1, result.stderr);
                assert.doesNotMatch(result.stderr, stop === "deadline" ? /runner received|could not complete/ : /timed out|could not complete/);
              }
              assertStopped(child.pid);
              assertStopped(consumerPid);
              assert.deepEqual(setup.calls(), [], "standalone checks must not install or migrate");
              assert.deepEqual(setup.checks(), [], "fixture runs the real standalone runner, not the shell");
            })()]);
          } finally {
            clearTimeout(timer);
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
          }
        });
      }
    }
  }

  for (const failure of ["spawn-error", "SIGTERM", "SIGINT"]) {
    for (const stop of ["SIGTERM", "SIGINT", "deadline"]) {
      for (const failureFirst of [true, false]) {
        test(`standalone ${phase} runner keeps its first failure outcome when ${failure} ${failureFirst ? "precedes" : "follows"} ${stop}`, { timeout: 12000 }, async t => {
          const deadlineMs = stop === "deadline" ? 1500 : 120000;
          const setup = fixture(t, { lightweight: true, checkTimeout: String(deadlineMs) });
          // Generate real spawn/error/close events, but queue their delivery until
          // explicitly released. The production handlers and deadline stay intact.
          // A nonexistent executable produces ENOENT without starting a consumer.
          setup.write("scripts/run-dependency-check.mjs", `
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { format } from "node:util";
let diagnostics = "";
const originalError = console.error;
console.error = (...args) => {
  diagnostics += format(...args) + "\\n";
  originalError(...args);
};
${failure === "spawn-error" ? 'process.execPath = new URL("./missing-node", import.meta.url).pathname;' : ""}
` + readFileSync(path.join(root, "scripts/run-dependency-check.mjs"), "utf8") + `
const snapshot = () => ({ exitCode: process.exitCode ?? null, diagnostics });
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    appendFileSync("delivered-signals", signal + "\\n");
    writeFileSync("observed-stop", JSON.stringify(snapshot()));
  });
}
child.on("error", error => {
  writeFileSync("observed-error", JSON.stringify({ ...snapshot(), errorCode: error.code }));
});
child.on("close", (code, signal) => {
  writeFileSync("observed-close", JSON.stringify({ ...snapshot(), code, signal }));
});
const originalEmit = child.emit;
const pending = [];
child.emit = function(event, ...args) {
  if (event === "error" || event === "close") {
    pending.push([event, args]);
    writeFileSync("pending-events", JSON.stringify(pending.map(([name, values]) =>
      name === "error" ? [name, values[0].code] : [name, ...values])));
    return true;
  }
  return originalEmit.call(this, event, ...args);
};
const fixtureHold = setInterval(() => {
  if (existsSync("release-failure")) {
    while (pending.length) {
      const [event, args] = pending.shift();
      originalEmit.call(child, event, ...args);
    }
  }
  if (existsSync("release-runner")) clearInterval(fixtureHold);
}, 10);
${stop === "deadline" ? `setTimeout(() => {
  writeFileSync("observed-stop", JSON.stringify(snapshot()));
  writeFileSync("deadline-crossed", "");
}, timeout + 100);` : ""}
writeFileSync("runner-ready", JSON.stringify({ consumerPid: child.pid ?? null }));
`);
          setup.write(`scripts/check-${phase}-dependencies.mjs`, `
import { writeFileSync } from "node:fs";
writeFileSync("phase-pid", String(process.ppid));
writeFileSync("consumer-pid", String(process.pid));
setInterval(() => {}, 1000);
`);
          const { child, done } = setup.startCheck(phase);
          let timer;
          const outerDeadline = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("standalone failure/stop fixture exceeded 8 seconds")), 8000);
          });
          const waitUntil = async (ready, message, budget = 1000) => {
            const end = Date.now() + budget;
            while (!ready()) {
              assert.equal(child.exitCode, null, `runner exited before ${message}`);
              assert.equal(child.signalCode, null, `runner was killed before ${message}`);
              assert.ok(Date.now() < end, `timed out waiting for ${message}`);
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          };
          const state = name => {
            const { exitCode, diagnostics } = JSON.parse(setup.read(name));
            return { exitCode, diagnostics };
          };
          try {
            await Promise.race([outerDeadline, (async () => {
              await waitUntil(() => setup.exists("runner-ready"), "runner readiness", 4000);
              let consumerPid;
              if (failure === "spawn-error") {
                assert.equal(JSON.parse(setup.read("runner-ready")).consumerPid, null);
                assert.equal(setup.exists("consumer-pid"), false, "failed spawn must not start a consumer");
              } else {
                await waitUntil(() => setup.exists("consumer-pid"), "consumer readiness", 4000);
                assert.equal(Number(setup.read("phase-pid")), child.pid);
                consumerPid = Number(setup.read("consumer-pid"));
                process.kill(consumerPid, failure);
              }
              // Both error and its subsequent close must be queued for ENOENT;
              // the signal case queues a real signal-bearing close, not an exit.
              await waitUntil(() => setup.exists("pending-events")
                && JSON.parse(setup.read("pending-events")).some(([event]) => event === "close"),
              "queued failure events");
              const events = JSON.parse(setup.read("pending-events"));
              if (failure === "spawn-error") {
                assert.deepEqual(events.map(([event]) => event), ["error", "close"]);
                assert.equal(events[0][1], "ENOENT");
              } else {
                assert.deepEqual(events, [["close", null, failure]]);
                assertStopped(consumerPid);
              }
              const releaseFailure = async () => {
                setup.write("release-failure", "");
                await waitUntil(() => setup.exists("observed-close"), "failure delivery after production handlers");
                if (failure === "spawn-error") {
                  assert.equal(JSON.parse(setup.read("observed-error")).errorCode, "ENOENT");
                  assert.deepEqual(state("observed-close"), state("observed-error"),
                    "the close after a spawn error must preserve its first outcome");
                } else {
                  const observed = JSON.parse(setup.read("observed-close"));
                  assert.equal(observed.code, null);
                  assert.equal(observed.signal, failure);
                }
              };
              const deliverStop = async () => {
                if (stop === "deadline") {
                  await waitUntil(() => setup.exists("deadline-crossed"), "original deadline boundary", deadlineMs + 1000);
                } else {
                  assert.equal(child.kill(stop), true, "signal only the held-open standalone runner");
                  await waitUntil(() => setup.exists("observed-stop"), "stop delivery after production handler");
                  assert.equal(setup.read("delivered-signals"), `${stop}\n`);
                }
              };
              if (failureFirst) await releaseFailure();
              else await deliverStop();
              const first = state(failureFirst ? "observed-close" : "observed-stop");
              const expectedCode = failureFirst || stop === "deadline" ? 1 : stop === "SIGTERM" ? 143 : 130;
              assert.equal(first.exitCode, expectedCode);
              assert.equal((first.diagnostics.match(/setup stopped before migrations/g) ?? []).length, 1);
              if (failureFirst) {
                assert.match(first.diagnostics, /could not complete; setup stopped before migrations/);
                assert.match(first.diagnostics, failure === "spawn-error" ? /spawn .*missing-node ENOENT/ : new RegExp(`Terminated by ${failure}`));
                assert.doesNotMatch(first.diagnostics, /runner received|timed out/);
                await deliverStop();
              } else {
                assert.match(first.diagnostics, new RegExp(stop === "deadline" ? `timed out after ${deadlineMs} ms` : `runner received ${stop}`));
                assert.doesNotMatch(first.diagnostics, /could not complete|Terminated by|ENOENT/);
                await releaseFailure();
              }
              assert.deepEqual(state("observed-close"), first);
              assert.deepEqual(state("observed-stop"), first,
                "later events must not change the first exit code or diagnostic");
              setup.write("release-runner", "");
              const result = await done;
              assert.equal(result.signal, null, result.stderr);
              assert.equal(result.status, first.exitCode, result.stderr);
              assert.equal(result.stderr, first.diagnostics);
              assertStopped(child.pid);
              if (consumerPid) assertStopped(consumerPid);
              else assert.equal(setup.exists("consumer-pid"), false);
              assert.deepEqual(setup.calls(), [], "standalone checks must not install or migrate");
              assert.deepEqual(setup.checks(), [], "fixture runs the real standalone runner, not the shell");
            })()]);
          } finally {
            clearTimeout(timer);
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
          }
        });
      }
    }
  }

  for (const code of [0, 7, 124, 137]) {
    test(`direct ${phase} runner preserves ordinary consumer exit ${code}`, t => {
      const setup = fixture(t, { lightweight: true });
      setup.write(`scripts/check-${phase}-dependencies.mjs`, `process.exit(${code});\n`);
      const result = setup.runCheck(phase);
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, code, result.stderr);
      assert.equal(result.stderr, "");
      assert.deepEqual(setup.calls(), []);
    });
  }
  test(`direct ${phase} runner preserves consumer signal diagnostics`, t => {
    const setup = fixture(t, { lightweight: true });
    setup.write(`scripts/check-${phase}-dependencies.mjs`, 'process.kill(process.pid, "SIGTERM");\n');
    const result = setup.runCheck(phase);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /could not complete; setup stopped before migrations.*Terminated by SIGTERM/);
    assert.doesNotMatch(result.stderr, /timed out|runner received/);
    assert.deepEqual(setup.calls(), []);
  });
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  for (const stubborn of [false, true]) {
    test(`cancelling the setup shell with ${signal} stops install${stubborn ? " and a stubborn lifecycle descendant" : ""}`, async t => {
      const setup = fixture(t, {
        lightweight: true,
        installBody: `
echo $$ > install-pid
echo $PPID > phase-pid
trap 'echo terminated > install-term; exit 0' TERM
${stubborn ? `bash -c 'trap "" TERM INT; echo $$ > install-descendant-pid; while true; do sleep 0.1; done' &
while [ ! -f install-descendant-pid ]; do sleep 0.01; done` : ""}
echo ready > install-ready
while true; do sleep 0.1; done`,
      });
      const result = await cancelShell(setup, signal, "install-ready");
      assert.match(result.stderr, new RegExp(`Dependency install runner received ${signal}`));
      assert.equal(setup.read("install-term").trim(), "terminated");
      for (const name of ["phase-pid", "install-pid", ...(stubborn ? ["install-descendant-pid"] : [])]) {
        assertStopped(setup.read(name).trim());
      }
      assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
      assert.deepEqual(setup.checks(), []);
    });
  }

  for (const phase of ["wallet", "pool"]) {
    test(`cancelling the setup shell with ${signal} kills a blocked ${phase} check and skips remaining phases`, async t => {
      const setup = fixture(t, { lightweight: true });
      setup.write(`scripts/check-${phase === "wallet" ? "wallet" : "pool"}-dependencies.mjs`, `
import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {});
process.on("SIGINT", () => {});
writeFileSync("phase-pid", String(process.ppid));
writeFileSync("consumer-pid", String(process.pid));
while (true) {}
`);
      await cancelShell(setup, signal, "consumer-pid");
      assertStopped(setup.read("phase-pid").trim());
      assertStopped(setup.read("consumer-pid").trim());
      assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
      assert.deepEqual(setup.checks(), phase === "wallet" ? ["wallet"] : ["wallet", "pool"]);
    });
  }

  test(`cancelling the setup shell with ${signal} stops an active migration without retrying`, async t => {
    const setup = fixture(t, {
      lightweight: true,
      migrationBody: `
echo $$ > migration-pid
echo $PPID > phase-pid
trap 'exit 0' TERM
bash -c 'trap "" TERM INT; echo $$ > migration-descendant-pid; while true; do sleep 0.1; done' &
while [ ! -f migration-descendant-pid ]; do sleep 0.01; done
echo ready > migration-ready
while true; do sleep 0.1; done`,
    });
    const result = await cancelShell(setup, signal, "migration-ready");
    assert.match(result.stderr, new RegExp(`Database migration runner received ${signal}`));
    for (const name of ["phase-pid", "migration-pid", "migration-descendant-pid"]) assertStopped(setup.read(name).trim());
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
    assert.deepEqual(setup.checks(), ["wallet", "pool"]);
  });
}

test("repeated setup-shell signals preserve the first exit code and bounded cleanup", async t => {
  const setup = fixture(t, {
    lightweight: true,
    installBody: `
echo $$ > install-pid
echo $PPID > phase-pid
trap '' TERM
echo ready > install-ready
while true; do sleep 0.1; done`,
  });
  const result = await cancelShell(setup, "SIGTERM", "install-ready", { repeat: true });
  assert.equal((result.stderr.match(/Setup shell received/g) ?? []).length, 1);
  assertStopped(setup.read("phase-pid").trim());
  assertStopped(setup.read("install-pid").trim());
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
  assert.deepEqual(setup.checks(), []);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  for (const ignoresTerm of [false, true]) {
    test(`interrupted install (${signal}) cleans up a leader ${ignoresTerm ? "ignoring" : "accepting"} SIGTERM`, t => {
      const setup = fixture(t, {
        lightweight: true,
        installBody: `
echo $$ > install-pid
${ignoresTerm ? "trap '' TERM" : "trap 'echo terminated > install-term; exit 0' TERM"}
kill -${signal.slice(3)} "$PPID"
while true; do sleep 0.1; done`,
      });
      const started = Date.now();
      const result = setup.run(10000);
      assert.equal(result.error, undefined, "interrupt cleanup must finish before the outer timeout");
      assert.equal(result.signal, null);
      assert.equal(result.status, signal === "SIGTERM" ? 143 : 130, result.stderr);
      assert.ok(Date.now() - started < 10000);
      assert.match(result.stderr, new RegExp(`Dependency install runner received ${signal}`));
      assert.match(result.stderr, /setup stopped before compatibility checks and migrations/);
      assert.match(result.stderr, /SIGTERM.*process group.*killed after 1000 ms/);
      assert.doesNotMatch(result.stderr, /timed out/);
      if (!ignoresTerm) assert.equal(setup.read("install-term").trim(), "terminated");
      assertStopped(setup.read("install-pid").trim());
      assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
      assert.deepEqual(setup.checks(), []);
    });
  }

  test(`interrupted install (${signal}) kills a stubborn descendant after its leader exits`, t => {
    const setup = fixture(t, {
      lightweight: true,
      installBody: `
echo $$ > install-pid
runner=$PPID
trap 'echo terminated > install-term; exit 0' TERM
bash -c 'trap "" TERM; echo $$ > install-descendant-pid; while true; do sleep 0.1; done' &
while [ ! -f install-descendant-pid ]; do sleep 0.01; done
kill -${signal.slice(3)} "$runner"
while true; do sleep 0.1; done`,
    });
    const started = Date.now();
    const result = setup.run(10000);
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, signal === "SIGTERM" ? 143 : 130, result.stderr);
    assert.ok(Date.now() - started < 10000);
    assert.match(result.stderr, new RegExp(`runner received ${signal}`));
    assert.doesNotMatch(result.stderr, /timed out/);
    assert.equal(setup.read("install-term").trim(), "terminated");
    assertStopped(setup.read("install-pid").trim());
    assertStopped(setup.read("install-descendant-pid").trim());
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
    assert.deepEqual(setup.checks(), []);
  });
}

for (const code of [0, 42, 124, 137]) {
  for (const stop of ["SIGTERM", "SIGINT", "deadline"]) {
    for (const completionFirst of [true, false]) {
      test(`standalone install runner keeps its first outcome when exit ${code} ${completionFirst ? "precedes" : "follows"} ${stop}`, { timeout: 12000 }, async t => {
        const deadlineMs = stop === "deadline" ? 1500 : 120000;
        const setup = fixture(t, {
          lightweight: true, installTimeout: String(deadlineMs),
          installBody: `exec "${process.execPath}" scripts/install-fixture.mjs`,
        });
        // Queue a real ordinary close, holding the runner open to deliver both
        // outcomes in a controlled order. Production handlers/timers stay intact.
        setup.write("scripts/run-dependency-install.mjs", `
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { format } from "node:util";
let diagnostics = "";
const originalError = console.error;
console.error = (...args) => {
  diagnostics += format(...args) + "\\n";
  originalError(...args);
};
` + readFileSync(path.join(root, "scripts/run-dependency-install.mjs"), "utf8") + `
const snapshot = () => ({ exitCode: process.exitCode ?? null, diagnostics });
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    appendFileSync("delivered-signals", signal + "\\n");
    writeFileSync("observed-stop", JSON.stringify(snapshot()));
  });
}
child.on("close", (code, signal) => {
  writeFileSync("observed-close", JSON.stringify({ ...snapshot(), code, signal }));
});
const originalEmit = child.emit;
let pendingClose;
child.emit = function(event, ...args) {
  if (event === "close") {
    pendingClose = args;
    writeFileSync("pending-close", JSON.stringify(args));
    return true;
  }
  return originalEmit.call(this, event, ...args);
};
const fixtureHold = setInterval(() => {
  if (pendingClose && existsSync("release-close")) {
    const args = pendingClose;
    pendingClose = undefined;
    originalEmit.call(child, "close", ...args);
  }
  if (existsSync("release-runner")) clearInterval(fixtureHold);
}, 10);
${stop === "deadline" ? `setTimeout(() => {
  writeFileSync("observed-stop", JSON.stringify(snapshot()));
  writeFileSync("deadline-crossed", "");
}, timeout + 100);` : ""}
writeFileSync("runner-ready", JSON.stringify({ installPid: child.pid }));
`);
        setup.write("scripts/install-fixture.mjs", `
import { existsSync, writeFileSync } from "node:fs";
writeFileSync("phase-pid", String(process.ppid));
writeFileSync("install-pid", String(process.pid));
setInterval(() => {
  if (existsSync("release-install")) process.exit(${code});
}, 10);
`);
        const { child, done } = setup.startInstall();
        let timer;
        const outerDeadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("standalone install completion/stop fixture exceeded 8 seconds")), 8000);
        });
        const waitUntil = async (ready, message, budget = 1000) => {
          const end = Date.now() + budget;
          while (!ready()) {
            assert.equal(child.exitCode, null, `runner exited before ${message}`);
            assert.equal(child.signalCode, null, `runner was killed before ${message}`);
            assert.ok(Date.now() < end, `timed out waiting for ${message}`);
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        };
        const state = name => {
          const { exitCode, diagnostics } = JSON.parse(setup.read(name));
          return { exitCode, diagnostics };
        };
        try {
          await Promise.race([outerDeadline, (async () => {
            await waitUntil(() => setup.exists("runner-ready") && setup.exists("install-pid"), "runner and install readiness", 4000);
            const installPid = Number(setup.read("install-pid"));
            assert.equal(Number(setup.read("phase-pid")), child.pid);
            assert.equal(JSON.parse(setup.read("runner-ready")).installPid, installPid);
            setup.write("release-install", "");
            await waitUntil(() => setup.exists("pending-close"), "queued ordinary pnpm completion");
            assert.deepEqual(JSON.parse(setup.read("pending-close")), [code, null],
              "124/137 must be numeric exits, not signal termination");
            assertStopped(installPid);
            const releaseCompletion = async () => {
              setup.write("release-close", "");
              await waitUntil(() => setup.exists("observed-close"), "ordinary completion delivery after production handler");
              const observed = JSON.parse(setup.read("observed-close"));
              assert.equal(observed.code, code);
              assert.equal(observed.signal, null);
            };
            const deliverStop = async () => {
              if (stop === "deadline") {
                await waitUntil(() => setup.exists("deadline-crossed"), "original deadline boundary", deadlineMs + 1000);
              } else {
                assert.equal(child.kill(stop), true, "signal only the held-open standalone runner");
                await waitUntil(() => setup.exists("observed-stop"), "stop delivery after production handler");
                assert.equal(setup.read("delivered-signals"), `${stop}\n`);
              }
            };
            if (completionFirst) await releaseCompletion();
            else await deliverStop();
            const first = state(completionFirst ? "observed-close" : "observed-stop");
            const expectedCode = completionFirst ? code : stop === "deadline" ? 1 : stop === "SIGTERM" ? 143 : 130;
            assert.equal(first.exitCode, expectedCode);
            if (completionFirst) {
              assert.equal(first.diagnostics, "", "ordinary exits, including 124/137, are not deadline failures");
              await deliverStop();
            } else {
              assert.match(first.diagnostics, new RegExp(stop === "deadline"
                ? `Dependency install timed out after ${deadlineMs} ms` : `Dependency install runner received ${stop}`));
              assert.equal((first.diagnostics.match(/setup stopped before compatibility checks and migrations/g) ?? []).length, 1);
              assert.doesNotMatch(first.diagnostics, /could not start|terminated by/);
              if (stop !== "deadline") assert.doesNotMatch(first.diagnostics, /timed out/);
              else assert.doesNotMatch(first.diagnostics, /runner received/);
              await releaseCompletion();
            }
            assert.deepEqual(state("observed-close"), first);
            assert.deepEqual(state("observed-stop"), first,
              "later events must not change the first exit code or diagnostic");
            setup.write("release-runner", "");
            const result = await done;
            assert.equal(result.signal, null, result.stderr);
            assert.equal(result.status, expectedCode, result.stderr);
            assert.equal(result.stderr, first.diagnostics);
            assertStopped(child.pid);
            assertStopped(installPid);
            assert.deepEqual(setup.calls(), ["install --frozen-lockfile"], "standalone install must not migrate");
            assert.deepEqual(setup.checks(), [], "standalone install must not check compatibility");
          })()]);
        } finally {
          clearTimeout(timer);
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }
      });
    }
  }
}

// Queue delivery of real OS failure events, not synthetic failures, so even
// ENOENT can be observed after cancellation. Production handlers stay intact.
for (const failure of ["spawn-error", "SIGTERM", "SIGINT"]) {
  for (const stop of ["SIGTERM", "SIGINT", "deadline"]) {
    for (const failureFirst of [true, false]) {
      test(`standalone install runner keeps its first failure outcome when ${failure} ${failureFirst ? "precedes" : "follows"} ${stop}`, { timeout: 12000 }, async t => {
        const deadlineMs = stop === "deadline" ? 1500 : 120000;
        const setup = fixture(t, {
          lightweight: true, installTimeout: String(deadlineMs),
          installBody: `exec "${process.execPath}" scripts/install-fixture.mjs`,
        });
        setup.write("scripts/run-dependency-install.mjs", `
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { format } from "node:util";
let diagnostics = "";
const originalError = console.error;
console.error = (...args) => {
  diagnostics += format(...args) + "\\n";
  originalError(...args);
};
// An isolated PATH without pnpm generates real spawn ENOENT.
${failure === "spawn-error" ? 'process.env.PATH = new URL("../empty-bin", import.meta.url).pathname;' : ""}
` + readFileSync(path.join(root, "scripts/run-dependency-install.mjs"), "utf8") + `
const snapshot = () => ({ exitCode: process.exitCode ?? null, diagnostics });
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    appendFileSync("delivered-signals", signal + "\\n");
    writeFileSync("observed-stop", JSON.stringify(snapshot()));
  });
}
child.on("error", error => {
  writeFileSync("observed-error", JSON.stringify({ ...snapshot(), errorCode: error.code }));
});
child.on("close", (code, signal) => {
  writeFileSync("observed-close", JSON.stringify({ ...snapshot(), code, signal }));
});
const originalEmit = child.emit;
const pending = [];
child.emit = function(event, ...args) {
  if (event === "error" || event === "close") {
    pending.push([event, args]);
    writeFileSync("pending-events", JSON.stringify(pending.map(([name, values]) =>
      name === "error" ? [name, values[0].code] : [name, ...values])));
    return true;
  }
  return originalEmit.call(this, event, ...args);
};
const fixtureHold = setInterval(() => {
  if (existsSync("release-failure")) {
    while (pending.length) {
      const [event, args] = pending.shift();
      originalEmit.call(child, event, ...args);
    }
  }
  if (existsSync("release-runner")) clearInterval(fixtureHold);
}, 10);
${stop === "deadline" ? `setTimeout(() => {
  writeFileSync("observed-stop", JSON.stringify(snapshot()));
  writeFileSync("deadline-crossed", "");
}, timeout + 100);` : ""}
writeFileSync("runner-ready", JSON.stringify({ installPid: child.pid ?? null }));
`);
        setup.write("scripts/install-fixture.mjs", `
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
writeFileSync("phase-pid", String(process.ppid));
writeFileSync("install-pid", String(process.pid));
spawn(process.execPath, ["scripts/install-descendant.mjs"], { stdio: "ignore" });
setInterval(() => {}, 1000);
`);
        setup.write("scripts/install-descendant.mjs", `
import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => {});
process.on("SIGINT", () => {});
writeFileSync("install-descendant-pid", String(process.pid));
setInterval(() => {}, 1000);
`);
        const { child, done } = setup.startInstall();
        let timer;
        const outerDeadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("standalone install failure/stop fixture exceeded 8 seconds")), 8000);
        });
        const waitUntil = async (ready, message, budget = 1000) => {
          const end = Date.now() + budget;
          while (!ready()) {
            assert.equal(child.exitCode, null, `runner exited before ${message}`);
            assert.equal(child.signalCode, null, `runner was killed before ${message}`);
            assert.ok(Date.now() < end, `timed out waiting for ${message}`);
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        };
        const state = name => {
          const { exitCode, diagnostics } = JSON.parse(setup.read(name));
          return { exitCode, diagnostics };
        };
        try {
          await Promise.race([outerDeadline, (async () => {
            await waitUntil(() => setup.exists("runner-ready"), "runner readiness", 4000);
            let installPid, descendantPid;
            if (failure === "spawn-error") {
              assert.equal(JSON.parse(setup.read("runner-ready")).installPid, null);
              assert.equal(setup.exists("install-pid"), false);
              assert.equal(setup.exists("install-descendant-pid"), false);
            } else {
              await waitUntil(() => setup.exists("install-descendant-pid"), "lifecycle descendant readiness", 4000);
              assert.equal(Number(setup.read("phase-pid")), child.pid);
              installPid = Number(setup.read("install-pid"));
              descendantPid = Number(setup.read("install-descendant-pid"));
              assert.equal(JSON.parse(setup.read("runner-ready")).installPid, installPid);
              // Kill only the leader externally, leaving a stubborn descendant
              // alive until the production runner performs group cleanup.
              process.kill(installPid, failure);
            }
            await waitUntil(() => setup.exists("pending-events")
              && JSON.parse(setup.read("pending-events")).some(([event]) => event === "close"),
            "queued real failure events");
            const events = JSON.parse(setup.read("pending-events"));
            if (failure === "spawn-error") {
              assert.deepEqual(events.map(([event]) => event), ["error", "close"]);
              assert.equal(events[0][1], "ENOENT");
            } else {
              assert.deepEqual(events, [["close", null, failure]]);
              assertStopped(installPid);
              assert.throws(() => assertStopped(descendantPid), /must not still be running/,
                "descendant must be alive before production cleanup");
            }
            const releaseFailure = async () => {
              setup.write("release-failure", "");
              await waitUntil(() => setup.exists("observed-close"), "failure delivery after production handlers");
              if (failure === "spawn-error") {
                assert.equal(JSON.parse(setup.read("observed-error")).errorCode, "ENOENT");
                assert.deepEqual(state("observed-close"), state("observed-error"),
                  "close following a spawn error must preserve its first outcome");
              } else {
                const observed = JSON.parse(setup.read("observed-close"));
                assert.equal(observed.code, null);
                assert.equal(observed.signal, failure);
              }
            };
            const deliverStop = async () => {
              if (stop === "deadline") {
                await waitUntil(() => setup.exists("deadline-crossed"), "original deadline boundary", deadlineMs + 1000);
              } else {
                assert.equal(child.kill(stop), true, "signal only the held-open standalone runner");
                await waitUntil(() => setup.exists("observed-stop"), "stop delivery after production handler");
                assert.equal(setup.read("delivered-signals"), `${stop}\n`);
              }
            };
            if (failureFirst) await releaseFailure();
            else await deliverStop();
            const first = state(failureFirst ? "observed-close" : "observed-stop");
            const expectedCode = failureFirst || stop === "deadline" ? 1 : stop === "SIGTERM" ? 143 : 130;
            assert.equal(first.exitCode, expectedCode);
            assert.equal((first.diagnostics.match(/setup stopped before compatibility checks and migrations/g) ?? []).length, 1);
            if (failureFirst) {
              assert.match(first.diagnostics, failure === "spawn-error"
                ? /could not start.*spawn pnpm ENOENT/s : new RegExp(`terminated by ${failure}`));
              assert.doesNotMatch(first.diagnostics, /runner received|timed out/);
              await deliverStop();
            } else {
              assert.match(first.diagnostics, new RegExp(stop === "deadline"
                ? `timed out after ${deadlineMs} ms` : `runner received ${stop}`));
              assert.doesNotMatch(first.diagnostics, /could not start|terminated by|ENOENT/);
              await releaseFailure();
            }
            assert.deepEqual(state("observed-close"), first);
            assert.deepEqual(state("observed-stop"), first,
              "later events must not change the first exit code or diagnostic");
            if (installPid) {
              // Check before teardown can mask leaks, including group members
              // beyond the known PIDs. Linux zombies no longer execute.
              await waitUntil(() => {
                try { assertStopped(descendantPid); return true; } catch (error) {
                  if (error.code !== "ERR_ASSERTION") throw error;
                  return false;
                }
              }, "bounded lifecycle descendant cleanup", 1800);
              assertStopped(installPid);
              const groups = spawnSync("ps", ["-eo", "pid=,pgid=,stat="], { encoding: "utf8" });
              assert.equal(groups.status, 0, groups.stderr);
              for (const line of groups.stdout.trim().split("\n")) {
                const [pid, pgid, stat] = line.trim().split(/\s+/);
                if (Number(pgid) === installPid) {
                  assert.match(stat, /^[ZX]/, `install process group member ${pid} must not survive`);
                }
              }
            }
            setup.write("release-runner", "");
            const result = await done;
            assert.equal(result.signal, null, result.stderr);
            assert.equal(result.status, first.exitCode, result.stderr);
            assert.equal(result.stderr, first.diagnostics);
            assertStopped(child.pid);
            assert.deepEqual(setup.calls(), failure === "spawn-error" ? [] : ["install --frozen-lockfile"]);
            assert.deepEqual(setup.checks(), [], "standalone install must never check compatibility or migrate");
          })()]);
        } finally {
          clearTimeout(timer);
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }
      });
    }
  }
}

test("repeated install interrupts do not postpone escalation or overwrite the first exit code", t => {
  const setup = fixture(t, {
    lightweight: true,
    installBody: `
echo $$ > install-pid
trap '' TERM
runner=$PPID
kill -TERM "$runner"
sleep 0.2
kill -INT "$runner"
while true; do kill -TERM "$runner"; sleep 0.1; done`,
  });
  const started = Date.now();
  const result = setup.run(10000);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 143, result.stderr);
  assert.ok(Date.now() - started < 5000, "repeated signals must not extend the one-second grace period");
  assert.equal((result.stderr.match(/runner received/g) ?? []).length, 1);
  assert.doesNotMatch(result.stderr, /timed out/);
  assertStopped(setup.read("install-pid").trim());
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
  assert.deepEqual(setup.checks(), []);
});

test("an install command that cannot start fails promptly without a cleanup timer", t => {
  const setup = fixture(t, { lightweight: true });
  const result = setup.runInstall({ PATH: "/nonexistent" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Dependency install could not start/);
  assert.doesNotMatch(result.stderr, /timed out|runner received/);
  assert.deepEqual(setup.calls(), []);
});

for (const ignoresTerm of [false, true]) {
  test(`a stalled migration ${ignoresTerm ? "ignoring" : "accepting"} SIGTERM stops within its reserve`, t => {
    const setup = fixture(t, {
      lightweight: true, migrationTimeout: "1000",
      migrationBody: `
echo $$ > migration-pid
${ignoresTerm ? "trap '' TERM" : "trap 'echo terminated > migration-term; exit 0' TERM"}
while true; do sleep 0.1; done`,
    });
    const started = Date.now();
    const result = setup.run();
    assert.equal(result.error, undefined, "migration runner must finish before the outer deadline");
    assert.equal(result.signal, null);
    assert.equal(result.status, 1, result.stderr);
    assert.ok(Date.now() - started < 10000, "migration must leave room in the 30-second reserve");
    assert.match(result.stderr, /Database migration timed out after 1000 ms/);
    assert.match(result.stderr, /setup stopped before workflow startup/);
    assert.match(result.stderr, /SIGTERM.*process group.*killed after 1000 ms/);
    assert.match(result.stderr, /verify the schema state before retrying pnpm --filter db push/);
    assert.match(result.stderr, /No force-push or automatic retry/);
    if (!ignoresTerm) assert.equal(setup.read("migration-term").trim(), "terminated");
    assertStopped(setup.read("migration-pid").trim());
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
    assert.deepEqual(setup.checks(), ["wallet", "pool"]);
  });
}

for (const interrupted of [false, true]) {
  test(`migration group cleanup survives leader exit${interrupted ? " when the runner is interrupted" : " on timeout"}`, t => {
    const setup = fixture(t, {
      lightweight: true, migrationTimeout: "1500",
      migrationBody: `
echo $$ > migration-pid
trap 'exit 0' TERM
bash -c 'trap "" TERM; echo $$ > migration-descendant-pid; while true; do sleep 0.1; done' &
while [ ! -f migration-descendant-pid ]; do sleep 0.01; done
${interrupted ? 'kill -TERM "$PPID"' : ""}
while true; do sleep 0.1; done`,
    });
    const started = Date.now();
    const result = setup.run();
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, interrupted ? 143 : 1, result.stderr);
    assert.ok(Date.now() - started < 10000);
    assert.match(result.stderr, interrupted ? /runner received SIGTERM/ : /migration timed out after 1500 ms/);
    if (interrupted) assert.doesNotMatch(result.stderr, /timed out/);
    assertStopped(setup.read("migration-pid").trim());
    assertStopped(setup.read("migration-descendant-pid").trim());
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
  });
}

for (const migrationTimeout of ["0", "", "not-a-number", "1.5", "20001"]) {
  test(`invalid migration deadline ${JSON.stringify(migrationTimeout)} fails before any side effects`, t => {
    const setup = fixture(t, { lightweight: true, migrationTimeout });
    const result = setup.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /MIGRATION_TIMEOUT_MS to an integer from 1 to 20000/);
    assert.deepEqual(setup.calls(), []);
    assert.deepEqual(setup.checks(), []);
    const direct = setup.runMigration();
    assert.equal(direct.status, 1, direct.stderr);
    assert.match(direct.stderr, /MIGRATION_TIMEOUT_MS/);
    assert.deepEqual(setup.calls(), []);
  });
}

test("migration input remains closed without forcing an interactive schema decision", t => {
  const setup = fixture(t, {
    lightweight: true,
    migrationBody: 'if read -r answer; then exit 98; else echo "migration stdin closed"; exit 0; fi',
  });
  const result = setup.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /migration stdin closed/);
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
});

test("a migration command that cannot start gives a phase-specific error", t => {
  const setup = fixture(t, { lightweight: true });
  const result = setup.runMigration({ PATH: "/nonexistent" });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Database migration could not start; setup stopped before workflow startup/);
  assert.doesNotMatch(result.stderr, /timed out/);
  assert.deepEqual(setup.calls(), []);
});

test("a migration terminated externally is not relabeled as a deadline failure", t => {
  const setup = fixture(t, { lightweight: true, migrationBody: 'kill -TERM "$$"' });
  const result = setup.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Database migration terminated by SIGTERM/);
  assert.doesNotMatch(result.stderr, /timed out/);
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
});

for (const fault of ["wallet", "hang-cjs", "hang-esm"]) {
  test(`a hanging ${fault} consumer is killed promptly before migration`, t => {
    const setup = fixture(t, {
      walletHang: fault === "wallet",
      cryptoFault: fault === "wallet" ? undefined : fault,
      checkTimeout: "1000",
    });
    const started = Date.now();
    const result = setup.run();
    assert.equal(result.error, undefined, "the per-check deadline must fire before the fixture's outer timeout");
    assert.equal(result.signal, null);
    assert.equal(result.status, 1, result.stderr);
    // This includes several Node/shell startups and real wallet module loading.
    // Keep an overall bound without mistaking cold-workspace startup overhead
    // for a failure of the child's separately asserted one-second deadline.
    assert.ok(Date.now() - started < 30000, "setup should stop promptly, not exhaust the overall budget");
    const label = fault === "wallet" ? "wallet" : "private-pool crypto";
    assert.match(result.stderr, new RegExp(`Installed ${label} dependency compatibility check timed out after 1000 ms`));
    assert.match(result.stderr, /setup stopped before migrations/);
    assert.match(result.stderr, /check process was killed/);
    assert.match(result.stderr, fault === "wallet" ? /query-string compatibility patch/ : /circomlibjs compatibility patch/);
    assert.match(result.stderr, new RegExp(`rerun node scripts/run-dependency-check.mjs ${fault === "wallet" ? "wallet" : "pool"}`));
    if (fault === "wallet") {
      assert.doesNotMatch(result.stdout + result.stderr, /private-pool crypto dependency compatibility check/);
    } else {
      assert.match(result.stdout, /Installed wallet dependency compatibility check passed/);
    }
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile"]);
  });
}

for (const checkTimeout of ["0", "not-a-number", "120001"]) {
  test(`invalid deadline ${checkTimeout} cannot disable the compatibility gate`, t => {
    const setup = fixture(t, { checkTimeout });
    const result = setup.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /DEPENDENCY_CHECK_TIMEOUT_MS to an integer from 1 to 120000/);
    assert.doesNotMatch(result.stdout, /compatibility check passed/);
    assert.deepEqual(setup.calls(), []);
    assert.deepEqual(setup.checks(), []);
  });
}

test("default phase budgets fit the actual workspace post-merge deadline", t => {
  const setup = fixture(t, { lightweight: true });
  const result = setup.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
  assert.deepEqual(setup.checks(), ["wallet", "pool"]);
});

for (const [deadline, installTimeout, checkTimeout, required] of [
  [180000, "120000", "60000", 270000],
  [300000, "120000", "120000", 390000],
  [180000, undefined, undefined, 255000],
  [180000, "40001", "55000", 180001],
]) {
  test(`combined budget ${required} cannot outrun the configured ${deadline} ms deadline`, t => {
    const setup = fixture(t, {
      lightweight: true, installTimeout, checkTimeout,
      config: `[postMerge]\npath = "scripts/post-merge.sh"\ntimeoutMs = ${deadline}\n`,
    });
    const result = setup.run();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`= ${required} ms, exceeding .*\\(${deadline} ms\\)`));
    assert.match(result.stderr, /migration\/startup reserve 30000 ms/);
    assert.match(result.stderr, /Lower DEPENDENCY_INSTALL_TIMEOUT_MS and\/or DEPENDENCY_CHECK_TIMEOUT_MS/);
    assert.match(result.stderr, /applies to BOTH checks/);
    assert.match(result.stderr, /overall limit has not been changed/);
    assert.deepEqual(setup.calls(), []);
    assert.deepEqual(setup.checks(), []);
  });
}

for (const deadline of [180000, 180001]) {
  test(`compatible overrides retain migration reserve under ${deadline} ms`, t => {
    const setup = fixture(t, {
      lightweight: true, installTimeout: "40000", checkTimeout: "55000",
      config: `[other]\ntimeoutMs = 1\n[postMerge] # setup\npath = "scripts/post-merge.sh"\ntimeoutMs = ${deadline} # actual limit\n[next]\ntimeoutMs = 1\n`,
    });
    const result = setup.run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
    assert.deepEqual(setup.checks(), ["wallet", "pool"]);
  });
}

test("raised overrides are accepted when the actual platform deadline has room", t => {
  const setup = fixture(t, {
    lightweight: true, installTimeout: "120000", checkTimeout: "60000",
    config: '[postMerge]\npath = "scripts/post-merge.sh"\ntimeoutMs = 300_000 # integer separators\n',
  });
  const result = setup.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(setup.calls(), ["install --frozen-lockfile", "--filter db push"]);
  assert.deepEqual(setup.checks(), ["wallet", "pool"]);
});

for (const config of [
  null, "", "[other]\ntimeoutMs = 300000\n", "[postMerge]\ntimeoutMs = 0\n",
  '[postMerge]\ntimeoutMs = "300000"\n', "[postMerge]\ntimeoutMs = 9007199254740992\n",
  "[postMerge]\ntimeoutMs = 300000\ntimeoutMs = 180000\n",
  "[postMerge]\ntimeoutMs = 300000\n[postMerge]\ntimeoutMs = 180000\n",
]) {
  test(`missing or ambiguous platform deadline fails closed: ${JSON.stringify(config)}`, t => {
    const setup = fixture(t, { lightweight: true, config });
    const result = setup.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Post-merge budget validation stopped before installation/);
    assert.match(result.stderr, /\.replit/);
    assert.deepEqual(setup.calls(), []);
    assert.deepEqual(setup.checks(), []);
  });
}
