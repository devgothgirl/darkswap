#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const workspace = path.resolve(path.dirname(scriptPath), "../..");
const argumentsByName = new Map(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    return separator < 0
      ? [argument, true]
      : [argument.slice(0, separator), argument.slice(separator + 1)];
  }),
);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function run(command, args, environment) {
  console.info(`$ BASE_PATH=${environment.BASE_PATH} PORT=${environment.PORT} ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    cwd: workspace,
    env: environment,
    stdio: "inherit",
  });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 300_000);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`${command} failed: exit=${code}, signal=${signal}`));
      });
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function allocatePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function serve(directory, base, port) {
  const html = await readFile(path.join(directory, "index.html"));
  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      // Test-only API sentinel, never a provider request or claimed real API.
      // It deliberately precedes the root SPA fallback.
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        response.writeHead(url.pathname === "/api/__launch-serving-probe" ? 200 : 404, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(JSON.stringify({
          testHarnessOnly: true,
          routing: "api-before-spa",
          path: url.pathname,
        }));
        return;
      }
      if (base !== "/" && url.pathname === base.slice(0, -1)) {
        response.writeHead(308, { Location: base });
        response.end();
        return;
      }
      if (!url.pathname.startsWith(base)) {
        response.writeHead(404);
        response.end("Outside the test artifact mount");
        return;
      }
      const relative = decodeURIComponent(url.pathname.slice(base.length));
      const target = path.resolve(directory, relative);
      if (relative.split("/").includes("..") ||
          (target !== directory && !target.startsWith(`${directory}${path.sep}`))) {
        response.writeHead(400);
        response.end("Invalid test asset path");
        return;
      }
      let targetStat;
      try {
        targetStat = await stat(target);
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      }
      if (targetStat?.isFile()) {
        response.writeHead(200, {
          "Content-Type": contentTypes[path.extname(target)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        });
        response.end(await readFile(target));
        return;
      }
      if (path.extname(relative)) {
        response.writeHead(404);
        response.end("Missing static asset; not an SPA page");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(html);
    } catch (error) {
      response.writeHead(500);
      response.end(`Isolated test server error: ${error.message}`);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  console.info(JSON.stringify({ ready: true, port, base }));
  const close = () => server.close(() => process.exit(0));
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}

async function startServer(directory, base, port) {
  const child = spawn(process.execPath, [
    scriptPath, "--serve", `--directory=${directory}`, `--base=${base}`, `--port=${port}`,
  ], { cwd: workspace, stdio: ["ignore", "pipe", "inherit"] });
  let output = "";
  const timeout = setTimeout(() => child.kill("SIGTERM"), 10_000);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`Static test server exited before ready: ${code}`)));
      child.stdout.on("data", (bytes) => {
        output += bytes.toString();
        if (output.includes('"ready":true')) resolve();
      });
    });
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  return child;
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), 3_000);
    force.unref();
  });
}

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(directory, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)]
      .map((match) => [match[1].toLowerCase(), match[2]]),
  );
}

async function verifyScenario(label, base) {
  const directory = await mkdtemp(path.join(tmpdir(), `darkswap-launch-${label}-`));
  const port = await allocatePort();
  let child;
  const checks = [];
  const passed = (description) => {
    checks.push(description);
    console.info(`PASS [${label}] ${description}`);
  };
  try {
    // Temporary outDir avoids overwriting any managed preview build.
    await run("pnpm", [
      "--filter", "@workspace/darkswap-launch", "run", "build", "--outDir", directory,
    ], { ...process.env, NODE_ENV: "production", BASE_PATH: base, PORT: String(port) });
    passed(`production build with BASE_PATH=${base} and PORT=${port}`);
    const html = await readFile(path.join(directory, "index.html"), "utf8");
    assert.match(html, /<title>[^<]*DarkSwap Launch[^<]*<\/title>/i, "Product title missing");
    const metadata = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
    for (const name of ["description", "og:title", "og:description"]) {
      const entry = metadata.find((value) => value.name === name || value.property === name);
      assert(entry?.content?.trim(), `Missing nonempty ${name} metadata`);
    }
    passed("static title, description, og:title and og:description identify product shell");
    assert.match(html, /<div\b[^>]*\bid=["']root["']/i, "Missing SPA mount root");

    child = await startServer(directory, base, port);
    const origin = `http://127.0.0.1:${port}`;
    const request = (pathname, options = {}) => fetch(`${origin}${pathname}`, {
      ...options, signal: AbortSignal.timeout(8_000),
    });
    const routes = ["", "explore", "create", "creator", "admin",
      "token/5bgRoaih32ost5P5iFAZJKcbXpzSUA6DuvnpYc9hZNjW"];
    for (const route of routes) {
      const pathname = `${base}${route}`;
      const result = await request(pathname, { headers: { Accept: "text/html" } });
      assert.equal(result.status, 200, `Direct route ${pathname} status`);
      assert.match(result.headers.get("content-type") ?? "", /text\/html/i);
      assert.equal(await result.text(), html, `Direct route ${pathname} did not return built SPA shell`);
      passed(`direct ${pathname} returns exact production SPA shell`);
    }
    if (base !== "/") {
      const redirect = await request(base.slice(0, -1), { redirect: "manual" });
      assert.equal(redirect.status, 308);
      assert.equal(redirect.headers.get("location"), base);
      assert.equal((await request("/explore")).status, 404);
      assert.equal((await request("/launch-other/explore")).status, 404);
      passed("prefix redirect and boundary isolation leave outside root routes untouched");
    }
    for (const pathname of ["/api/__launch-serving-probe", "/api/launch/config", "/api"]) {
      const result = await request(pathname);
      assert.equal(result.status, pathname.endsWith("__launch-serving-probe") ? 200 : 404);
      assert.match(result.headers.get("content-type") ?? "", /application\/json/i);
      const sentinel = await result.json();
      assert.equal(sentinel.testHarnessOnly, true);
      assert.equal(sentinel.routing, "api-before-spa");
    }
    passed("test API sentinel wins before SPA fallback, including root-mounted scenario");
    assert.equal((await request(`${base}assets/__missing-launch-test__.js`)).status, 404);
    passed("missing JavaScript asset returns 404 rather than HTML fallback");

    const assetReferences = [];
    for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
      const tag = attributes(match[0]);
      if (match[1].toLowerCase() === "link" &&
          !["stylesheet", "modulepreload", "icon"].includes(tag.rel)) continue;
      const raw = tag.src ?? tag.href;
      if (!raw) continue;
      const url = new URL(raw, `${origin}${base}`);
      if (url.origin !== origin) continue;
      assert(url.pathname.startsWith(base), `Unprefixed HTML asset: ${raw}`);
      assetReferences.push(url.pathname + url.search);
      const asset = await request(url.pathname + url.search);
      assert.equal(asset.status, 200, `HTML referenced asset unavailable: ${raw}`);
      assert(!/text\/html/i.test(asset.headers.get("content-type") ?? ""),
        `HTML fallback returned for referenced asset: ${raw}`);
    }
    assert(assetReferences.length > 0, "No local built asset references in HTML");
    passed(`all ${assetReferences.length} local HTML asset references load with correct prefix`);

    const files = await listFiles(directory);
    let scanned = 0;
    for (const relative of files) {
      if (!/\.(?:js|mjs|css|html|json)$/i.test(relative)) continue;
      const contents = (await readFile(path.join(directory, relative), "utf8"))
        .replaceAll("\\/", "/");
      assert(!/https?:\/\/(?:www\.)?stonkfun\.xyz\/api\/public\/v1/i.test(contents),
        `Production asset contains direct provider discovery URL: ${relative}`);
      scanned += 1;
      if (/\.(?:js|mjs|css)$/i.test(relative)) {
        const asset = await request(`${base}${relative.split(path.sep).join("/")}`);
        assert.equal(asset.status, 200, `Built asset unavailable: ${relative}`);
        assert(!/text\/html/i.test(asset.headers.get("content-type") ?? ""),
          `Built asset returned HTML: ${relative}`);
      }
    }
    passed(`scanned ${scanned} production text assets: no literal provider discovery base URL`);
    console.info(JSON.stringify({ scenario: label, base, port, checks: checks.length, result: "passed" }));
  } finally {
    if (child) await stopServer(child);
    await rm(directory, { recursive: true, force: true });
  }
}

