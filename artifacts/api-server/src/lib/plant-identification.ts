import {
  IdentifyPlantResponse,
  type PlantIdentificationInput,
  type PlantIdentificationResult,
} from "@workspace/api-zod";

// Flash 3.8 authenticated successfully but repeatedly hung on generateContent.
// Use the vision-capable low-latency model verified against the current API.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CONFIDENCE_THRESHOLD = 0.7;

export class GeminiServiceError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus: number,
    readonly retryable = false,
    readonly retryAfterMs = 600,
  ) {
    super(message);
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
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<PlantIdentificationResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // Two bounded attempts, including reading the body. Never retry permanent
  // authentication, model, input or malformed-output errors.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.attemptTimeoutMs ?? 12_000);
    let failure: GeminiServiceError;
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
                confidence: { type: "NUMBER" },
              },
              required: ["status", "commonName", "scientificName"],
            },
          },
        }),
      });
      if (!response.ok) {
        // Never forward Google's raw error (which can contain request details
        // or credentials). Read it only to classify exhausted quota.
        const payload = await response.json().catch(() => null) as {
          error?: { details?: unknown };
        } | null;
        const details = payload?.error?.details;
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
          ? "Gemini's rate limit or quota was reached. Wait a while before trying again."
          : [401, 403].includes(response.status)
            ? "Gemini rejected the server credentials or access permissions. The app owner needs to check the server configuration."
            : response.status === 404
              ? "The configured Gemini model is unavailable. The app owner needs to check the server configuration."
              : response.status === 400
                ? "Gemini could not read this image. Choose another plant photo."
                : "Gemini is temporarily unavailable. Please try again shortly.";
        throw new GeminiServiceError(
          message, response.status,
          transient && !exhaustedQuota && Number.isFinite(retryMs) && retryMs <= 2_000,
          Math.max(600, retryMs || 600),
        );
      }
      const payload: unknown = await response.json();
      const text = extractCandidateText(payload);
      if (!text) {
        throw new GeminiServiceError("Gemini returned no analysis. Please choose another photo or try again.", 502);
      }
      let modelResult: unknown;
      try {
        modelResult = JSON.parse(text);
      } catch {
        throw new GeminiServiceError("Gemini returned an incomplete analysis. Please try again.", 502);
      }
      return normalizeGeminiIdentification(modelResult);
    } catch (error) {
      failure = error instanceof GeminiServiceError
        ? error
        : controller.signal.aborted
          ? new GeminiServiceError("Plant identification timed out. Please try again shortly.", 504, true)
          : error instanceof SyntaxError
            ? new GeminiServiceError("Gemini returned an unreadable analysis. Please try again.", 502)
            : new GeminiServiceError("Could not connect to Gemini. Please try again shortly.", 503, true);
    } finally {
      clearTimeout(timeout);
    }
    if (!failure.retryable || attempt === 1) throw failure;
    await sleep(failure.retryAfterMs);
  }
  // The bounded loop always returns or throws.
  throw new GeminiServiceError("Plant identification is unavailable.", 503);
}
