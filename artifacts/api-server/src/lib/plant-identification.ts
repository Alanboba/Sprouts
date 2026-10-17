import {
  IdentifyPlantResponse,
  type PlantIdentificationInput,
  type PlantIdentificationResult,
} from "@workspace/api-zod";

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const CONFIDENCE_THRESHOLD = 0.7;

export class GeminiServiceError extends Error {
  constructor(
    message: string,
    readonly upstreamStatus: number,
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
    confidence === null ||
    confidence < CONFIDENCE_THRESHOLD ||
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
      typeof part === "object" && part !== null && "text" in part
        ? (part as { text?: unknown }).text
        : null,
    )
    .find((part): part is string => typeof part === "string");
  return text ?? null;
}

export async function identifyPlantWithGemini(
  input: PlantIdentificationInput,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<PlantIdentificationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    let response: Response;
    try {
      response = await fetcher(GEMINI_URL, {
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
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === "AbortError"
          ? "Plant identification timed out. Try again with a smaller photo."
          : "Gemini is temporarily unavailable. Please try again.",
      );
    }

    if (response.status === 429) {
      throw new GeminiServiceError(
        "Gemini is busy right now. Please try again in a moment.",
        response.status,
      );
    }
    if (!response.ok) {
      throw new GeminiServiceError(
        "Gemini could not analyze this photo. Please try again.",
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return uncertainResult();
    }

    const text = extractCandidateText(payload);
    if (!text) return uncertainResult();

    let modelResult: unknown;
    try {
      modelResult = JSON.parse(text);
    } catch {
      return uncertainResult();
    }

    return normalizeGeminiIdentification(modelResult);
  } finally {
    clearTimeout(timeout);
  }
}
