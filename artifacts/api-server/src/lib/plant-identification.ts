import {
  IdentifyPlantResponse,
  type PlantIdentificationInput,
  type PlantIdentificationResult,
} from "@workspace/api-zod";
import { IdentificationServiceError, type IdentificationFailure } from "./identification-provider";

// Flash 3.8 authenticated successfully but repeatedly hung on generateContent.
// Use the vision-capable low-latency model verified against the current API.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CONFIDENCE_THRESHOLD = 0.7;
// A fresh vision request can take longer than the former 12-second cutoff.
// The client allows 55 seconds, leaving 10 seconds for upload/proxy overhead.
export const GEMINI_ATTEMPT_TIMEOUT_MS = 30_000;
export const GEMINI_TOTAL_TIMEOUT_MS = 45_000;

export interface GeminiAttemptEvent {
  event: "started" | "headers_received" | "body_received" | "completed" | "failed" | "retry_scheduled";
  model: string;
  attempt: number;
  elapsedMs: number;
  attemptElapsedMs: number;
  stage: "waiting_for_response" | "reading_response" | "parsing_response";
  status?: number;
  failureKind?: "timeout" | "provider" | "transport" | "parse";
  transportCode?: string;
  retryDelayMs?: number;
}

function safeTransportCode(error: unknown): string | undefined {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && [
    "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT",
    "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT",
  ].includes(code) ? code : undefined;
}

export class GeminiServiceError extends IdentificationServiceError {
  constructor(
    message: string,
    upstreamStatus: number,
    retryable = false,
    retryAfterMs = 600,
    category: IdentificationFailure = "configuration",
  ) {
    super(message, upstreamStatus, category, retryable, retryAfterMs);
    this.name = "GeminiServiceError";
  }
}

const uncertainResult = (
  confidence: number | null = null,
): PlantIdentificationResult =>
  IdentifyPlantResponse.parse({
    status: "uncertain",
    commonName: "",
    scientificName: "",
    confidence,
    message:
      "We couldn't identify this confidently. Try a clearer photo of one plant, with its leaves and stems in focus.",
  });

export function isPlantImage(
  bytes: Buffer,
  mimeType: PlantIdentificationInput["mimeType"],
): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  }
  return (
    mimeType === "image/webp" &&
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

function cleanName(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function normalizeGeminiIdentification(
  value: unknown,
): PlantIdentificationResult {
  if (typeof value !== "object" || value === null) return uncertainResult();
  const result = value as Record<string, unknown>;
  const confidence =
    typeof result.confidence === "number" &&
    Number.isFinite(result.confidence) &&
    result.confidence >= 0 &&
    result.confidence <= 1
      ? result.confidence
      : null;

  if (result.status === "not_plant") {
    return IdentifyPlantResponse.parse({
      status: "not_plant",
      commonName: "",
      scientificName: "",
      confidence: null,
      message: "This image doesn't clearly show a plant. Please try another photo.",
    });
  }

  if (result.status !== "identified") return uncertainResult(confidence);

  const commonName = cleanName(result.commonName, 100);
  const scientificName = cleanName(result.scientificName, 120);
  if (
    (confidence !== null && confidence < CONFIDENCE_THRESHOLD) ||
    (result.confidence != null && confidence === null) ||
    !commonName ||
    !scientificName
  ) {
    return uncertainResult(confidence);
  }

  return IdentifyPlantResponse.parse({
    status: "identified",
    commonName,
    scientificName,
    ...(typeof result.description === "string" && result.description.trim()
      ? { description: cleanName(result.description, 600) }
      : {}),
    confidence,
    message: "Likely match. Confirm the name or edit it before saving.",
  });
}

function extractCandidateText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const content = candidates[0]?.content;
  if (typeof content !== "object" || content === null) return null;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) =>
      typeof part === "object" && part !== null && part.thought !== true && "text" in part
        ? (part as { text?: unknown }).text
        : null,
    )
    .filter((part): part is string => typeof part === "string")
    .join("");
  return text ?? null;
}

