#!/usr/bin/env node
import { spawn } from "node:child_process";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const workspace = path.resolve(path.dirname(scriptPath), "../..");
const defaultOutDir = path.join(workspace, ".local/launch-standalone-world");
export const targetOrigin = "https://darkswap.world";
const buildPort = "4173"; // Vite requires a valid PORT even though build opens no listener.
const templateRelativePath = "deploy/launch-standalone/nginx.conf.template";
const rendererRelativePath = "deploy/launch-standalone/serve.mjs";

export const help = [
  "Prepare a portable DarkSwap Launch frontend; this does NOT deploy it.",
  "Usage: node scripts/src/prepare-launch-standalone.mjs [--outDir PATH]",
  "       node scripts/src/prepare-launch-standalone.mjs --help",
  "Default output: .local/launch-standalone-world in the source workspace (gitignored).",
  `Prepared target: ${targetOrigin}; replacing the current site is not yet authorized.`,
  "Explicit relative paths resolve from the current working directory; absolute paths are allowed.",
  "Output must be absent or an empty directory. No .. components, symlinks or managed source/build paths.",
  "Builds production BASE_PATH=/ with PORT=4173 in an isolated temporary outDir.",
  "Exports public/ assets, bundled SSR renderer, README, manifest and proposed Nginx template.",
  "No publishing, DNS/TLS changes, live API calls, backend or provider secrets.",
  "See docs/launch-standalone-deployment.md for separate-host deployment requirements.",
].join("\n");

export function parseArgs(args) {
  let outDir;
  let showHelp = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      showHelp = true;
    } else if (argument === "--outDir" || argument.startsWith("--outDir=")) {
      if (outDir !== undefined) throw new Error("--outDir may only be specified once.");
      outDir = argument === "--outDir" ? args[++index] : argument.slice("--outDir=".length);
      if (!outDir?.trim() || outDir.startsWith("--") || outDir.includes("\0")) {
        throw new Error("--outDir requires a nonempty directory path.");
      }
    } else {
      throw new Error(`Unknown argument: ${argument}. Use --help.`);
    }
  }
  return { outDir, showHelp };
}

function within(directory, target) {
  const relative = path.relative(directory, target);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`));
}

async function optionalStat(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function checkOutput(outDir, { cwd = process.cwd(), workspaceRoot = workspace } = {}) {
  if (typeof outDir !== "string" || !outDir.trim() || outDir.includes("\0")) {
    throw new Error("Output requires a nonempty directory path.");
  }
  if (outDir.split(/[\\/]/).includes("..")) {
    throw new Error("Output paths must not contain .. traversal components.");
  }
  const destination = path.resolve(cwd, outDir);
  const root = path.resolve(workspaceRoot);
  if (within(destination, root)) {
    throw new Error("Output must not be the workspace root or one of its ancestors.");
  }
  for (const name of ["artifacts", "lib", "scripts", "deploy", "docs", ".git", "node_modules"]) {
    if (within(path.join(root, name), destination)) {
      throw new Error(`Output must not be inside managed workspace path: ${name}.`);
    }
  }
  // Do not silently follow a symlink outside the directory the user specified.
  let component = path.parse(destination).root;
  for (const segment of destination.slice(component.length).split(path.sep)) {
    component = path.join(component, segment);
    const info = await optionalStat(component);
    if (info?.isSymbolicLink()) throw new Error(`Output path contains a symlink: ${component}.`);
    if (info && !info.isDirectory()) throw new Error(`Output path is not a directory: ${component}.`);
  }
  if (await optionalStat(destination) && (await readdir(destination)).length !== 0) {
    throw new Error(`Refusing to overwrite nonempty output: ${destination}. Choose a new --outDir.`);
  }
  return destination;
}

export function buildEnvironment(environment = process.env) {
  // Only execution essentials are inherited; no provider credentials or VITE_* values.
  const result = {};
  for (const key of ["PATH", "HOME", "PNPM_HOME", "TMPDIR", "TMP", "TEMP",
    "SystemRoot", "SYSTEMROOT", "COMSPEC", "PATHEXT", "USERPROFILE"]) {
    if (environment[key] !== undefined) result[key] = environment[key];
  }
  return { ...result, NODE_ENV: "production", BASE_PATH: "/", PORT: buildPort, LAUNCH_STANDALONE_ORIGIN: targetOrigin };
}

async function runCommand(command, args, options) {
  console.info(`$ ${command} ${args.join(" ")}`);
  const child = spawn(command, args, { ...options, stdio: "inherit" });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 300_000);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Launch production build failed: exit=${code}, signal=${signal}.`));
      });
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runBuild({ cwd, outDir, serverOutDir, env }) {
  // Validate the source route classification without forcing its existing
  // /launch/ canonical config to match the separate root target.
  const validationEnv = { ...env };
  delete validationEnv.BASE_PATH;
  await runCommand(process.execPath, ["scripts/check-routes.mjs"], {
    cwd: path.join(cwd, "artifacts/darkswap-launch"), env: validationEnv,
  });
  // Do NOT append --outDir to the artifact's chained build script: only its
  // last command would receive it, and the client would overwrite managed dist.
  const prefix = ["--filter", "@workspace/darkswap-launch", "exec", "vite", "build",
    "--config", "vite.standalone.config.ts"];
  await runCommand("pnpm", [...prefix, "--outDir", outDir], { cwd, env });
  await runCommand("pnpm", [...prefix, "--ssr", "src/entry-server.tsx", "--outDir", serverOutDir], { cwd, env });
}

