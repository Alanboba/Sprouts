import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlantIdentificationInput } from "@workspace/api-zod";
import { IdentificationServiceError, withinProviderDeadline } from "../lib/identification-provider";
import { isPlantImage } from "../lib/plant-identification";
import {
  identifyPlantWithPlantNet, PLANTNET_MIN_CONFIDENCE,
  type PlantNetEvent, type PlantNetPrediction,
} from "../lib/plantnet-identification";

export interface VerificationPhoto {
  id: string;
  expectedSpecies: string;
  acceptedSpecies: string[];
  sourcePage: string;
  imageUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
  modifications: string;
  labelEvidence: string;
  sha256: string;
}
export interface PhotoSet {
  version: string;
  labelBasis: string;
  photos: VerificationPhoto[];
}
export const MAX_VERIFICATION_CALLS = 3;
export const MAX_PHOTO_BYTES = 1_500_000;

export function verificationLimit(value: string | number = MAX_VERIFICATION_CALLS): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_VERIFICATION_CALLS) {
    throw new Error("max-calls must be an integer from 1 to 3.");
  }
  return limit;
}

export async function loadPhotoSet(): Promise<PhotoSet> {
  return JSON.parse(await readFile(new URL("./identification-photos.json", import.meta.url), "utf8"));
}

export function checkedPhoto(bytes: Buffer, photo: VerificationPhoto): PlantIdentificationInput {
  if (bytes.length < 32 || bytes.length > MAX_PHOTO_BYTES || !isPlantImage(bytes, "image/jpeg") ||
      createHash("sha256").update(bytes).digest("hex") !== photo.sha256) {
    throw new Error("Fixture size, JPEG signature or SHA-256 mismatch; no provider call made.");
  }
  return { mimeType: "image/jpeg", imageBase64: bytes.toString("base64") };
}

// Only public licensed URLs from the checked-in manifest; never follow redirects.
// A changed thumbnail fails its hash instead of silently changing the dataset.
export async function loadVerificationPhoto(
  photo: VerificationPhoto, directory: string, fetcher: typeof fetch = fetch,
): Promise<PlantIdentificationInput> {
  const path = join(directory, `${photo.id}.jpg`);
  try {
    return checkedPhoto(await readFile(path), photo);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const url = new URL(photo.imageUrl);
  if (url.origin !== "https://thumb.wikimedia.org" || url.search || url.hash) {
    throw new Error("Fixture source is not an approved public image URL.");
  }
  const bytes = await withinProviderDeadline(12_000, async (signal) => {
    const response = await fetcher(url, { signal, redirect: "error" });
    if (!response.ok || !response.body) throw new Error("Fixture download failed.");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_PHOTO_BYTES) throw new Error("Fixture download exceeds size limit.");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }, () => new IdentificationServiceError("Fixture download timed out.", 504, "timeout"));
  const input = checkedPhoto(bytes, photo);
  await mkdir(directory, { recursive: true });
  await writeFile(path, bytes);
  return input;
}

export type VerificationOutcome = "correct" | "incorrect" | "uncertain" | "failure" | "skipped";
export interface VerificationRow {
  photoId: string;
  expectedSpecies: string;
  imageSha256: string;
  outcome: VerificationOutcome;
  elapsedMs: number;
  providerElapsedMs: number | null;
  topSpecies: string | null;
  score: number | null;
  topMatchesLabel: boolean | null;
  returnedSpecies: string | null;
  normalizedStatus: string | null;
  httpStatus: number | null;
  failureCategory: string | null;
  failureStage: "fixture" | "provider" | null;
  skipReason: "call_limit" | "stopped_after_quota_or_configuration_failure" | null;
}

const sameSpecies = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

export function evaluatePrediction(
  photo: VerificationPhoto,
  status: string,
  returnedSpecies: string,
  prediction: PlantNetPrediction,
) {
  const matches = (species: string) => photo.acceptedSpecies.some((name) => sameSpecies(name, species));
  return {
    topMatchesLabel: prediction.scientificName ? matches(prediction.scientificName) : null,
    outcome: status === "identified"
      ? matches(returnedSpecies) ? "correct" as const : "incorrect" as const
      : "uncertain" as const,
  };
}

