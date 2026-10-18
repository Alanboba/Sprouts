import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { identifyPlant } from "../lib/identify-plant";
import { IdentificationServiceError } from "../lib/identification-provider";
import { isPlantImage } from "../lib/plant-identification";
import {
  loadPhotoSet, loadVerificationPhoto, safeVerificationJson,
  verificationLimit, verifyPhotoSet,
} from "./identification-verification";

const defaultDirectory = fileURLToPath(new URL("../../../../generated-artifacts/identification-photos", import.meta.url));
const defaultReport = fileURLToPath(new URL("../../../../generated-artifacts/plantnet-verification.json", import.meta.url));
const secrets = () => [process.env["GEMINI_API_KEY"], process.env["PLANTNET_API_KEY"]];
const print = (value: unknown) => console.log(safeVerificationJson(value, secrets()));

// Explicit local CLI only: no endpoint, app setting, cache, or production fault switch.
async function main() {
  const { values } = parseArgs({ options: {
    photo: { type: "string" }, fallback: { type: "boolean", default: false },
    suite: { type: "boolean", default: false }, live: { type: "boolean", default: false },
    prepare: { type: "boolean", default: false }, "max-calls": { type: "string" },
    "photo-dir": { type: "string" }, report: { type: "string" },
    help: { type: "boolean", default: false },
  } });
  if (values.help || (!values.photo && !values.suite)) {
    console.log(`Usage:
  test:identify:live --suite                         Dry run: zero network calls
  test:identify:live --suite --prepare               Download/verify licensed photos only
  test:identify:live --suite --live [--max-calls 1..3] [--report path] [--photo-dir path]
  test:identify:live --photo /path/plant.jpg [--fallback]
Live calls consume provider quota. Suite calls real Pl@ntNet directly, without Gemini.
Single-photo --fallback simulates Gemini 429; its Pl@ntNet request is real.
No retries in the suite. Stops after quota/credentials/configuration failures.`);
    return;
  }
  if (values.suite) {
    if (values.photo || values.fallback || (values.live && values.prepare)) {
      throw new Error("Suite options cannot be combined with single-photo options or both live and prepare.");
    }
    const maxCalls = verificationLimit(values["max-calls"]);
    const set = await loadPhotoSet();
    const directory = values["photo-dir"] ?? defaultDirectory;
    if (!values.live) {
      if (values.prepare) {
        for (const photo of set.photos) await loadVerificationPhoto(photo, directory);
      }
      print({
        execution: values.prepare ? "prepare_only" : "dry_run",
        realProviderCalls: 0, datasetVersion: set.version, maxCalls,
        photos: set.photos.map(({ id, expectedSpecies, creator, license, sourcePage, sha256 }) =>
          ({ id, expectedSpecies, creator, license, sourcePage, sha256 })),
        note: "Run --suite --live to consume real Pl@ntNet quota. Uncertainty is not a correct identification.",
      });
      return;
    }
    const report = {
      recordedAt: new Date().toISOString(),
      ...await verifyPhotoSet(set, {
        execution: "live", maxCalls, apiKey: process.env["PLANTNET_API_KEY"]?.trim() ?? "",
        loadPhoto: (photo) => loadVerificationPhoto(photo, directory),
      }),
    };
    const output = safeVerificationJson(report, secrets());
    console.log(output);
    const reportPath = values.report ?? defaultReport;
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${output}\n`);
    // Uncertain is an observation, not a test failure or proof of accuracy.
    // Confident mistakes and operational failures must fail visibly.
    if (report.summary.incorrect || report.summary.failure) process.exitCode = 1;
    return;
  }
  if (values.live || values.prepare || values["max-calls"] || values["photo-dir"] || values.report) {
    throw new Error("Suite options require --suite.");
  }
  const gemini = process.env["GEMINI_API_KEY"]?.trim();
  const plantnet = process.env["PLANTNET_API_KEY"]?.trim();
  if (!gemini || (values.fallback && !plantnet)) {
    throw new IdentificationServiceError("Required server Secrets are missing.", 503, "configuration");
  }
  const bytes = await readFile(values.photo!);
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
  print({
    mode: values.fallback ? "simulated_Gemini_429_live_PlantNet" : "live_Gemini_first",
    uncached: true, elapsedMs: Date.now() - started, result, events,
  });
}

main().catch((error: unknown) => {
  // Never print raw exceptions, paths, argv or provider URLs.
  print(error instanceof IdentificationServiceError
    ? { execution: "check_failed", category: error.category, status: error.upstreamStatus }
    : { execution: "check_failed", category: "setup", message: "Check arguments, photo hashes/paths and server setup. Use --help for usage." });
  process.exitCode = 1;
});
