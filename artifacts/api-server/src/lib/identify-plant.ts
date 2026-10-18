import type { PlantIdentificationInput, PlantIdentificationResult } from "@workspace/api-zod";
import { identifyPlantWithGemini, type GeminiAttemptEvent } from "./plant-identification";
import { identifyPlantWithPlantNet, type PlantNetEvent } from "./plantnet-identification";
import { IdentificationServiceError, withinProviderDeadline, type IdentificationFailure } from "./identification-provider";

export const IDENTIFICATION_TOTAL_MS = 45_000;
export const PRIMARY_WITH_BACKUP_MS = 30_000;
export const BACKUP_TIMEOUT_MS = 15_000;

export type IdentificationEvent =
  | ({ provider: "gemini" } & GeminiAttemptEvent)
  | ({ provider: "plantnet" } & PlantNetEvent)
  | { provider: "plantnet"; event: "fallback_started"; elapsedMs: number; category: IdentificationFailure };

const fallbackCategories = new Set<IdentificationFailure>([
  "quota", "rate_limit", "unavailable", "transport", "timeout", "invalid_response",
]);
const timedOut = () => new IdentificationServiceError(
  "Plant identification took too long. Please try again; your photo is still saved.", 504, "timeout");

export async function identifyPlant(
  input: PlantIdentificationInput,
  keys: { gemini: string; plantnet?: string },
  options: {
    fetcher?: typeof fetch;
    onEvent?: (event: IdentificationEvent) => void;
    totalTimeoutMs?: number;
    primaryTimeoutMs?: number;
    backupTimeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<PlantIdentificationResult> {
  const started = Date.now();
  const total = Math.min(IDENTIFICATION_TOTAL_MS, options.totalTimeoutMs ?? IDENTIFICATION_TOTAL_MS);
  const fetcher = options.fetcher ?? fetch;
  const backupKey = keys.plantnet?.trim();
  const backupSupported = ["image/jpeg", "image/png"].includes(input.mimeType);
  // Without a usable backup, preserve Gemini's former full 45-second allowance.
  const primaryBudget = Math.min(total, options.primaryTimeoutMs ??
    (backupKey && backupSupported ? PRIMARY_WITH_BACKUP_MS : IDENTIFICATION_TOTAL_MS));
  try {
    return await withinProviderDeadline(primaryBudget, (signal) => identifyPlantWithGemini(
      input, keys.gemini, fetcher, {
        totalTimeoutMs: primaryBudget, signal, sleep: options.sleep,
        onAttempt: (event) => options.onEvent?.({ provider: "gemini", ...event }),
      },
    ), timedOut);
  } catch (error) {
    if (!(error instanceof IdentificationServiceError) || !fallbackCategories.has(error.category)) throw error;
    if (!backupKey) {
      throw new IdentificationServiceError(
        `${error.message} The backup is not configured; the app owner needs to add PLANTNET_API_KEY in Secrets.`,
        error.upstreamStatus, error.category, false, error.retryAfterMs);
    }
    if (!backupSupported) {
      throw new IdentificationServiceError(
        "Gemini is unavailable and the backup supports only JPEG or PNG. Choose one of these photo formats and try again.",
        400, "unsupported_input");
    }
    const remaining = Math.min(options.backupTimeoutMs ?? BACKUP_TIMEOUT_MS, total - (Date.now() - started));
    if (remaining <= 0) throw timedOut();
    options.onEvent?.({ provider: "plantnet", event: "fallback_started",
      elapsedMs: Date.now() - started, category: error.category });
    try {
      return await identifyPlantWithPlantNet(input, backupKey, fetcher, {
        timeoutMs: remaining,
        onEvent: (event) => options.onEvent?.({ provider: "plantnet", ...event }),
      });
    } catch (backupError) {
      if (!(backupError instanceof IdentificationServiceError)) {
        throw new IdentificationServiceError("Both identification services are unavailable. Please try again; your photo is still saved.", 503, "unavailable");
      }
      throw new IdentificationServiceError(
        `Gemini couldn't identify the photo because its service was unavailable. ${backupError.message} Your photo is still saved.`,
        backupError.upstreamStatus, backupError.category, false, backupError.retryAfterMs);
    }
  }
}