export async function verifyPhotoSet(
  set: PhotoSet,
  options: {
    execution: "live" | "synthetic_unit";
    maxCalls: number;
    apiKey: string;
    loadPhoto: (photo: VerificationPhoto) => Promise<PlantIdentificationInput>;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  },
) {
  const limit = verificationLimit(options.maxCalls);
  const started = Date.now();
  let providerCalls = 0;
  let stop = false;
  const rows: VerificationRow[] = [];
  for (const photo of set.photos) {
    const row: VerificationRow = {
      photoId: photo.id, expectedSpecies: photo.expectedSpecies, imageSha256: photo.sha256,
      outcome: "skipped", elapsedMs: 0, providerElapsedMs: null,
      topSpecies: null, score: null, topMatchesLabel: null, returnedSpecies: null,
      normalizedStatus: null, httpStatus: null, failureCategory: null, failureStage: null,
      skipReason: null,
    };
    rows.push(row);
    if (stop || providerCalls >= limit) {
      row.skipReason = stop ? "stopped_after_quota_or_configuration_failure" : "call_limit";
      continue;
    }
    const rowStarted = Date.now();
    let stage: "fixture" | "provider" = "provider";
    try {
      if (!options.apiKey.trim()) {
        throw new IdentificationServiceError("Missing backup configuration.", 503, "configuration");
      }
      stage = "fixture";
      const input = await options.loadPhoto(photo);
      stage = "provider";
      const result = await identifyPlantWithPlantNet(input, options.apiKey, options.fetcher ?? fetch, {
        timeoutMs: Math.min(15_000, options.timeoutMs ?? 15_000),
        onEvent: (event: PlantNetEvent) => {
          if (event.event === "started") providerCalls++;
          row.providerElapsedMs = event.elapsedMs;
          if (event.status !== undefined) row.httpStatus = event.status;
        },
        onPrediction: (prediction) => {
          row.topSpecies = prediction.scientificName;
          row.score = prediction.score;
        },
      });
      row.normalizedStatus = result.status;
      row.returnedSpecies = result.scientificName || null;
      row.score = result.confidence;
      Object.assign(row, evaluatePrediction(photo, result.status, result.scientificName, {
        scientificName: row.topSpecies, score: row.score,
      }));
    } catch (error) {
      row.outcome = "failure";
      row.failureStage = stage;
      row.failureCategory = stage === "fixture" ? "fixture"
        : error instanceof IdentificationServiceError ? error.category : "transport";
      // Only use typed safe categories/status, never error messages or raw data.
      if (stage === "provider" && error instanceof IdentificationServiceError) {
        stop = ["quota", "credentials", "configuration"].includes(error.category);
      }
    }
    row.elapsedMs = Date.now() - rowStarted;
  }
  const count = (outcome: VerificationOutcome) => rows.filter((row) => row.outcome === outcome).length;
  return {
    schemaVersion: 1,
    execution: options.execution,
    provider: "plantnet",
    primaryProviderCalled: false,
    simulatedPrimaryFailure: false,
    uncached: true,
    datasetVersion: set.version,
    threshold: PLANTNET_MIN_CONFIDENCE,
    maxCalls: limit,
    providerCalls,
    realProviderCalls: options.execution === "live" ? providerCalls : 0,
    elapsedMs: Date.now() - started,
    summary: {
      correct: count("correct"), incorrect: count("incorrect"), uncertain: count("uncertain"),
      failure: count("failure"), skipped: count("skipped"),
    },
    rows,
  };
}

// Apply to console AND persisted reports. No raw provider structures are logged.
export function safeVerificationJson(value: unknown, secrets: (string | undefined)[]): string {
  let json = JSON.stringify(value, null, 2);
  for (const secret of secrets) {
    if (!secret) continue;
    for (const variant of new Set([secret, secret.trim(), encodeURIComponent(secret)])) {
      const encoded = JSON.stringify(variant).slice(1, -1);
      if (encoded) json = json.split(encoded).join("[REDACTED]");
    }
  }
  return json;
}
