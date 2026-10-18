import { createHash } from "node:crypto";
import type { PlantIdentificationInput, PlantIdentificationResult } from "@workspace/api-zod";
import { GeminiServiceError } from "./plant-identification";

// Only short-lived results/hashes are retained, never image bytes or API keys.
export function createIdentificationCache() {
  const results = new Map<string, { result: PlantIdentificationResult; expiresAt: number }>();
  const pending = new Map<string, Promise<PlantIdentificationResult>>();
  return async (
    input: PlantIdentificationInput,
    scope: string,
    apiKey: string,
    analyze: () => Promise<PlantIdentificationResult>,
  ): Promise<PlantIdentificationResult> => {
    const hash = createHash("sha256")
      .update(JSON.stringify([scope, apiKey, input.mimeType, input.imageBase64]))
      .digest("hex");
    const cached = results.get(hash);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    if (pending.has(hash)) return pending.get(hash)!;
    if (pending.size >= 16) {
      throw new GeminiServiceError("Plant identification is busy. Please try again shortly.", 503);
    }
    const request = Promise.resolve().then(analyze).then((result) => {
      for (const [key, value] of results) {
        if (value.expiresAt <= Date.now()) results.delete(key);
      }
      results.delete(hash);
      if (results.size >= 64) results.delete(results.keys().next().value!);
      results.set(hash, {
        result,
        expiresAt: Date.now() + (result.status === "identified" ? 10 * 60_000 : 30_000),
      });
      return result;
    }).finally(() => pending.delete(hash));
    pending.set(hash, request);
    return request;
  };
}
