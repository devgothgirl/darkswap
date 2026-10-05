import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildEnvironment, checkOutput, parseArgs, prepareStandalone, targetOrigin } from "./prepare-launch-standalone.mjs";

const scriptPath = fileURLToPath(new URL("./prepare-launch-standalone.mjs", import.meta.url));

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "launch-standalone-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspaceRoot = path.join(directory, "workspace");
  const publicDirectory = path.join(workspaceRoot, "artifacts/darkswap-launch/public");
  const templateDirectory = path.join(workspaceRoot, "deploy/launch-standalone");
  await mkdir(publicDirectory, { recursive: true });
  await mkdir(templateDirectory, { recursive: true });
  await mkdir(path.join(publicDirectory, "nested"));
  await writeFile(path.join(publicDirectory, "favicon.svg"), "<svg>test public asset</svg>");
  await writeFile(path.join(publicDirectory, "nested/image.png"), Buffer.from([0, 1, 2, 255]));
  const template = "# unit-test-only template\nlocation /api/ { return 503; }\n";
  await writeFile(path.join(templateDirectory, "nginx.conf.template"), template);
  await writeFile(path.join(templateDirectory, "serve.mjs"), "// fixture renderer");
  const src = path.join(workspaceRoot, "artifacts/darkswap-launch/src");
  await mkdir(src);
  await writeFile(path.join(src, "seo-config.json"), JSON.stringify({
    origin: "https://darkswap.app", basePath: "/launch/", indexable: ["/", "/docs"], dynamic: ["/token/:mint"], private: ["/create"],
  }));
  await mkdir(path.join(workspaceRoot, "artifacts/darkswap-launch/scripts"));
  await writeFile(path.join(workspaceRoot, "artifacts/darkswap-launch/scripts/check-routes.mjs"), "// fixture route check");
  const outDir = path.join(directory, "export");
  const builds = [];
  // Unit-test-only build double: actual Vite build is a separate integration step.
  const build = async (options) => {
    builds.push(options);
    await mkdir(path.join(options.outDir, "assets"), { recursive: true });
    await writeFile(path.join(options.outDir, "index.html"),
      '<title>DarkSwap Launch</title><script type="module" src="/assets/site.js"></script>');
    await writeFile(path.join(options.outDir, "assets/site.js"), "/* unit-test-only bundle */");
    await cp(publicDirectory, options.outDir, { recursive: true });
    await mkdir(options.serverOutDir);
    await writeFile(path.join(options.serverOutDir, "entry-server.js"), "export const render = () => {};");
  };
  return { directory, workspaceRoot, publicDirectory, templateDirectory, template, outDir, builds, build };
}

test("CLI accepts explicit paths and help; rejects ambiguous or unknown arguments", () => {
  assert.deepEqual(parseArgs([]), { outDir: undefined, showHelp: false });
  assert.deepEqual(parseArgs(["--outDir", ".local/export"]), { outDir: ".local/export", showHelp: false });
  assert.deepEqual(parseArgs(["--outDir=/tmp/export"]), { outDir: "/tmp/export", showHelp: false });
  assert.equal(parseArgs(["--help"]).showHelp, true);
  for (const args of [["--outDir"], ["--outDir="], ["--outDir", "--help"],
    ["--outDir=a", "--outDir=b"], ["--force"], ["--publish"], ["unexpected"]]) {
    assert.throws(() => parseArgs(args));
  }
});