async function listSafeFiles(directory, prefix = "") {
  if (!prefix && !(await lstat(directory)).isDirectory()) {
    throw new Error(`Export input must be a real directory, not a symlink: ${directory}.`);
  }
  const files = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Export input contains a symlink: ${relative}.`);
    if (/^\.env(?:\.|$)/i.test(entry.name) || /\.(?:pem|key)$/i.test(entry.name)) {
      throw new Error(`Refusing to export a potential secret file: ${relative}.`);
    }
    if (entry.isDirectory()) files.push(...await listSafeFiles(directory, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Export input is not a regular file or directory: ${relative}.`);
  }
  return files;
}

const exportReadme = `# DarkSwap Launch — prepared standalone frontend

This is a production root-mounted (\`BASE_PATH=/\`) frontend with bundled SSR.
Preparation is complete, but this directory is NOT a live deployment or proof
that a custom domain, DNS, TLS, API routing, sessions or provider access works.

Prepared target: ${targetOrigin}. The owner chose this instead of
launch.darkswap.app. Preparation does not authorize replacing the current
darkswap.world site, publishing, DNS changes or production setting changes.
darkswap.app must remain unchanged.

Serve public/ assets through the gateway; do not serve index.html as a static
page fallback. Start the loopback SSR renderer with node serve.mjs, setting
LAUNCH_SSR_PORT to the selected internal port and LAUNCH_PUBLIC_API_ORIGIN to a
verified HTTPS API origin serving public /api discovery endpoints. SSR uses only
anonymous public requests; it never forwards browser cookies or request headers.
The Nginx page routes use that same LAUNCH_SSR_PORT. Missing assets return 404.
Public routes include /docs, /terms, /privacy and /risk as well as discovery.

The frontend still requests same-origin /api endpoints. No API server is included.
Route ONLY the allowlisted Launch API paths to the separately operated DarkSwap
backend's /launch/api ingress BEFORE SPA/SSR page handling. Deny all other /api paths.
The backend must receive Host: darkswap.world, effective protocol https, and
the unchanged browser Origin/cookies/CSRF headers; ordinary proxying to a
different hostname is not sufficient. The proposed production setting is
LAUNCH_ALLOWED_ORIGINS=${targetOrigin}; it has NOT been applied.
Review backend origin, cookie/session and CSRF requirements before use.
Do not put provider secrets in frontend environment variables or static files.

nginx.conf.template is copied unchanged from the reviewed source template. It is
an example to review and configure, NOT an installed or validated server config.
Set its PUBLIC_DIR to the absolute path of this package's public/ directory.
Keep server/, serve.mjs, seo-config.json, package.json, this README, the manifest
and the template outside the static document root.
No hosting provider, publishing, DNS, TLS or live API action was performed.

See docs/launch-standalone-deployment.md in the source repository for the complete
deployment procedure and limitations. Consult standalone-manifest.json for the
preparation marker. Deployment and live verification are separate operator steps.
`;

