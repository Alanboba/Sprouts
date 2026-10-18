import {
  IdentifyPlantBody,
  IdentifyPlantResponse,
  type PlantIdentificationInput,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request } from "express";
import { isPlantImage } from "../lib/plant-identification";
import { identifyPlant } from "../lib/identify-plant";
import { IdentificationServiceError } from "../lib/identification-provider";
import { createIdentificationCache } from "../lib/plant-identification-cache";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 1_500_000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestsByClient = new Map<string, number[]>();
const identifyCached = createIdentificationCache();

function getClientKey(req: Request): string {
  const forwarded = req
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded?.at(-1) ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function takeRateLimitToken(clientKey: string, now: number): number | null {
  const recent = (requestsByClient.get(clientKey) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestsByClient.set(clientKey, recent);
    return Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
  }
  recent.push(now);
  requestsByClient.set(clientKey, recent);

  if (requestsByClient.size > 2_000) {
    for (const [key, timestamps] of requestsByClient) {
      if (timestamps.every((timestamp) => now - timestamp >= WINDOW_MS)) {
        requestsByClient.delete(key);
      }
    }
  }
  return null;
}

function hasValidBase64(value: string): boolean {
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
    value,
  );
}

router.post("/plants/identify", async (req, res): Promise<void> => {
  const receivedAt = Date.now();
  const parsed = IdentifyPlantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid plant image and try again." });
    return;
  }

  const input: PlantIdentificationInput = parsed.data;
  if (!hasValidBase64(input.imageBase64)) {
    res.status(400).json({ error: "The uploaded image file is invalid." });
    return;
  }

  const bytes = Buffer.from(input.imageBase64, "base64");
  if (bytes.length < 32) {
    res.status(400).json({ error: "The uploaded image file is invalid." });
    return;
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    res.status(413).json({
      error: "Choose a smaller photo (up to 1.5 MB after image compression).",
    });
    return;
  }
  if (!isPlantImage(bytes, input.mimeType)) {
    res.status(400).json({
      error: "This file is not a valid JPEG, PNG, or WebP image. Choose another photo.",
    });
    return;
  }

  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  const plantnetKey = process.env["PLANTNET_API_KEY"]?.trim();
  if (!apiKey) {
    res.status(503).json({
      error: "Plant identification is not configured on the server yet.",
    });
    return;
  }

  try {
    const clientKey = getClientKey(req);
    req.log.info({ imageBytes: bytes.length, mimeType: input.mimeType }, "Plant identification image received");
    const keys = { gemini: apiKey, plantnet: plantnetKey };
    const result = await identifyCached(input, clientKey, keys, async () => {
      const retryAfter = takeRateLimitToken(clientKey, Date.now());
      if (retryAfter !== null) {
        throw new IdentificationServiceError(
          "Too many identification attempts. Please wait a few minutes and try again.",
          429, "app_limit", false, retryAfter * 1000,
        );
      }
      return identifyPlant(input, keys, {
        onEvent: (event) => req.log.info(event, "Plant identification provider attempt"),
      });
    }, (cacheState) => {
      res.setHeader("X-Plant-Analysis-Cache", cacheState);
      req.log.info({ cacheState }, "Plant identification cache");
    });
    req.log.info({ elapsedMs: Date.now() - receivedAt, resultStatus: result.status }, "Plant identification completed");
    res.json(IdentifyPlantResponse.parse(result));
  } catch (error) {
    const message =
      error instanceof IdentificationServiceError
        ? error.message
        : "Plant identification is temporarily unavailable. Please try again.";
    req.log.error(
      {
        // Log safe classifications, not raw fetch errors or request images.
        ...(error instanceof IdentificationServiceError
          ? { upstreamStatus: error.upstreamStatus, category: error.category }
          : {}),
      },
      "Plant identification request failed",
    );
    const status = error instanceof IdentificationServiceError
      ? error.upstreamStatus === 429 ? 429
        : error.upstreamStatus === 400 ? 400
          : error.upstreamStatus === 504 ? 504
            : error.upstreamStatus === 502 ? 502 : 503
      : 503;
    if (status === 429 && error instanceof IdentificationServiceError) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))));
    }
    res.status(status).json({ error: message });
  }
});

export default router;
