import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  checkedPhoto, loadPhotoSet, loadVerificationPhoto, safeVerificationJson,
  verificationLimit, verifyPhotoSet, type VerificationPhoto,
} from "./identification-verification";

// All provider responses and image bytes in this file are SYNTHETIC UNIT fixtures.
// They are never part of the real-photo dataset or live evidence.
const bytes = Buffer.from([0xff, 0xd8, 0xff, ...new Array(40).fill(1)]);
const input = { mimeType: "image/jpeg" as const, imageBase64: bytes.toString("base64") };
const fakePhoto: VerificationPhoto = {
  id: "unit-only", expectedSpecies: "Aloe vera", acceptedSpecies: ["Aloe vera", "Aloe barbadensis"],
  imageUrl: "https://thumb.wikimedia.org/unit-only.jpg",
  sourcePage: "https://commons.wikimedia.org/unit-only",
  creator: "Unit fixture, not a real photo", license: "synthetic", licenseUrl: "https://example.invalid",
  modifications: "synthetic", labelEvidence: "synthetic", sha256: createHash("sha256").update(bytes).digest("hex"),
};
const set = { version: "synthetic-unit-only", labelBasis: "synthetic", photos: [1, 2, 3].map((n) =>
  ({ ...fakePhoto, id: `unit-${n}` })) };
const response = (score: number, species = "Aloe vera") => new Response(JSON.stringify({
  query: { private: "never log this" },
  results: [{ score, species: { scientificNameWithoutAuthor: species, commonNames: ["Aloe"] } }],
}));
const options = {
  execution: "synthetic_unit" as const, maxCalls: 3, apiKey: "unit-only-private-key",
  loadPhoto: async () => input,
};

test("report separates correct, confidently incorrect and uncertain, including the raw low-score guess", async () => {
  const answers = [response(0.92, "Aloe barbadensis"), response(0.8, "Monstera deliciosa"), response(0.69)];
  const report = await verifyPhotoSet(set, { ...options, fetcher: async () => answers.shift()! });
  assert.equal(report.execution, "synthetic_unit");
  assert.equal(report.realProviderCalls, 0);
  assert.equal(report.providerCalls, 3);
  assert.equal(report.threshold, 0.7);
  assert.deepEqual(report.summary, { correct: 1, incorrect: 1, uncertain: 1, failure: 0, skipped: 0 });
  assert.deepEqual(report.rows.map((r) => r.topMatchesLabel), [true, false, true]);
  assert.equal(report.rows[2].score, 0.69);
  assert.equal(report.rows[2].topSpecies, "Aloe vera");
  assert.equal(report.rows[2].returnedSpecies, null);
  assert.equal(report.rows.every((r) => r.httpStatus === 200 && r.elapsedMs >= 0 && r.providerElapsedMs !== null), true);
  assert.equal(JSON.stringify(report).includes("never log this"), false);
  assert.equal(JSON.stringify(report).includes(input.imageBase64), false);
  assert.equal(JSON.stringify(report).includes(options.apiKey), false);
});

test("low-scoring wrong guesses and 404 rejection remain uncertain, not confident mistakes or successes", async () => {
  const answers = [response(0.3, "Monstera deliciosa"), new Response("private", { status: 404 }), response(0.7)];
  const report = await verifyPhotoSet(set, { ...options, fetcher: async () => answers.shift()! });
  assert.equal(report.summary.uncertain, 2);
  assert.equal(report.summary.correct, 1);
  assert.equal(report.rows[0].topMatchesLabel, false);
  assert.equal(report.rows[1].score, null);
  assert.equal(report.rows[1].topMatchesLabel, null);
  assert.equal(report.rows[1].httpStatus, 404);
});

test("quota and credentials/configuration failures stop remaining calls without retries", async () => {
  for (const [status, category] of [[429, "quota"], [401, "credentials"], [403, "credentials"], [405, "configuration"]] as const) {
    let calls = 0;
    const report = await verifyPhotoSet(set, { ...options, fetcher: async () => {
      calls++;
      return new Response(`https://private.invalid?api-key=${options.apiKey}`, { status });
    } });
    assert.equal(calls, 1);
    assert.equal(report.rows[0].failureCategory, category);
    assert.equal(report.rows[0].failureStage, "provider");
    assert.equal(report.rows[0].httpStatus, status);
    assert.equal(report.summary.failure, 1);
    assert.equal(report.summary.skipped, 2);
    assert.equal(report.rows[1].skipReason, "stopped_after_quota_or_configuration_failure");
    assert.equal(JSON.stringify(report).includes(options.apiKey), false);
  }
});

test("missing configuration records a zero-call failure before loading photos", async () => {
  const report = await verifyPhotoSet(set, { ...options, apiKey: "", loadPhoto: async () => {
    assert.fail("Missing configuration must not even download photos");
  } });
  assert.equal(report.providerCalls, 0);
  assert.equal(report.rows[0].failureCategory, "configuration");
  assert.equal(report.rows[0].httpStatus, null); // local setup failure, not an HTTP response
  assert.equal(report.rows[1].outcome, "skipped");
});

