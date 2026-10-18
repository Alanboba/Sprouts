import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { identifyPlant } from "../lib/identify-plant";
import { IdentificationServiceError } from "../lib/identification-provider";
import { isPlantImage } from "../lib/plant-identification";
import { logger } from "../lib/logger";

// Opt-in, server-only live test. No public endpoint or production fault switch.
// --fallback simulates ONLY Gemini's rate-limit error; Pl@ntNet is called live.
async function main() {
  const { values } = parseArgs({ options: {
    photo: { type: "string" }, fallback: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  } });
  if (values.help || !values.photo) {
    logger.info("Usage: pnpm --filter @workspace/api-server run test:identify:live --photo /path/plant.jpg [--fallback]. This consumes real provider quota; --fallback simulates Gemini 429 and calls Pl@ntNet live.");
    return;
  }
  const gemini = process.env["GEMINI_API_KEY"]?.trim();
  const plantnet = process.env["PLANTNET_API_KEY"]?.trim();
  if (!gemini || (values.fallback && !plantnet)) {
    throw new IdentificationServiceError("Required server Secrets are missing. Primary needs GEMINI_API_KEY; fallback verification also needs PLANTNET_API_KEY.", 503, "configuration");
  }
  const bytes = await readFile(values.photo);
  const mimeType = (["image/jpeg", "image/png", "image/webp"] as const)
    .find((mime) => isPlantImage(bytes, mime));
  if (!mimeType || bytes.length < 32 || bytes.length > 1_500_000) {
    throw new IdentificationServiceError("Use a real JPEG, PNG or WebP photo between 32 bytes and 1.5 MB.", 400, "invalid_image");
  }
  const events: unknown[] = [];
  const started = Date.now();
  const result = await identifyPlant({ mimeType, imageBase64: bytes.toString("base64") },
    { gemini, plantnet }, {
      onEvent: (event) => events.push(event),
      fetcher: values.fallback ? async (url, init) =>
        String(url).startsWith("https://generativelanguage.googleapis.com/")
          ? new Response("{}", { status: 429, headers: { "Retry-After": "60" } })
          : fetch(url, init) : fetch,
    });
  logger.info({
    mode: values.fallback ? "simulated_Gemini_429_live_PlantNet" : "live_Gemini_first",
    uncached: true, elapsedMs: Date.now() - started, result, events,
  }, "Live identification check finished");
}

main().catch((error: unknown) => {
  // Never log a raw exception: network errors may include secret-bearing URLs.
  logger.error(error instanceof IdentificationServiceError
    ? { category: error.category, status: error.upstreamStatus, message: error.message }
    : { message: "Could not run live check. Check the photo path, arguments and server setup." },
  "Live identification check failed");
  process.exitCode = 1;
});
