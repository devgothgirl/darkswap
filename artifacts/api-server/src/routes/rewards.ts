import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  EnrollRewardsBody,
  EnrollRewardsResponse,
  GetRewardsConfigResponse,
  GetRewardsMeQueryParams,
  GetRewardsMeResponse,
} from "@workspace/api-zod";
import {
  enrollRewards,
  rewardsConfig,
  rewardsMe,
  RewardsAuthError,
  verifyRewardsIdentity,
} from "../lib/rewards";

const router: IRouter = Router();
const requestCounts = new Map<string, { count: number; reset: number }>();

function limit(max: number, bucket: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${bucket}:${req.ip ?? "unknown"}`;
    const record = requestCounts.get(key);
    if (requestCounts.size > 5000) {
      for (const [id, value] of requestCounts) if (value.reset < now) requestCounts.delete(id);
    }
    if (!record || record.reset < now) requestCounts.set(key, { count: 1, reset: now + 60_000 });
    else if (record.count >= max) {
      res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
      return;
    } else record.count++;
    next();
  };
}

function fail(req: Request, res: Response, error: unknown): void {
  if (error instanceof RewardsAuthError) {
    req.log.warn({ status: error.status }, "Rewards request rejected");
    res.status(error.status).json({ error: error.message });
    return;
  }
  req.log.error("Rewards request failed");
  res.status(503).json({ error: "Email rewards are temporarily unavailable. Please try again later." });
}

router.get("/rewards/config", (_req, res): void => {
  res.json(GetRewardsConfigResponse.parse(rewardsConfig()));
});

router.get("/rewards/me", limit(30, "rewards-me"), async (req, res): Promise<void> => {
  const parsed = GetRewardsMeQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid rewards history page." });
    return;
  }
  try {
    const identity = await verifyRewardsIdentity(req.get("authorization"));
    res.json(GetRewardsMeResponse.parse(await rewardsMe(identity, parsed.data.cursor, parsed.data.limit)));
  } catch (error) {
    fail(req, res, error);
  }
});

router.post("/rewards/enroll", limit(8, "rewards-enroll"), async (req, res): Promise<void> => {
  const parsed = EnrollRewardsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confirm or withdraw rewards consent explicitly." });
    return;
  }
  try {
    const identity = await verifyRewardsIdentity(req.get("authorization"), parsed.data.consent);
    const enrolled = await enrollRewards(identity, parsed.data.consent);
    res.json(EnrollRewardsResponse.parse({
      enrolled,
      message: enrolled
        ? "Email rewards are enabled. No signup points were added."
        : "Rewards consent was withdrawn and the stored email was removed.",
    }));
  } catch (error) {
    fail(req, res, error);
  }
});

export default router;