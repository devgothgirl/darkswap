import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import launchRouter from "./routes/launch";
import launchExecutionRouter from "./routes/launch-execution";

const app: Express = express();

// Trust only the deployment router immediately in front of this service.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Webhook signatures cover exact raw bytes; register before JSON parsing.
// Disabled launch execution fails closed even for malformed/oversized bodies.
app.use(["/api", "/launch/api"], launchExecutionRouter);
app.use("/api/marketing/webhook/resend", express.raw({ type: "application/json", limit: "32kb" }));
app.use("/api/support/webhook/resend", express.raw({ type: "application/json", limit: "32kb" }));
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

app.use("/api", router);
// The separate Launch artifact uses its prefix for all browser API requests.
// This ingress intentionally excludes every existing swap/rewards/marketing route.
app.use("/launch/api", launchRouter);

export default app;