test("CLI help does no build or output writes, and invalid CLI fails nonzero", async (t) => {
  const f = await fixture(t);
  const result = spawnSync(process.execPath, [scriptPath, "--help", "--outDir", f.outDir],
    { encoding: "utf8", cwd: f.directory, env: { ...process.env, PATH: "" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /BASE_PATH=\/.*PORT=4173/);
  assert.match(result.stdout, /NOT deploy/);
  assert.match(result.stdout, /docs\/launch-standalone-deployment\.md/);
  await assert.rejects(lstat(f.outDir), { code: "ENOENT" });
  const invalid = spawnSync(process.execPath, [scriptPath, "--publish"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown argument/);
});

test("output safety rejects traversal, workspace/source paths and symlink escapes", async (t) => {
  const f = await fixture(t);
  const options = { cwd: f.workspaceRoot, workspaceRoot: f.workspaceRoot };
  for (const target of ["../escape", "exports/../escape", f.workspaceRoot, f.directory,
    "artifacts/darkswap-launch/dist/public", "scripts/export", "lib/export", "deploy/export",
    "docs/export", ".git/export", "node_modules/export"]) {
    await assert.rejects(checkOutput(target, options));
  }
  await symlink(f.directory, path.join(f.workspaceRoot, "linked"), "dir");
  await assert.rejects(checkOutput("linked/escape", options), /symlink/);
  await symlink(f.directory, f.outDir, "dir");
  await assert.rejects(checkOutput(f.outDir, options), /symlink/);
  await writeFile(path.join(f.directory, "file"), "keep");
  await assert.rejects(checkOutput(path.join(f.directory, "file/output"), options), /not a directory/);
  assert.equal(await checkOutput(".local/export", options), path.join(f.workspaceRoot, ".local/export"));
  assert.equal(await checkOutput(path.join(f.directory, "absolute-export"), options),
    path.join(f.directory, "absolute-export"));
});

test("build environment forces root production and excludes credentials and VITE variables", () => {
  const env = buildEnvironment({
    PATH: "/bin", HOME: "/home/test", NODE_ENV: "development", BASE_PATH: "/launch/", PORT: "invalid",
    PROVIDER_API_KEY: "unit-test-secret", VITE_PROVIDER_SECRET: "unit-test-secret", AWS_SECRET_ACCESS_KEY: "test",
  });
  assert.deepEqual(env, { PATH: "/bin", HOME: "/home/test", NODE_ENV: "production", BASE_PATH: "/", PORT: "4173", LAUNCH_STANDALONE_ORIGIN: targetOrigin });
  assert.ok(Number.isInteger(Number(env.PORT)) && Number(env.PORT) > 0 && Number(env.PORT) <= 65535);
});

test("isolated build exports complete public assets, manifest, README and unchanged template", async (t) => {
  const f = await fixture(t);
  await mkdir(f.outDir); // An explicitly empty existing directory is supported.
  const managed = path.join(f.workspaceRoot, "artifacts/darkswap-launch/dist/public");
  await mkdir(managed, { recursive: true });
  await writeFile(path.join(managed, "sentinel"), "managed build must remain untouched");
  const result = await prepareStandalone({
    ...f,
    environment: { PATH: process.env.PATH, PROVIDER_API_KEY: "test-secret" },
  });
  assert.equal(result.outDir, f.outDir);
  assert.equal(f.builds.length, 1);
  const call = f.builds[0];
  assert.equal(call.cwd, f.workspaceRoot);
  assert.ok(call.outDir.startsWith(`${tmpdir()}${path.sep}darkswap-launch-standalone-`));
  assert.notEqual(call.outDir, f.outDir);
  assert.ok(!call.outDir.startsWith(f.workspaceRoot));
  assert.equal(call.env.BASE_PATH, "/");
  assert.equal(call.env.NODE_ENV, "production");
  assert.equal(call.env.PROVIDER_API_KEY, undefined);
  await assert.rejects(lstat(path.dirname(call.outDir)), { code: "ENOENT" });
  assert.equal(await readFile(path.join(managed, "sentinel"), "utf8"), "managed build must remain untouched");
  assert.equal(await readFile(path.join(f.outDir, "nginx.conf.template"), "utf8"), f.template);
  assert.deepEqual(await readFile(path.join(f.outDir, "public/nested/image.png")), Buffer.from([0, 1, 2, 255]));
  assert.match(await readFile(path.join(f.outDir, "public/index.html"), "utf8"), /src="\/assets\//);
  assert.deepEqual((await readdir(f.outDir)).sort(),
    ["README.md", "nginx.conf.template", "package.json", "public", "seo-config.json", "serve.mjs", "server", "standalone-manifest.json"]);
  const manifest = JSON.parse(await readFile(path.join(f.outDir, "standalone-manifest.json"), "utf8"));
  assert.equal(manifest.preparationOnly, true);
  assert.equal(manifest.live, false);
  assert.equal(manifest.deploymentPerformed, false);
  assert.equal(manifest.targetOrigin, "https://darkswap.world");
  assert.equal(manifest.liveReplacementApproved, false);
  assert.equal(manifest.publicDirectory, "public");
  assert.equal(manifest.backendIncluded, false);
  assert.equal(manifest.providerSecretsCopied, false);
  assert.equal(manifest.liveApiVerified, false);
  assert.equal(manifest.dnsTlsVerified, false);
  assert.equal(manifest.build.basePath, "/");
  assert.equal(manifest.build.nodeEnv, "production");
  assert.equal(manifest.build.publicAssetsIncluded, true);
  assert.equal(manifest.hosting.sameOriginApiPath, "/api");
  assert.equal(manifest.hosting.ssrRequired, true);
  assert.equal(manifest.renderer.dependenciesBundled, true);
  assert.equal(JSON.parse(await readFile(path.join(f.outDir, "seo-config.json"), "utf8")).origin, targetOrigin);
  assert.equal(manifest.nginxTemplate.installed, false);
  assert.ok(manifest.siteFiles.includes("nested/image.png"));
  assert.deepEqual(manifest, result.manifest);
  const readme = await readFile(path.join(f.outDir, "README.md"), "utf8");
  assert.match(readme, /NOT a live deployment/);
  assert.match(readme, /No API server is included/);
  assert.match(readme, /BEFORE SPA/);
  assert.ok(readme.includes(`LAUNCH_ALLOWED_ORIGINS=${targetOrigin}`));
  assert.match(readme, /darkswap\.app must remain unchanged/);
  assert.match(readme, /docs\/launch-standalone-deployment\.md/);
  assert.ok(!(await readdir(f.directory)).some((name) => name.startsWith(".launch-standalone-stage-")));
});

test("prepared gateway uses the exact selected origin, not the old Launch hostname", async () => {
  const template = await readFile(new URL("../../deploy/launch-standalone/nginx.conf.template", import.meta.url), "utf8");
  const hostname = new URL(targetOrigin).hostname;
  assert.equal(targetOrigin, `https://${hostname}`);
  assert.ok(template.includes(`server_name ${hostname};`));
  assert.ok(template.includes(`if ($http_host != "${hostname}") { return 421; }`));
  assert.ok(template.includes(`proxy_set_header Host ${hostname};`));
  assert.ok(template.includes(`proxy_set_header X-Forwarded-Host ${hostname};`));
  assert.ok(!template.includes("launch.darkswap.app"));
  const config = JSON.parse(await readFile(new URL("../../artifacts/darkswap-launch/src/seo-config.json", import.meta.url), "utf8"));
  const pageLocations = [...template.matchAll(/location ~ "([^"]+)"/g)].map(match => new RegExp(match[1]));
  for (const route of [...config.indexable, ...config.private, "/token/11111111111111111111111111111111", "/robots.txt", "/sitemap.xml"]) {
    assert.ok(pageLocations.some(pattern => pattern.test(route)), `Gateway must forward classified route ${route}`);
  }
  assert.ok(!pageLocations.some(pattern => pattern.test("/assets/missing.js")));
  assert.ok(!pageLocations.some(pattern => pattern.test("/api/launch/drafts")));
});

test("nonempty output is preserved and rejected before invoking a build", async (t) => {
  const f = await fixture(t);
  await mkdir(f.outDir);
  await writeFile(path.join(f.outDir, ".hidden"), "keep this output");
  await assert.rejects(prepareStandalone(f), /Refusing to overwrite nonempty/);
  assert.equal(f.builds.length, 0);
  assert.equal(await readFile(path.join(f.outDir, ".hidden"), "utf8"), "keep this output");
  const cli = spawnSync(process.execPath, [scriptPath, "--outDir", f.outDir], { encoding: "utf8" });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /Refusing to overwrite nonempty/);
  assert.equal(await readFile(path.join(f.outDir, ".hidden"), "utf8"), "keep this output");
});

test("unavailable build command rejects without publishing output", async (t) => {
  const f = await fixture(t);
  // Empty PATH prevents pnpm from running: exercise spawn failure, not a build.
  await assert.rejects(prepareStandalone({ ...f, build: undefined, environment: { PATH: "" } }),
    { code: "ENOENT" });
  await assert.rejects(lstat(f.outDir), { code: "ENOENT" });
});

test("failed build never exposes partial output and cleans temporary build", async (t) => {
  const f = await fixture(t);
  let temporary;
  await assert.rejects(prepareStandalone({
    ...f,
    build: async ({ outDir }) => {
      temporary = path.dirname(outDir);
      await mkdir(outDir);
      await writeFile(path.join(outDir, "partial.js"), "partial build");
      throw new Error("unit-test build failed");
    },
  }), /unit-test build failed/);
  await assert.rejects(lstat(f.outDir), { code: "ENOENT" });
  await assert.rejects(lstat(temporary), { code: "ENOENT" });
});

test("output populated during build is not overwritten", async (t) => {
  const f = await fixture(t);
  await assert.rejects(prepareStandalone({
    ...f,
    build: async (options) => {
      await f.build(options);
      await mkdir(f.outDir);
      await writeFile(path.join(f.outDir, "new-file"), "concurrent output");
    },
  }), /Refusing to overwrite nonempty/);
  assert.equal(await readFile(path.join(f.outDir, "new-file"), "utf8"), "concurrent output");
  await assert.rejects(lstat(path.dirname(f.builds[0].outDir)), { code: "ENOENT" });
});

test("missing reviewed template and local env files fail before building", async (t) => {
  const f = await fixture(t);
  await rm(path.join(f.templateDirectory, "nginx.conf.template"));
  await assert.rejects(prepareStandalone(f), /Reviewed Nginx template/);
  await writeFile(path.join(f.templateDirectory, "nginx.conf.template"), f.template);
  await writeFile(path.join(f.workspaceRoot, "artifacts/darkswap-launch/.env.production"), "VITE_SECRET=test");
  await assert.rejects(prepareStandalone(f), /refuses local Vite environment file/);
  assert.equal(f.builds.length, 0);
  await assert.rejects(lstat(f.outDir), { code: "ENOENT" });
});

test("secret-shaped public files and symlinks are refused before building", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.publicDirectory, ".env"), "SECRET=test");
  await assert.rejects(prepareStandalone(f), /potential secret file/);
  await rm(path.join(f.publicDirectory, ".env"));
  await symlink(path.join(f.publicDirectory, "favicon.svg"), path.join(f.publicDirectory, "linked.svg"));
  await assert.rejects(prepareStandalone(f), /symlink/);
  assert.equal(f.builds.length, 0);
});

test("invalid root build or missing public asset is not committed", async (t) => {
  const f = await fixture(t);
  for (const modify of [
    (directory) => writeFile(path.join(directory, "index.html"), '<script src="/launch/assets/site.js"></script>'),
    (directory) => rm(path.join(directory, "favicon.svg")),
    (directory) => writeFile(path.join(directory, "private.key"), "test secret-shaped file"),
  ]) {
    await assert.rejects(prepareStandalone({
      ...f,
      build: async (options) => {
        await f.build(options);
        await modify(options.outDir);
      },
    }));
    await assert.rejects(lstat(f.outDir), { code: "ENOENT" });
  }
});