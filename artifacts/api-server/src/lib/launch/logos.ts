import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";
import { RequestLaunchLogoUploadBody } from "@workspace/api-zod";
import { pool, transaction, LaunchError, invalid, rateLimit } from "./store";
import { logger } from "../logger";

const MAX_BYTES = 1_048_576;
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
// Identical Replit sidecar credentials to the supplied objectStorage template.
const objectStorageClient = new Storage({
  credentials: {
    audience: "replit", subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`, type: "external_account",
    credential_source: { url: `${REPLIT_SIDECAR_ENDPOINT}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
function storagePath(path: string) {
  const parts = path.replace(/^\/+/, "").split("/");
  const bucket = parts.shift();
  if (!bucket || !parts.length || parts.some(part => !part || part === "..")) throw new LaunchError(503, "STORAGE_UNAVAILABLE", "Private launch object storage is not configured.");
  return { bucket, object: parts.join("/") };
}
function privateBase() {
  const base = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!base) throw new LaunchError(503, "STORAGE_UNAVAILABLE", "Private launch object storage is not configured.");
  storagePath(base);
  return `${base}/launch-logos`;
}
export interface LaunchLogoStorage {
  signPut(path: string): Promise<string>;
  read(path: string, maxBytes: number): Promise<Buffer>;
  write(path: string, bytes: Buffer, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}
export const launchLogoStorage: LaunchLogoStorage = {
  async signPut(path) {
    const { bucket, object } = storagePath(path);
    const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket_name: bucket, object_name: object, method: "PUT", expires_at: new Date(Date.now() + 300_000).toISOString() }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new LaunchError(503, "STORAGE_UNAVAILABLE", "Cannot issue a private logo upload URL.");
    const result = await response.json() as { signed_url?: unknown };
    if (typeof result.signed_url !== "string" || !result.signed_url.startsWith("https://")) throw new LaunchError(503, "STORAGE_UNAVAILABLE", "Invalid object-storage signing response.");
    return result.signed_url;
  },
  async read(path, maxBytes) {
    const { bucket, object } = storagePath(path);
    const stream = objectStorageClient.bucket(bucket).file(object).createReadStream({ decompress: false });
    const timer = setTimeout(() => stream.destroy(new Error("Logo storage read timed out")), 10_000);
    const chunks: Buffer[] = []; let size = 0;
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > maxBytes) { stream.destroy(); throw new LaunchError(413, "INVALID_INPUT", "Logo exceeds the 1 MiB byte limit."); }
        chunks.push(bytes);
      }
      return Buffer.concat(chunks);
    } finally { clearTimeout(timer); stream.destroy(); }
  },
  async write(path, bytes, contentType) {
    const { bucket, object } = storagePath(path);
    await objectStorageClient.bucket(bucket).file(object).save(bytes, {
      resumable: false, timeout: 10_000, preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType, cacheControl: "private, no-store" },
    });
  },
  async remove(path) {
    const { bucket, object } = storagePath(path);
    await objectStorageClient.bucket(bucket).file(object).delete({ ignoreNotFound: true });
  },
};
export async function canonicalizeLogo(bytes: Buffer, contentType: string) {
  if (bytes.length < 8 || bytes.length > MAX_BYTES) invalid("Logo must be a nonempty PNG or JPEG no larger than 1 MiB.");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((contentType === "image/png" && !png) || (contentType === "image/jpeg" && !jpeg) || !["image/png","image/jpeg"].includes(contentType)) invalid("Logo bytes do not match declared PNG/JPEG type.");
  try {
    const image = sharp(bytes, { limitInputPixels: 2048 * 2048, failOn: "warning", animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 2048 || metadata.height > 2048 || (metadata.pages ?? 1) !== 1 || !["png","jpeg"].includes(metadata.format ?? "")) invalid("Logo dimensions must be at most 2048×2048 and contain one image.");
    const normalized = image.rotate();
    const result = await (contentType === "image/png" ? normalized.png({ compressionLevel: 9 }) : normalized.jpeg({ quality: 90 })).toBuffer({ resolveWithObject: true });
    if (result.data.length > MAX_BYTES) invalid("Re-encoded logo exceeds 1 MiB; use a smaller image.");
    return { bytes: result.data, width: result.info.width, height: result.info.height, contentType };
  } catch (error) {
    if (error instanceof LaunchError) throw error;
    invalid("Logo is corrupt, oversized, or cannot be safely decoded as PNG/JPEG.");
  }
}
export async function requestLogo(wallet: string, body: unknown, storage = launchLogoStorage) {
  const input = RequestLaunchLogoUploadBody.strict().parse(body);
  rateLimit(`logo-upload:${wallet}`, 20, 3600_000);
  const id = randomUUID(), path = `${privateBase()}/incoming/${id}`;
  await transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`launch-logo:${wallet}`]);
    const quota = await client.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE created_at>now()-interval '1 day')::int AS daily FROM launch_logos WHERE wallet=$1", [wallet]);
    if (quota.rows[0].total >= 100 || quota.rows[0].daily >= 20) throw new LaunchError(429, "RATE_LIMITED", "Private logo account quota reached (20 daily, 100 total).");
    await client.query("INSERT INTO launch_logos(id,wallet,upload_path,content_type,declared_size,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '5 minutes')", [id,wallet,path,input.contentType,input.size]);
  });
  try { return { id, uploadURL: await storage.signPut(path) }; }
  catch (error) {
    await pool.query("DELETE FROM launch_logos WHERE id=$1 AND wallet=$2 AND completed_at IS NULL", [id,wallet]);
    if (error instanceof LaunchError) throw error;
    throw new LaunchError(503, "STORAGE_UNAVAILABLE", "Private logo upload signing is unavailable.");
  }
}
export async function completeLogo(wallet: string, id: string, storage = launchLogoStorage) {
  return transaction(async client => {
    const { rows } = await client.query("SELECT * FROM launch_logos WHERE id=$1 AND wallet=$2 FOR UPDATE", [id,wallet]);
    const row = rows[0];
    if (!row) throw new LaunchError(404, "NOT_FOUND", "Private logo not found.");
    if (row.completed_at && row.safe_path) return { id };
    if (new Date(row.expires_at).getTime() <= Date.now()) throw new LaunchError(400, "INVALID_INPUT", "Logo upload expired. Request a new upload URL.");
    let bytes: Buffer;
    try { bytes = await storage.read(row.upload_path, MAX_BYTES); }
    catch (error) {
      if (error instanceof LaunchError) throw error;
      throw new LaunchError(503, "STORAGE_UNAVAILABLE", "Uploaded logo is missing or storage is unavailable. Finish the direct upload before completing.");
    }
    if (bytes.length !== row.declared_size) invalid("Uploaded logo size differs from the declared size.");
    const safe = await canonicalizeLogo(bytes, row.content_type);
    const safePath = `${privateBase()}/safe/${randomUUID()}`;
    try { await storage.write(safePath, safe.bytes, safe.contentType); }
    catch { throw new LaunchError(503, "STORAGE_UNAVAILABLE", "Unable to persist the sanitized private logo."); }
    await client.query("UPDATE launch_logos SET safe_path=$1,safe_size=$2,width=$3,height=$4,completed_at=now() WHERE id=$5 AND wallet=$6", [safePath,safe.bytes.length,safe.width,safe.height,id,wallet]);
    // An upload URL could overwrite incoming bytes until expiry. Safe immutable
    // bytes use a different, never-presigned object and are the only served path.
    await storage.remove(row.upload_path).catch(() => logger.warn("Launch raw logo cleanup failed; original object remains private and unservable."));
    return { id };
  });
}
export async function getLogo(wallet: string, id: string, storage = launchLogoStorage) {
  const { rows } = await pool.query("SELECT safe_path,content_type FROM launch_logos WHERE id=$1 AND wallet=$2 AND completed_at IS NOT NULL AND safe_path IS NOT NULL", [id,wallet]);
  if (!rows[0]) throw new LaunchError(404, "NOT_FOUND", "Completed private logo not found.");
  try { return { bytes: await storage.read(rows[0].safe_path, MAX_BYTES), contentType: rows[0].content_type as string }; }
  catch { throw new LaunchError(503, "STORAGE_UNAVAILABLE", "Private logo storage is temporarily unavailable."); }
}