test("call limit is hard-bounded, counts failures and never retries", async () => {
  for (const invalid of ["", "0", "-1", "4", "1.5", "garbage", "Infinity"]) {
    assert.throws(() => verificationLimit(invalid));
  }
  let calls = 0;
  const report = await verifyPhotoSet(set, { ...options, maxCalls: 1, fetcher: async () => {
    calls++;
    throw new Error(`private url ${options.apiKey}`);
  } });
  assert.equal(calls, 1);
  assert.equal(report.rows[0].failureCategory, "transport");
  assert.equal(report.rows[1].skipReason, "call_limit");
  assert.equal(report.summary.skipped, 2);
  assert.equal(JSON.stringify(report).includes(options.apiKey), false);
});

test("stalled responses settle within the provider deadline, still count against the budget", async () => {
  const report = await verifyPhotoSet(set, { ...options, maxCalls: 1, timeoutMs: 5,
    fetcher: async () => new Promise<Response>(() => {}),
  });
  assert.equal(report.providerCalls, 1);
  assert.equal(report.rows[0].failureCategory, "timeout");
  assert.equal(report.rows[0].httpStatus, null); // no headers received
  assert.equal(report.rows[1].skipReason, "call_limit");
});

test("invalid or changed photo bytes are fixture failures, not provider failures", async () => {
  assert.throws(() => checkedPhoto(Buffer.from("not a photo"), fakePhoto));
  assert.throws(() => checkedPhoto(bytes, { ...fakePhoto, sha256: "0".repeat(64) }));
  const report = await verifyPhotoSet(set, { ...options, loadPhoto: async () => {
    throw new Error("changed fixture with sensitive path");
  }, fetcher: async () => { assert.fail("No image, no provider call"); } });
  assert.equal(report.providerCalls, 0);
  assert.equal(report.rows.every((r) => r.failureCategory === "fixture" && r.failureStage === "fixture"), true);
  assert.equal(JSON.stringify(report).includes("sensitive"), false);
});

test("public downloads are pinned, cached, size-bounded and never silently replace corrupt local images", async () => {
  const directory = await mkdtemp(join(tmpdir(), "plant-verify-"));
  try {
    let downloads = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      downloads++;
      assert.equal(init?.redirect, "error");
      assert.ok(init?.signal);
      return new Response(bytes);
    };
    assert.deepEqual(await loadVerificationPhoto(fakePhoto, directory, fetcher), input);
    await loadVerificationPhoto(fakePhoto, directory, fetcher);
    assert.equal(downloads, 1);
    await writeFile(join(directory, `${fakePhoto.id}.jpg`), "corrupt");
    await assert.rejects(loadVerificationPhoto(fakePhoto, directory, fetcher), /mismatch/);
    assert.equal(downloads, 1);
    await assert.rejects(loadVerificationPhoto({ ...fakePhoto, id: "oversize" }, directory, async () =>
      new Response(Buffer.alloc(1_500_001))), /size limit/);
    await assert.rejects(loadVerificationPhoto({ ...fakePhoto, id: "hash" }, directory, async () =>
      new Response(Buffer.alloc(40))), /mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("live dataset has species evidence, public licensing and hashes, not synthetic unit images", async () => {
  const photos = await loadPhotoSet();
  assert.equal(photos.photos.length, 3);
  assert.equal(new Set(photos.photos.map((p) => p.id)).size, 3);
  for (const p of photos.photos) {
    assert.match(p.sourcePage, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(p.licenseUrl, /^https:\/\/creativecommons\.org\//);
    assert.ok(p.creator && p.license && p.labelEvidence && p.modifications);
    assert.ok(p.acceptedSpecies.includes(p.expectedSpecies));
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
    assert.notEqual(p.sha256, fakePhoto.sha256);
  }
});

test("logs and persisted JSON redact secret echoes including JSON escaping and URL encoding", () => {
  const secret = 'private"key+value';
  const json = safeVerificationJson({ topSpecies: secret, other: encodeURIComponent(secret) }, [secret]);
  assert.deepEqual(JSON.parse(json), { topSpecies: "[REDACTED]", other: "[REDACTED]" });
});

test("CLI dry run requires no credentials; invalid budgets fail before real calls", () => {
  const script = fileURLToPath(new URL("./check-identification.ts", import.meta.url));
  const run = (args: string[]) => execFileSync(process.execPath, ["--import", "tsx", script, ...args], {
    encoding: "utf8",
    env: { ...process.env, GEMINI_API_KEY: "", PLANTNET_API_KEY: "" },
  });
  const dry = JSON.parse(run(["--suite"]));
  assert.equal(dry.execution, "dry_run");
  assert.equal(dry.realProviderCalls, 0);
  assert.equal(dry.photos.length, 3);
  assert.throws(() => run(["--suite", "--live", "--max-calls", "4"]));
  assert.throws(() => run(["--suite", "--fallback"]));
});
