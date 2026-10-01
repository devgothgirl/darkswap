import assert from "node:assert/strict";
import { after, test } from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import type { Request, Response } from "express";
import bs58 from "bs58";
import sharp from "sharp";
import { pool } from "@workspace/db";
import { CreateLaunchDraftResponse, GetLaunchCreatorResponse, GetLaunchAdminConfigResponse, GetLaunchAdminReviewsResponse } from "@workspace/api-zod";
import { createChallenge, verifyChallenge, verifyWalletSignature, findLaunchSession, requireLaunchSession, logout, requestOrigin, isLaunchAdmin, SESSION_COOKIE } from "./auth";
import { saveDraft, getOwnedDraft, listDrafts, deleteDraft, validateDraft, creatorDashboard } from "./drafts";
import { defaultLaunchConfigInput, loadLaunchConfig, loadLaunchReviews, resolveLaunchConfigAvailability } from "./config";
import { updateConfig, createReview, loadAudit, validateConfig, validateReview } from "./admin";
import { canonicalizeLogo, requestLogo, completeLogo, getLogo, type LaunchLogoStorage } from "./logos";
import { LaunchError, validAddress } from "./store";
import { launchDetectorStatus } from "./review";

if (process.env.LAUNCH_PRIVATE_TEST_DB !== "true") throw new Error("Run test:launch-private; these tests require the isolated temporary PostgreSQL harness.");
after(async () => { await pool.end(); });
const origin = "https://launch-test.example.invalid";
process.env.LAUNCH_ALLOWED_ORIGINS = origin;
process.env.NODE_ENV = "production";
process.env.PRIVATE_OBJECT_DIR = "/private-test-bucket/private";
delete process.env.LAUNCH_ADMIN_WALLETS;
function key() {
  const pair = generateKeyPairSync("ed25519");
  const wallet = bs58.encode(pair.publicKey.export({ type: "spki", format: "der" }).subarray(-32));
  return { ...pair, wallet };
}
const alice = key(), bob = key(), mint = key().wallet;
type Jar = Record<string, string>;
function request(body: unknown = undefined, jar: Jar = {}, extra: Record<string,string> = {}, requestOriginValue = origin): Request {
  const headers: Record<string,string> = { host: new URL(requestOriginValue).host, origin: requestOriginValue, cookie: Object.entries(jar).map(([k,v]) => `${k}=${v}`).join("; "), ...extra };
  return { body, headers, protocol: "https", secure: true, ip: headers["x-test-ip"] ?? alice.wallet, get: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}
function response(jar: Jar): Response {
  return {
    cookie(name: string, value: string, options: Record<string,unknown>) {
      assert.equal(options.httpOnly, true); assert.equal(options.secure, true); assert.equal(options.path, "/"); assert.equal(options.sameSite, "strict"); jar[name] = value; return this;
    },
    clearCookie(name: string) { delete jar[name]; return this; },
  } as unknown as Response;
}
const draftInput = { name: "", symbol: "", description: "", website: "", x: "", telegram: "", discord: "", github: "", logoId: null, pairMint: null, network: "mainnet-beta", supply: "1000000000", allocations: { creator: 0, developer: 0, liquidity: 100, community: 0 } };
const errorStatus = (status: number) => (error: unknown) => error instanceof LaunchError && error.status === status;

test("launch private security, isolated persistence, audit and sanitized storage", async t => {
  const jar: Jar = {}; let authenticated: Awaited<ReturnType<typeof verifyChallenge>>;
  await t.test("Ed25519 proof validates exact message and 32-byte base58; browser binding and concurrent replay fail closed", async () => {
    assert.equal(validAddress("1".repeat(33)), false);
    const challenge = await createChallenge(request({ wallet: alice.wallet, network: "mainnet-beta" },jar), response(jar));
    const signature = sign(null, Buffer.from(challenge.message), alice.privateKey).toString("base64");
    assert.equal(verifyWalletSignature(alice.wallet, challenge.message, signature), true);
    assert.equal(verifyWalletSignature(bob.wallet, challenge.message, signature), false);
    assert.equal(verifyWalletSignature(alice.wallet, challenge.message + "!", signature), false);
    assert.equal(verifyWalletSignature(alice.wallet, challenge.message, signature.slice(0,-2)), false);
    await assert.rejects(verifyChallenge(request({ id: challenge.id, signature },{}), response({})), errorStatus(401));
    const frozenJar = { ...jar };
    const attempts = await Promise.allSettled([1,2,3].map(() => verifyChallenge(request({ id: challenge.id, signature },frozenJar),response(jar))));
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    authenticated = (attempts.find(result => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof verifyChallenge>>>).value;
    assert.equal(authenticated.wallet, alice.wallet);
    assert.equal(authenticated.isAdmin, false);
    assert.ok(jar[SESSION_COOKIE]);
    const rows = await pool.query("SELECT token_hash FROM launch_sessions WHERE wallet=$1", [alice.wallet]);
    assert.notEqual(rows.rows[0].token_hash, jar[SESSION_COOKIE]);
  });
  await t.test("sessions are origin-bound on reads; CSRF and default-deny admin enforced independently", async () => {
    assert.equal((await findLaunchSession(request(undefined,jar)))?.wallet, alice.wallet);
    const withoutOrigin = request(undefined,jar); delete withoutOrigin.headers.origin;
    assert.equal((await findLaunchSession(withoutOrigin))?.wallet, alice.wallet);
    await assert.rejects(findLaunchSession(request(undefined,jar,{},"https://attacker.example.invalid")), errorStatus(403));
    assert.throws(() => requestOrigin(request(undefined,jar,{ origin: "https://attacker.example.invalid" })), errorStatus(403));
    await assert.rejects(requireLaunchSession(request(undefined,jar),undefined,{ csrf: true }), errorStatus(403));
    await assert.rejects(requireLaunchSession(withoutOrigin,undefined,{ csrf: true }), errorStatus(403));
    const valid = request(undefined,jar,{ "x-launch-csrf": authenticated.csrfToken });
    assert.equal((await requireLaunchSession(valid,undefined,{ csrf: true })).wallet, alice.wallet);
    await assert.rejects(requireLaunchSession(valid,undefined,{ admin: true }), errorStatus(403));
    process.env.LAUNCH_ADMIN_WALLETS = bob.wallet;
    assert.equal(isLaunchAdmin(alice.wallet), false);
    process.env.LAUNCH_ADMIN_WALLETS = alice.wallet;
    assert.equal((await requireLaunchSession(valid,undefined,{ admin: true })).isAdmin, true);
    delete process.env.LAUNCH_ADMIN_WALLETS;
  });
  await t.test("strict draft metadata, exact basis-point allocation and full replacement validation", async () => {
    for (const changed of [
      { supply: "0" }, { supply: "1e9" }, { supply: "1".repeat(79) }, { supply: "-1" },
      { website: "javascript:alert(1)" }, { website: "https://user:secret@example.invalid" },
      { name: "<script>alert(1)</script>" }, { description: "\u0000" },
      { pairMint: "1".repeat(33) }, { executionAvailable: true }, { wallet: bob.wallet },
      { allocations: { creator: 1, developer: 0, liquidity: 100, community: 0 } },
      { allocations: { creator: 0.001, developer: 0, liquidity: 99.999, community: 0 } },
      { allocations: { creator: 0.00000000001, developer: 0, liquidity: 100, community: 0 } },
      { allocations: { creator: 0, developer: 0, liquidity: 100, community: 0, fee: 0 } },
    ]) assert.throws(() => validateDraft({ ...draftInput,...changed }));
    assert.throws(() => validateDraft({}));
    assert.equal(validateDraft({ ...draftInput, allocations: { creator: 33.33, developer: 33.33, liquidity: 33.34, community: 0 } }).supply, "1000000000");
  });
  await t.test("owner-only save/resume/update/delete and cross-wallet logo checks", async () => {
    const saved = await saveDraft(alice.wallet,draftInput);
    assert.ok(CreateLaunchDraftResponse.safeParse(saved).success);
    assert.equal(saved.status, "preparation-ready");
    assert.equal(saved.executionAvailable, false);
    assert.equal((await listDrafts(alice.wallet)).length, 1);
    assert.equal((await listDrafts(bob.wallet)).length, 0);
    await assert.rejects(getOwnedDraft(bob.wallet,saved.id), errorStatus(404));
    await assert.rejects(saveDraft(bob.wallet,draftInput,saved.id), errorStatus(404));
    await assert.rejects(deleteDraft(bob.wallet,saved.id), errorStatus(404));
    await assert.rejects(saveDraft(alice.wallet,{ ...draftInput,logoId: "not-owned" }), errorStatus(404));
    const changed = await saveDraft(alice.wallet,{ ...draftInput,name: "Private preparation" },saved.id);
    assert.equal(changed.name, "Private preparation");
    await assert.rejects(saveDraft(alice.wallet,draftInput,saved.id,"2000-01-01T00:00:00.000Z"), errorStatus(409));
    await deleteDraft(alice.wallet,saved.id);
    await assert.rejects(getOwnedDraft(alice.wallet,saved.id), errorStatus(404));
  });
  await t.test("admin config is inactive, strict, auditable and blocks featured review records atomically", async () => {
    process.env.DARK_PAIR_PRIORITY = "17";
    assert.equal(defaultLaunchConfigInput().darkPairPriority,17);
    process.env.DARK_PAIR_PRIORITY = "1.5";
    assert.equal(defaultLaunchConfigInput().darkPairPriority,1);
    delete process.env.DARK_PAIR_PRIORITY;
    const defaults = defaultLaunchConfigInput();
    assert.equal(defaults.darkTokenAddress, null);
    assert.equal((await loadLaunchConfig()).executionAvailable, false);
    const cfg = { ...await loadLaunchConfig(), darkPairingEnabled: true,darkTokenAddress: mint };
    const pair = { mint,network: "mainnet-beta",enabled: true,launchable: true,launchLabReady: true,group: "dark" };
    assert.equal(resolveLaunchConfigAvailability(cfg,{ source: { stale: false },pairs: [pair] }).defaultView,"dark");
    for (const changed of [{ mint: bob.wallet },{ enabled: false },{ launchLabReady: false },{ launchLabReady: null },{ group: "other" }]) {
      assert.equal(resolveLaunchConfigAvailability(cfg,{ source: { stale: false },pairs: [{ ...pair,...changed }] }).darkPairAvailable,false);
    }
    assert.equal(resolveLaunchConfigAvailability(cfg,{ source: { stale: true },pairs: [pair] }).darkPairAvailable,false);
    assert.equal(resolveLaunchConfigAvailability({ ...cfg,paused: true },{ source: { stale: false },pairs: [pair] }).darkPairAvailable,false);
    assert.throws(() => validateConfig({ ...defaults,executionAvailable: true }));
    assert.throws(() => validateConfig({ ...defaults,pairOverrides: [{ mint,network: "mainnet-beta",enabled: true,priority: 1,group: "dark",evidenceUrl: "https://evidence.example.invalid" }] }));
    assert.throws(() => validateConfig({ ...defaults,featuredMints: [mint,mint] }));
    const config = await updateConfig(alice.wallet,{ ...defaults,featuredMints: [mint],feeProposal: { amount: "1",currency: "SOL",notes: "Inactive draft only" } });
    assert.ok(GetLaunchAdminConfigResponse.safeParse(config).success);
    assert.equal(config.providerLaunchFee, null); assert.equal(config.executionAvailable, false);
    const review = { targetType: "token",target: mint,network: "mainnet-beta",reason: "malicious_metadata",evidenceUrls: ["https://evidence.example.invalid/report"],notes: "Observed malicious token metadata; requires review.",suppressMetadata: true };
    assert.throws(() => validateReview({ ...review,evidenceUrls: [] }));
    assert.throws(() => validateReview({ ...review,targetType: "wallet" }));
    await createReview(alice.wallet,review);
    assert.deepEqual((await loadLaunchConfig()).featuredMints,[]);
    await assert.rejects(updateConfig(alice.wallet,{ ...defaults,featuredMints: [mint] }), errorStatus(400));
    const detectors = launchDetectorStatus.filter(item => ["self_referral","circular_activity","transaction_spam","suspected_wallet_cluster"].includes(item.name))
      .map(item => ({ ...item,name: item.name === "suspected_wallet_cluster" ? "wallet_cluster" : item.name }));
    assert.ok(GetLaunchAdminReviewsResponse.safeParse({ reviews: await loadLaunchReviews(),detectors }).success);
    assert.equal((await loadAudit(100)).length, 2);
  });
  await t.test("creator metrics remain unknown and flagged eligibility never becomes claimable", async () => {
    const dashboard = await creatorDashboard(alice.wallet);
    assert.ok(GetLaunchCreatorResponse.safeParse(dashboard).success);
    assert.deepEqual(dashboard.launches,[]);
    assert.ok(Object.values(dashboard.metrics).every(value => value === null));
    await createReview(bob.wallet,{ targetType: "wallet",target: alice.wallet,network: "mainnet-beta",reason: "self_referral",evidenceUrls: ["https://evidence.example.invalid/referral"],notes: "Manual evidence-backed review only, not identity proof.",suppressMetadata: false });
    const reviewed = await creatorDashboard(alice.wallet);
    assert.equal(reviewed.incentives.state, "under_review");
    assert.equal(reviewed.incentives.campaign_eligible, null);
  });
  await t.test("logo decoder rejects SVG, truncation, wrong MIME and oversize dimensions; re-encoding strips metadata", async () => {
    await assert.rejects(canonicalizeLogo(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),"image/png"), errorStatus(400));
    await assert.rejects(canonicalizeLogo(Buffer.alloc(1_048_577),"image/png"), errorStatus(400));
    const big = await sharp({ create: { width: 2049,height: 1,channels: 3,background: "red" } }).png().toBuffer();
    await assert.rejects(canonicalizeLogo(big,"image/png"), errorStatus(400));
    const png = await sharp({ create: { width: 64,height: 64,channels: 3,background: "purple" } }).withMetadata().png().toBuffer();
    await assert.rejects(canonicalizeLogo(png,"image/jpeg"), errorStatus(400));
    await assert.rejects(canonicalizeLogo(png.subarray(0,50),"image/png"), errorStatus(400));
    const clean = await canonicalizeLogo(png,"image/png");
    assert.equal(clean.width,64);
    assert.equal((await sharp(clean.bytes).metadata()).exif,undefined);
    assert.equal((await sharp(clean.bytes).metadata()).icc,undefined);
  });
  await t.test("private direct upload stores only safe immutable object; completion idempotent; owner and size checks enforced", async () => {
    const objects = new Map<string,Buffer>(); let signedPath = "";
    const storage: LaunchLogoStorage = {
      async signPut(path) { signedPath = path; return "https://storage.example.invalid/signed"; },
      async read(path,maxBytes) { const bytes = objects.get(path); if (!bytes) throw new Error("Not found"); if (bytes.length > maxBytes) throw new LaunchError(413,"INVALID_INPUT","Too large"); return bytes; },
      async write(path,bytes) { assert.equal(objects.has(path),false); objects.set(path,bytes); },
      async remove(path) { objects.delete(path); },
    };
    const png = await sharp({ create: { width: 32,height: 32,channels: 3,background: "purple" } }).png().toBuffer();
    const uploaded = await requestLogo(alice.wallet,{ name: "../../evil.svg",size: png.length,contentType: "image/png" },storage);
    assert.equal(signedPath.includes("evil"),false);
    objects.set(signedPath,png);
    await assert.rejects(getLogo(alice.wallet,uploaded.id,storage), errorStatus(404));
    await assert.rejects(completeLogo(bob.wallet,uploaded.id,storage), errorStatus(404));
    await completeLogo(alice.wallet,uploaded.id,storage);
    assert.equal(objects.has(signedPath),false);
    assert.deepEqual(await completeLogo(alice.wallet,uploaded.id,storage),{ id: uploaded.id });
    const image = await getLogo(alice.wallet,uploaded.id,storage); assert.equal(image.contentType,"image/png");
    await assert.rejects(getLogo(bob.wallet,uploaded.id,storage), errorStatus(404));
    const draft = await saveDraft(alice.wallet,{ ...draftInput,logoId: uploaded.id });
    assert.equal(draft.logoId,uploaded.id);
    await assert.rejects(saveDraft(bob.wallet,{ ...draftInput,logoId: uploaded.id }), errorStatus(404));
    const wrong = await requestLogo(alice.wallet,{ name: "wrong.png",size: 10,contentType: "image/png" },storage);
    objects.set(signedPath,png);
    await assert.rejects(completeLogo(alice.wallet,wrong.id,storage), errorStatus(400));
  });
  await t.test("logout revokes session and stale sessions cannot access private data", async () => {
    const oldJar = { ...jar };
    const session = await requireLaunchSession(request(undefined,jar));
    await logout(request(undefined,jar),response(jar),session);
    assert.equal(jar[SESSION_COOKIE],undefined);
    assert.equal(await findLaunchSession(request(undefined,oldJar)),null);
    await assert.rejects(requireLaunchSession(request(undefined,oldJar)), errorStatus(401));
  });
  await t.test("challenge expiry, cross-wallet proofs, domain binding and session rotation are enforced", async () => {
    const rotatedJar: Jar = {};
    const makeRequest = (body: unknown, cookies = rotatedJar) => request(body,cookies,{ "x-test-ip": bob.wallet });
    const expired = await createChallenge(makeRequest({ wallet: bob.wallet,network: "mainnet-beta" }),response(rotatedJar));
    await pool.query("UPDATE launch_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
    await assert.rejects(verifyChallenge(makeRequest({ id: expired.id,signature: sign(null,Buffer.from(expired.message),bob.privateKey).toString("base64") }),response(rotatedJar)),errorStatus(401));
    const fresh = await createChallenge(makeRequest({ wallet: bob.wallet,network: "mainnet-beta" }),response(rotatedJar));
    await assert.rejects(verifyChallenge(makeRequest({ id: fresh.id,signature: sign(null,Buffer.from(fresh.message),alice.privateKey).toString("base64") }),response(rotatedJar)),errorStatus(401));
    await verifyChallenge(makeRequest({ id: fresh.id,signature: sign(null,Buffer.from(fresh.message),bob.privateKey).toString("base64") }),response(rotatedJar));
    const before = { ...rotatedJar };
    process.env.LAUNCH_ALLOWED_ORIGINS = `${origin},https://other-allowed.example.invalid`;
    assert.equal(await findLaunchSession(request(undefined,rotatedJar,{},"https://other-allowed.example.invalid")),null);
    process.env.LAUNCH_ALLOWED_ORIGINS = origin;
    const next = await createChallenge(makeRequest({ wallet: alice.wallet,network: "mainnet-beta" }),response(rotatedJar));
    await verifyChallenge(makeRequest({ id: next.id,signature: sign(null,Buffer.from(next.message),alice.privateKey).toString("base64") }),response(rotatedJar));
    assert.equal(await findLaunchSession(makeRequest(undefined,before)),null);
    assert.equal((await findLaunchSession(makeRequest(undefined)))?.wallet,alice.wallet);
    await pool.query("UPDATE launch_sessions SET expires_at=now()-interval '1 second' WHERE wallet=$1",[alice.wallet]);
    assert.equal(await findLaunchSession(makeRequest(undefined)),null);
  });
});