if (argumentsByName.has("--help")) {
  console.info([
    "Isolated DarkSwap Launch production serving smoke test.",
    "Run ONLY after launch-design implementation is complete.",
    "Usage: node scripts/src/verify-launch-serving.mjs [--scenario=prefix|root|both]",
    "Default both builds with BASE_PATH=/launch/ and /, respectively.",
    "Uses explicit PORT, temporary build outDirs and child-process test servers.",
    "No workflows, live API/provider requests, browser, DNS or funded transactions.",
  ].join("\n"));
} else if (argumentsByName.has("--serve")) {
  const directory = path.resolve(String(argumentsByName.get("--directory")));
  const base = String(argumentsByName.get("--base"));
  const port = Number(argumentsByName.get("--port"));
  assert(base === "/" || base === "/launch/");
  assert(Number.isInteger(port) && port > 0 && port <= 65535);
  await serve(directory, base, port);
} else {
  const scenario = argumentsByName.get("--scenario") ?? "both";
  assert(["prefix", "root", "both"].includes(scenario), "Scenario must be prefix, root or both");
  if (scenario === "prefix" || scenario === "both") await verifyScenario("prefix", "/launch/");
  if (scenario === "root" || scenario === "both") await verifyScenario("root", "/");
  console.info("Launch production serving smoke checks passed; custom-domain ingress/DNS/TLS are NOT verified.");
}