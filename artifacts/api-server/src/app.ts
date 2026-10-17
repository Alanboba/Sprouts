import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import type { ErrorRequestHandler } from "express";

const app: Express = express();

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
app.use(cors());
// Plant photos are compressed to <=1.5 MB on-device; give only this endpoint
// enough JSON headroom for base64 expansion. Other API routes retain Express's
// default small body limit.
app.use("/api/plants/identify", express.json({ limit: "2mb" }));
const identificationBodyErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 413) {
      res.status(413).json({
        error: "This photo is too large. Choose a smaller image and try again.",
      });
      return;
    }
    if (status === 400) {
      res.status(400).json({ error: "The uploaded image request is invalid." });
      return;
    }
  }
  next(error);
};
app.use("/api/plants/identify", identificationBodyErrorHandler);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