export async function prepareStandalone({
  outDir = defaultOutDir,
  cwd = process.cwd(),
  workspaceRoot = workspace,
  environment = process.env,
  build = runBuild,
} = {}) {
  const destination = await checkOutput(outDir, { cwd, workspaceRoot });
  const launchDirectory = path.join(workspaceRoot, "artifacts/darkswap-launch");
  // Vite loads these even with a filtered process environment. Refuse rather than
  // risk embedding local credentials; this preparation needs no local env files.
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    if (await optionalStat(path.join(launchDirectory, name))) {
      throw new Error(`Standalone preparation refuses local Vite environment file: ${name}.`);
    }
  }
  const templatePath = path.join(workspaceRoot, templateRelativePath);
  if (!(await optionalStat(templatePath))?.isFile()) {
    throw new Error(`Reviewed Nginx template must be a regular file: ${templateRelativePath}.`);
  }
  const template = await readFile(templatePath);
  const rendererPath = path.join(workspaceRoot, rendererRelativePath);
  if (!(await optionalStat(rendererPath))?.isFile()) throw new Error("Standalone renderer must be a regular file.");
  const renderer = await readFile(rendererPath);
  const seo = {
    ...JSON.parse(await readFile(path.join(launchDirectory, "src/seo-config.json"), "utf8")),
    origin: targetOrigin, basePath: "/",
  };
  const publicDirectory = path.join(launchDirectory, "public");
  const publicFiles = await listSafeFiles(publicDirectory);
  const temporary = await mkdtemp(path.join(tmpdir(), "darkswap-launch-standalone-"));
  let staging;
  try {
    const buildDirectory = path.join(temporary, "site");
    const serverDirectory = path.join(temporary, "server");
    const env = buildEnvironment(environment);
    await build({ cwd: workspaceRoot, outDir: buildDirectory, serverOutDir: serverDirectory, env });
    const files = await listSafeFiles(buildDirectory);
    const serverFiles = await listSafeFiles(serverDirectory);
    if (!serverFiles.includes("entry-server.js")) throw new Error("Standalone SSR entry-server.js is missing.");
    const html = await readFile(path.join(buildDirectory, "index.html"), "utf8");
    if (!/<script\b[^>]*\bsrc=["']\/assets\/[^"']+["']/i.test(html)) {
      throw new Error("Build does not contain a root-mounted /assets/ script reference.");
    }
    for (const filename of publicFiles) {
      const [source, built] = await Promise.all([
        readFile(path.join(publicDirectory, filename)),
        readFile(path.join(buildDirectory, filename)),
      ]);
      if (!source.equals(built)) throw new Error(`Build did not preserve public asset: ${filename}.`);
    }
    const manifest = {
      schemaVersion: 2,
      artifact: "DarkSwap Launch",
      package: "@workspace/darkswap-launch",
      preparedAt: new Date().toISOString(),
      preparationOnly: true,
      live: false,
      deploymentPerformed: false,
      targetOrigin,
      liveReplacementApproved: false,
      publicDirectory: "public",
      build: { nodeEnv: "production", basePath: "/", port: Number(buildPort), publicAssetsIncluded: true },
      hosting: { rootMounted: true, ssrRequired: true, sameOriginApiPath: "/api" },
      renderer: { included: true, entry: "serve.mjs", bundle: "server/entry-server.js", dependenciesBundled: true },
      backendIncluded: false,
      providerSecretsCopied: false,
      liveApiVerified: false,
      dnsTlsVerified: false,
      nginxTemplate: { file: "nginx.conf.template", source: templateRelativePath, installed: false },
      documentation: "docs/launch-standalone-deployment.md",
      siteFiles: files.sort().map((filename) => filename.split(path.sep).join("/")),
    };
    await checkOutput(destination, { workspaceRoot });
    await mkdir(path.dirname(destination), { recursive: true });
    // Stage beside the final output so rename is atomic, even across filesystems.
    staging = await mkdtemp(path.join(path.dirname(destination), ".launch-standalone-stage-"));
    await cp(buildDirectory, path.join(staging, "public"), { recursive: true, force: false, errorOnExist: true });
    await cp(serverDirectory, path.join(staging, "server"), { recursive: true, force: false, errorOnExist: true });
    await Promise.all([
      writeFile(path.join(staging, "README.md"), exportReadme),
      writeFile(path.join(staging, "standalone-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
      writeFile(path.join(staging, "nginx.conf.template"), template),
      writeFile(path.join(staging, "serve.mjs"), renderer),
      writeFile(path.join(staging, "seo-config.json"), `${JSON.stringify(seo, null, 2)}\n`),
      writeFile(path.join(staging, "package.json"), `${JSON.stringify({ private: true, type: "module", scripts: { start: "node serve.mjs" } }, null, 2)}\n`),
    ]);
    await chmod(staging, 0o755); // mkdtemp's 0700 is for staging, not the portable package.
    await checkOutput(destination, { workspaceRoot });
    // rename replaces an empty directory, but refuses a nonempty one. Never delete
    // the user's output directory or copy a partial build into it.
    await rename(staging, destination);
    staging = undefined;
    return { outDir: destination, manifest };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.showHelp) {
    console.info(help);
    return;
  }
  const result = await prepareStandalone({ outDir: options.outDir });
  console.info(`Prepared frontend: ${result.outDir}`);
  console.info("Preparation only — not published; no live API, custom-domain DNS or TLS verification.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`Standalone preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}