export async function identifyPlantWithGemini(
  input: PlantIdentificationInput,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  options: {
    attemptTimeoutMs?: number;
    totalTimeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    onAttempt?: (event: GeminiAttemptEvent) => void;
    signal?: AbortSignal;
  } = {},
): Promise<PlantIdentificationResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const started = Date.now();
  const deadline = started + (options.totalTimeoutMs ?? GEMINI_TOTAL_TIMEOUT_MS);
  // Two bounded attempts, including reading the body. Never retry permanent
  // authentication, model, input or malformed-output errors.
  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptStarted = Date.now();
    const remaining = deadline - attemptStarted;
    if (remaining <= 0) {
      throw new GeminiServiceError("Gemini took too long to analyze this photo. Please try again shortly; your photo is still saved.", 504, false, 600, "timeout");
    }
    let stage: GeminiAttemptEvent["stage"] = "waiting_for_response";
    let status: number | undefined;
    const emit = (event: GeminiAttemptEvent["event"], extra: Partial<GeminiAttemptEvent> = {}) =>
      options.onAttempt?.({
        event, model: GEMINI_MODEL, attempt: attempt + 1, stage,
        elapsedMs: Date.now() - started, attemptElapsedMs: Date.now() - attemptStarted,
        ...(status !== undefined ? { status } : {}), ...extra,
      });
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(),
      Math.min(options.attemptTimeoutMs ?? GEMINI_ATTEMPT_TIMEOUT_MS, remaining));
    let failure: GeminiServiceError;
    emit("started");
    try {
      const response = await fetcher(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: input.mimeType,
                    data: input.imageBase64,
                  },
                },
                {
                  text: [
                    "Identify the plant visible in this photo for a home plant-care app.",
                    "Be conservative. Use only visual evidence; do not infer a species from metadata or invent details.",
                    "Return status 'identified' only when a single plant is clearly visible and you can identify both its common and scientific names with at least 70% estimated confidence.",
                    "For a blurry, distant, obstructed, ambiguous, non-plant, or multi-plant image, do not guess or list candidate species. Return status 'uncertain' or 'not_plant' and leave both names empty.",
                    "If available, give an estimated confidence as a number from 0 to 1; omit it when you cannot estimate reliably.",
                    "For an identified plant, also return description: one or two short sentences describing visible leaf shape, color, and growth habit. Base this only on the photo; do not invent plant health, sensor readings, or watering instructions. For uncertain or non-plant images, omit description.",
                  ].join(" "),
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                status: {
                  type: "STRING",
                  enum: ["identified", "uncertain", "not_plant"],
                },
                commonName: { type: "STRING" },
                scientificName: { type: "STRING" },
                description: { type: "STRING" },
                confidence: { type: "NUMBER" },
              },
              required: ["status", "commonName", "scientificName"],
            },
          },
        }),
      });
      status = response.status;
      emit("headers_received");
      stage = "reading_response";
      if (!response.ok) {
        // Never forward Google's raw error (which can contain request details
        // or credentials). Read it only to classify exhausted quota.
        const payload = await response.json().catch((error: unknown) => {
          if (controller.signal.aborted) throw error;
          return null;
        }) as {
          error?: { details?: unknown; message?: string };
        } | null;
        emit("body_received");
        const details = payload?.error?.details;
        const invalidKey = response.status === 400 && (
          (Array.isArray(details) && details.some((detail) => detail?.reason === "API_KEY_INVALID")) ||
          /API.key.not.valid|invalid.API.key/i.test(payload?.error?.message ?? "")
        );
        const exhaustedQuota = Array.isArray(details) && details.some((detail) =>
          Array.isArray(detail?.violations) && detail.violations.some((violation: { quotaId?: string; quotaValue?: string } | null) =>
            /perday/i.test(violation?.quotaId ?? "") || violation?.quotaValue === "0"));
        const retryHeader = response.headers.get("retry-after");
        const retryMs = retryHeader
          ? /^\d+(\.\d+)?$/.test(retryHeader)
            ? Number(retryHeader) * 1000
            : Math.max(0, Date.parse(retryHeader) - Date.now())
          : 600;
        const transient = [429, 500, 502, 503, 504].includes(response.status);
        const message = response.status === 429
          ? exhaustedQuota
            ? "Gemini's available quota is exhausted. The app owner needs to check Google project quota and billing."
            : "Gemini's rate limit or quota was reached. Wait a while before trying again."
          : invalidKey || [401, 403].includes(response.status)
            ? "Gemini rejected the server credentials or access permissions. The app owner needs to check the server configuration."
            : response.status === 404
              ? "The configured Gemini model is unavailable. The app owner needs to check the server configuration."
              : response.status === 400
                ? /image|mime|decode/i.test(payload?.error?.message ?? "")
                  ? "Gemini could not read this image. Choose another plant photo."
                  : "Gemini rejected the analysis request. The app owner needs to check the server request configuration."
                : response.status === 503
                  ? "Gemini is currently busy or unavailable. Please try again shortly; your photo is still saved."
                  : "Gemini is temporarily unavailable. Please try again shortly.";
        const category: IdentificationFailure = response.status === 429
          ? exhaustedQuota ? "quota" : "rate_limit"
          : invalidKey || [401, 403].includes(response.status) ? "credentials"
            : response.status === 400
              ? /image|mime|decode/i.test(payload?.error?.message ?? "") ? "invalid_image" : "configuration"
              : response.status === 415 ? "unsupported_input"
                : [500, 502, 503, 504].includes(response.status) ? "unavailable" : "configuration";
        throw new GeminiServiceError(
          message, response.status,
          transient && !exhaustedQuota && Number.isFinite(retryMs) && retryMs <= 2_000,
          Math.max(600, retryMs || 600),
          category,
        );
      }
      const payload: unknown = await response.json();
      emit("body_received");
      stage = "parsing_response";
      const text = extractCandidateText(payload);
      if (!text) {
        throw new GeminiServiceError("Gemini returned no analysis. Please choose another photo or try again.", 502, false, 600, "invalid_response");
      }
      let modelResult: unknown;
      try {
        modelResult = JSON.parse(text);
      } catch {
        throw new GeminiServiceError("Gemini returned an incomplete analysis. Please try again.", 502, false, 600, "invalid_response");
      }
      const result = normalizeGeminiIdentification(modelResult);
      emit("completed");
      return result;
    } catch (error) {
      failure = error instanceof GeminiServiceError
        ? error
        : controller.signal.aborted
          ? new GeminiServiceError("Gemini took too long to analyze this photo. Please try again shortly; your photo is still saved.", 504, true, 600, "timeout")
          : error instanceof SyntaxError
            ? new GeminiServiceError("Gemini returned an unreadable analysis. Please try again.", 502, false, 600, "invalid_response")
            : new GeminiServiceError("Could not connect to Gemini. Please try again shortly.", 503, true, 600, "transport");
      emit("failed", {
        failureKind: controller.signal.aborted ? "timeout"
          : error instanceof GeminiServiceError ? stage === "parsing_response" ? "parse" : "provider"
            : error instanceof SyntaxError ? "parse" : "transport",
        ...(safeTransportCode(error) ? { transportCode: safeTransportCode(error) } : {}),
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
    if (!failure.retryable || attempt === 1 || options.signal?.aborted || deadline - Date.now() <= failure.retryAfterMs) throw failure;
    emit("retry_scheduled", { retryDelayMs: failure.retryAfterMs });
    await sleep(failure.retryAfterMs);
  }
  // The bounded loop always returns or throws.
  throw new GeminiServiceError("Plant identification is unavailable.", 503);
}
