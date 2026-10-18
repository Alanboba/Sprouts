import { IdentifyPlantResponse, type PlantIdentificationInput, type PlantIdentificationResult } from "@workspace/api-zod";
import { IdentificationServiceError, withinProviderDeadline, type IdentificationFailure } from "./identification-provider";

export interface PlantNetEvent {
  event: "started" | "headers_received" | "body_received" | "completed" | "failed";
  stage: "waiting_for_response" | "reading_response" | "parsing_response";
  elapsedMs: number;
  status?: number;
  category?: IdentificationFailure;
}

const clean = (value: unknown, max: number) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
const uncertain = (confidence: number | null = null): PlantIdentificationResult => ({
  status: "uncertain", commonName: "", scientificName: "", confidence,
  message: "The backup couldn't identify this confidently. Try a clearer photo of one plant, with its leaves and stems in focus.",
});
const invalidResponse = () => new IdentificationServiceError(
  "Pl@ntNet returned an unreadable identification. Please try another photo or try again.", 502, "invalid_response");
const timeoutError = () => new IdentificationServiceError(
  "The backup took too long to identify this photo. Please try again; your photo is still saved.", 504, "timeout");

export function normalizePlantNetIdentification(payload: unknown): PlantIdentificationResult {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { results?: unknown }).results)) {
    throw invalidResponse();
  }
  const results = (payload as { results: unknown[] }).results;
  if (!results.length) return uncertain();
  const top = results[0];
  if (!top || typeof top !== "object") throw invalidResponse();
  const { score, species } = top as { score?: unknown; species?: unknown };
  const confidence = typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1 ? score : null;
  if (confidence === null || confidence < 0.7) return uncertain(confidence);
  if (!species || typeof species !== "object") return uncertain(confidence);
  const names = species as { scientificNameWithoutAuthor?: unknown; scientificName?: unknown; commonNames?: unknown };
  const scientificName = clean(names.scientificNameWithoutAuthor, 120) || clean(names.scientificName, 120);
  if (!scientificName) return uncertain(confidence);
  const commonName = Array.isArray(names.commonNames)
    ? names.commonNames.map((name) => clean(name, 100)).find(Boolean) : undefined;
  // No generated description or guessed common name is introduced here.
  return IdentifyPlantResponse.parse({
    status: "identified", commonName: commonName || scientificName, scientificName, confidence,
    message: commonName
      ? "Likely match from Pl@ntNet backup. Confirm the name or edit it before saving."
      : "Pl@ntNet supplied only a scientific name, shown in both fields. Confirm it or enter a common name before saving.",
  });
}

export async function identifyPlantWithPlantNet(
  input: PlantIdentificationInput,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  options: { timeoutMs?: number; onEvent?: (event: PlantNetEvent) => void } = {},
): Promise<PlantIdentificationResult> {
  if (!apiKey.trim()) throw new IdentificationServiceError("The Pl@ntNet backup is not configured. The app owner needs to add PLANTNET_API_KEY in Secrets.", 503, "configuration");
  const photos = [input, ...(input.additionalPhotos ?? [])];
  if (!photos.every((photo) => ["image/jpeg", "image/png"].includes(photo.mimeType))) {
    throw new IdentificationServiceError("The backup supports JPEG or PNG photos. Choose one of these formats and try again.", 400, "unsupported_input");
  }
  const started = Date.now();
  let stage: PlantNetEvent["stage"] = "waiting_for_response";
  let status: number | undefined;
  const emit = (event: PlantNetEvent["event"], category?: IdentificationFailure) =>
    options.onEvent?.({ event, stage, elapsedMs: Date.now() - started,
      ...(status !== undefined ? { status } : {}), ...(category ? { category } : {}) });
  try {
    return await withinProviderDeadline(options.timeoutMs ?? 15_000, async (signal) => {
      const url = new URL("https://my-api.plantnet.org/v2/identify/all");
      url.searchParams.set("api-key", apiKey);
      url.searchParams.set("lang", "en");
      url.searchParams.set("nb-results", "2");
      const form = new FormData();
      for (const [index, photo] of photos.entries()) {
        const bytes = Buffer.from(photo.imageBase64, "base64");
        form.append("images", new Blob([bytes], { type: photo.mimeType }),
          `plant-${index + 1}.${photo.mimeType === "image/png" ? "png" : "jpg"}`);
      }
      // Default auto organs and rejection remain enabled. Let fetch set the
      // multipart boundary; never log this URL, form, response query or error.
      emit("started");
      const response = await fetcher(url, { method: "POST", body: form, signal });
      status = response.status;
      emit("headers_received");
      stage = "reading_response";
      if (!response.ok) {
        await response.body?.cancel();
        // Official FAQ: 404 Species not found is rejection/no plant prediction.
        // Do not expose or persist the raw provider response.
        if (response.status === 404) {
          emit("completed");
          return { ...uncertain(), message: "The backup found no matching plant. Try a clearer photo of one plant." };
        }
        const category: IdentificationFailure = response.status === 429 ? "quota"
          : [401, 403].includes(response.status) ? "credentials"
            : [400, 413, 415, 422].includes(response.status) ? "invalid_image"
              : response.status >= 500 ? "unavailable" : "configuration";
        const message = category === "quota" ? "Pl@ntNet's quota or rate limit was reached. Try again later."
          : category === "credentials" ? "Pl@ntNet rejected the backup credentials. The app owner needs to check PLANTNET_API_KEY in Secrets."
            : category === "invalid_image" ? "Pl@ntNet could not read this image. Choose another JPEG or PNG plant photo."
              : "Pl@ntNet is temporarily unavailable. Please try again shortly.";
        throw new IdentificationServiceError(message, response.status, category);
      }
      const payload: unknown = await response.json();
      emit("body_received");
      stage = "parsing_response";
      const result = normalizePlantNetIdentification(payload);
      emit("completed");
      return result;
    }, timeoutError);
  } catch (error) {
    const safeError = error instanceof IdentificationServiceError ? error
      : error instanceof SyntaxError ? invalidResponse()
        : new IdentificationServiceError("Could not connect to the Pl@ntNet backup. Please try again shortly.", 503, "transport");
    emit("failed", safeError.category);
    throw safeError;
  }
}
