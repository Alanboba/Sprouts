import assert from "node:assert/strict";
import test from "node:test";
import { identifyPlant, type IdentificationEvent } from "./identify-plant";
import { IdentificationServiceError } from "./identification-provider";
import {
  identifyPlantWithPlantNet, normalizePlantNetIdentification, plantNetTopPrediction, PLANTNET_MIN_CONFIDENCE,
} from "./plantnet-identification";
import { createIdentificationCache } from "./plant-identification-cache";
import { IdentifyPlantBody } from "@workspace/api-zod";

// Synthetic fixtures and provider responses are used only in unit tests.
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, ...Array.from({ length: 40 }, (_, i) => i)]);
const photo = { mimeType: "image/jpeg" as const, imageBase64: imageBytes.toString("base64") };
const keys = { gemini: "unit-gemini-secret", plantnet: "unit-plantnet-secret" };
const geminiMatch = {
  status: "identified", commonName: "Pothos", scientificName: "Epipremnum aureum",
  confidence: 0.94, description: "Heart-shaped green leaves on trailing stems.",
};
const pnMatch = { results: [{
  score: 0.91, species: { scientificNameWithoutAuthor: "Epipremnum aureum", commonNames: ["Pothos"] },
}] };
const geminiResponse = (result: unknown = geminiMatch) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
}));
const plantnetResponse = () => new Response(JSON.stringify(pnMatch));
const noDelay = { sleep: async () => {} };
const isBackup = (url: Parameters<typeof fetch>[0]) => String(url).startsWith("https://my-api.plantnet.org/");

const closeUpBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(40).fill(1)]);
const closeUp = { mimeType: "image/png" as const, imageBase64: closeUpBytes.toString("base64") };
const twoPhotos = { ...photo, additionalPhotos: [closeUp] };

test("contract keeps legacy requests and bounds the optional close-up", () => {
  assert.equal(IdentifyPlantBody.safeParse(photo).success, true);
  assert.equal(IdentifyPlantBody.safeParse(twoPhotos).success, true);
  for (const additionalPhotos of [
    [closeUp, closeUp], [{}], [{ ...closeUp, mimeType: "image/gif" }],
    [{ ...closeUp, imageBase64: "x".repeat(2_000_001) }],
  ]) {
    assert.equal(IdentifyPlantBody.safeParse({ ...photo, additionalPhotos }).success, false);
  }
});

test("Gemini sees both actual images, their MIME types and conservative same-plant instructions", async () => {
  let calls = 0;
  const result = await identifyPlant(twoPhotos, keys, { fetcher: async (url, init) => {
    calls++;
    assert.equal(isBackup(url), false);
    const parts = JSON.parse(init?.body as string).contents[0].parts;
    assert.deepEqual(parts.slice(0, 2), [photo, closeUp].map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.imageBase64 },
    })));
    assert.match(parts[2].text, /different plants or conflicting evidence/);
    assert.match(parts[2].text, /at least 70%/);
    return geminiResponse({ ...geminiMatch, confidence: 0.69 });
  } });
  assert.equal(calls, 1);
  assert.equal(result.status, "uncertain");
  assert.equal(result.commonName, "");
  assert.equal(result.description, undefined);
});

test("a two-photo service failure sends both binary images to Pl@ntNet without invented descriptions", async () => {
  let backups = 0;
  const result = await identifyPlant(twoPhotos, keys, { ...noDelay, fetcher: async (url, init) => {
    if (!isBackup(url)) return new Response("{}", { status: 503 });
    backups++;
    assert.ok(init?.body instanceof FormData);
    const files = init.body.getAll("images") as Blob[];
    assert.equal(files.length, 2);
    for (const [index, image] of [photo, closeUp].entries()) {
      assert.equal(files[index].type, image.mimeType);
      assert.deepEqual(Buffer.from(await files[index].arrayBuffer()), Buffer.from(image.imageBase64, "base64"));
    }
    assert.equal(new Headers(init.headers).has("Content-Type"), false);
    return plantnetResponse();
  } });
  assert.equal(backups, 1);
  assert.equal(result.status, "identified");
  assert.equal(result.description, undefined);
});

test("two-photo Pl@ntNet matches still require 70 percent confidence", async () => {
  const result = await identifyPlantWithPlantNet(twoPhotos, keys.plantnet, async () =>
    new Response(JSON.stringify({ results: [{ ...pnMatch.results[0], score: 0.69 }] })));
  assert.equal(result.status, "uncertain");
  assert.equal(result.commonName, "");
  assert.equal(result.description, undefined);
});

test("an unsupported second image is never dropped or relabeled for backup", async () => {
  const input = { ...photo, additionalPhotos: [{ ...closeUp, mimeType: "image/webp" as const }] };
  let backups = 0;
  await assert.rejects(identifyPlant(input, keys, { ...noDelay, fetcher: async (url) => {
    if (isBackup(url)) backups++;
    return new Response("{}", { status: 503 });
  } }), /backup supports only JPEG or PNG/);
  await assert.rejects(identifyPlantWithPlantNet(input, keys.plantnet, async () => {
    backups++;
    return plantnetResponse();
  }), /supports JPEG or PNG/);
  assert.equal(backups, 0);
});

test("adding, replacing and removing a close-up uses the correct cache identity", async () => {
  const cache = createIdentificationCache();
  let calls = 0;
  const analyze = async () => { calls++; return normalizePlantNetIdentification(pnMatch); };
  await cache(photo, "client", keys, analyze);
  await cache(twoPhotos, "client", keys, analyze);
  await cache(twoPhotos, "client", keys, analyze);
  assert.equal(calls, 2);
  await cache({ ...photo, additionalPhotos: [photo] }, "client", keys, analyze);
  assert.equal(calls, 3);
  await cache(photo, "client", keys, analyze);
  assert.equal(calls, 3);
});

test("Gemini stays first and a successful description never calls the backup", async () => {
  let calls = 0;
  const result = await identifyPlant(photo, keys, { fetcher: async (url) => {
    calls++;
    assert.equal(isBackup(url), false);
    return geminiResponse();
  } });
  assert.equal(calls, 1);
  assert.equal(result.description, geminiMatch.description);
  assert.equal(result.confidence, 0.94);
});

test("uncertain and not-plant Gemini responses never trigger fallback or keep stale descriptions", async () => {
  for (const status of ["uncertain", "not_plant"]) {
    let calls = 0;
    const result = await identifyPlant(photo, keys, { fetcher: async (url) => {
      calls++;
      assert.equal(isBackup(url), false);
      return geminiResponse({ ...geminiMatch, status });
    } });
    assert.equal(calls, 1);
    assert.equal(result.status, status);
    assert.equal(result.description, undefined);
  }
});

test("eligible Gemini HTTP service failures trigger exactly one backup after bounded retries", async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    const providers: string[] = [];
    const events: IdentificationEvent[] = [];
    const result = await identifyPlant(photo, keys, { ...noDelay,
      onEvent: (event) => events.push(event),
      fetcher: async (url) => {
        providers.push(isBackup(url) ? "plantnet" : "gemini");
        return isBackup(url) ? plantnetResponse() : new Response("{}", { status });
      },
    });
    assert.deepEqual(providers, ["gemini", "gemini", "plantnet"]);
    assert.equal(result.commonName, "Pothos");
    assert.equal(result.description, undefined);
    assert.equal(events.filter((event) => event.event === "fallback_started").length, 1);
  }
});

test("exhausted quota and a long Retry-After skip Gemini retry but still use the backup", async () => {
  for (const exhausted of [true, false]) {
    const providers: string[] = [];
    const result = await identifyPlant(photo, keys, { ...noDelay, fetcher: async (url) => {
      providers.push(isBackup(url) ? "plantnet" : "gemini");
      if (isBackup(url)) return plantnetResponse();
      return new Response(JSON.stringify({ error: {
        details: exhausted ? [{ violations: [{ quotaId: "RequestsPerDay", quotaValue: "0" }] }] : [],
      } }), { status: 429, headers: { "Retry-After": "60" } });
    } });
    assert.equal(result.status, "identified");
    assert.deepEqual(providers, ["gemini", "plantnet"]);
  }
});

test("Gemini credentials, model/configuration and invalid-image failures do not use the backup", async () => {
  for (const entry of [
    { status: 400, message: "API key not valid", category: "credentials" },
    { status: 400, message: "Could not decode image", category: "invalid_image" },
    { status: 400, message: "Invalid response schema", category: "configuration" },
    { status: 401, message: "", category: "credentials" },
    { status: 403, message: "", category: "credentials" },
    { status: 404, message: "", category: "configuration" },
    { status: 415, message: "", category: "unsupported_input" },
  ]) {
    let calls = 0;
    await assert.rejects(identifyPlant(photo, keys, { fetcher: async (url) => {
      calls++;
      assert.equal(isBackup(url), false);
      return new Response(JSON.stringify({ error: { message: entry.message } }), { status: entry.status });
    } }), (error: unknown) => error instanceof IdentificationServiceError && error.category === entry.category);
    assert.equal(calls, 1);
  }
});

test("malformed Gemini provider responses and transport errors can use a genuine backup adapter", async () => {
  for (const badResponse of ["transport", "not-json", '{"candidates":[]}', JSON.stringify({
    candidates: [{ content: { parts: [{ text: "{truncated" }] } }],
  })]) {
    let backups = 0;
    const result = await identifyPlant(photo, keys, { ...noDelay, fetcher: async (url) => {
      if (isBackup(url)) { backups++; return plantnetResponse(); }
      if (badResponse === "transport") throw new TypeError("private upstream URL");
      return new Response(badResponse);
    } });
    assert.equal(result.status, "identified");
    assert.equal(backups, 1);
  }
});

test("Pl@ntNet receives the actual image bytes as multipart binary, with the official URL parameters", async () => {
  const result = await identifyPlantWithPlantNet(photo, keys.plantnet, async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://my-api.plantnet.org/v2/identify/all");
    assert.equal(url.searchParams.get("api-key"), keys.plantnet);
    assert.equal(url.searchParams.get("lang"), "en");
    assert.equal(url.searchParams.get("no-reject"), null);
    assert.equal(new Headers(init?.headers).has("Content-Type"), false);
    assert.ok(init?.body instanceof FormData);
    const file = init.body.get("images");
    assert.ok(file instanceof Blob);
    assert.equal(file.type, "image/jpeg");
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), imageBytes);
    const encoded = new Request("https://example.invalid", { method: "POST", body: init.body });
    assert.match(encoded.headers.get("Content-Type")!, /^multipart\/form-data; boundary=/);
    return plantnetResponse();
  });
  assert.equal(result.scientificName, "Epipremnum aureum");
  assert.equal(result.description, undefined);
});

test("Pl@ntNet accepts PNG without relabeling its binary image", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(40).fill(0)]);
  await identifyPlantWithPlantNet({ mimeType: "image/png", imageBase64: png.toString("base64") }, keys.plantnet,
    async (_url, init) => {
      const file = (init?.body as FormData).get("images") as Blob;
      assert.equal(file.type, "image/png");
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
      return plantnetResponse();
    });
});

test("backup normalization suppresses low/invalid scores, missing species and invented descriptions", () => {
  for (const score of [0.3, -1, 2, NaN, "0.9", undefined]) {
    const result = normalizePlantNetIdentification({ results: [{ ...pnMatch.results[0], score }] });
    assert.equal(result.status, "uncertain");
    assert.equal(result.commonName, "");
    assert.equal(result.description, undefined);
  }
  assert.equal(normalizePlantNetIdentification({ results: [] }).status, "uncertain");
  assert.equal(normalizePlantNetIdentification({ results: [{ score: 0.9 }] }).status, "uncertain");
  assert.equal(normalizePlantNetIdentification({ results: [{ score: 0.9, species: { commonNames: ["Unknown"] } }] }).status, "uncertain");
  const result = normalizePlantNetIdentification({ ...pnMatch, description: "Invented description" });
  assert.equal(result.description, undefined);
});

test("accuracy diagnostics preserve genuine scores without accepting a below-threshold guess", async () => {
  assert.equal(PLANTNET_MIN_CONFIDENCE, 0.7);
  for (const score of [0, 0.699999, 0.7, 1]) {
    const payload = { results: [{ ...pnMatch.results[0], score }], query: {
      "api-key": keys.plantnet, images: [photo.imageBase64],
    } };
    let prediction: unknown;
    const result = await identifyPlantWithPlantNet(photo, keys.plantnet,
      async () => new Response(JSON.stringify(payload)), {
        onPrediction: (value) => { prediction = value; },
      });
    assert.deepEqual(prediction, { scientificName: "Epipremnum aureum", score });
    assert.equal(result.confidence, score);
    assert.equal(result.status, score >= 0.7 ? "identified" : "uncertain");
    if (score < 0.7) assert.equal(result.scientificName, "");
    assert.equal(JSON.stringify(prediction).includes(keys.plantnet), false);
    assert.equal(JSON.stringify(prediction).includes(photo.imageBase64), false);
  }
  assert.deepEqual(plantNetTopPrediction({ results: [] }), { scientificName: null, score: null });
  assert.deepEqual(plantNetTopPrediction({ results: [{ score: "0.99" }] }), { scientificName: null, score: null });
});

test("a missing common name honestly uses the supplied scientific name and asks for review", () => {
  const result = normalizePlantNetIdentification({ results: [{
    score: 0.9, species: { scientificName: "Epipremnum aureum", commonNames: [] },
  }] });
  assert.equal(result.commonName, "Epipremnum aureum");
  assert.match(result.message, /only a scientific name/);
  assert.equal(result.description, undefined);
});

test("malformed backup payloads fail explicitly rather than inventing an identification", async () => {
  for (const payload of [null, {}, { results: {} }, { results: [null] }]) {
    assert.throws(() => normalizePlantNetIdentification(payload), IdentificationServiceError);
  }
  await assert.rejects(identifyPlantWithPlantNet(photo, keys.plantnet, async () => new Response("{broken")),
    (error: unknown) => error instanceof IdentificationServiceError && error.category === "invalid_response");
});

test("official backup 404 rejection produces a request for another photo, not a species guess", async () => {
  const result = await identifyPlantWithPlantNet(photo, keys.plantnet, async () =>
    new Response(JSON.stringify({ error: "Species not found" }), { status: 404 }));
  assert.equal(result.status, "uncertain");
  assert.equal(result.commonName, "");
  assert.equal(result.confidence, null);
});

test("backup HTTP and network errors never expose its API key, URL, raw body, or raw exception", async () => {
  for (const status of [400, 401, 403, 413, 415, 422, 429, 500, 503]) {
    const events: unknown[] = [];
    await assert.rejects(identifyPlantWithPlantNet(photo, keys.plantnet, async () =>
      new Response(`private body ${keys.plantnet}`, { status }), { onEvent: (event) => events.push(event) }),
    (error: unknown) => {
      assert.ok(error instanceof IdentificationServiceError);
      assert.equal(error.message.includes(keys.plantnet), false);
      assert.equal(error.message.includes("private"), false);
      return true;
    });
    assert.equal(JSON.stringify(events).includes(keys.plantnet), false);
  }
  await assert.rejects(identifyPlantWithPlantNet(photo, keys.plantnet, async () => {
    throw new Error(`https://my-api.plantnet.org/?api-key=${keys.plantnet}`);
  }), (error: unknown) => error instanceof IdentificationServiceError &&
    !error.message.includes(keys.plantnet) && !error.message.includes("https:"));
});

test("backup headers and body stalls both have a hard deadline even when abort is ignored", async () => {
  for (const bodyStall of [false, true]) {
    const result = bodyStall ? new Response("{}") : undefined;
    if (result) Object.defineProperty(result, "json", { value: () => new Promise(() => {}) });
    await assert.rejects(identifyPlantWithPlantNet(photo, keys.plantnet, async () =>
      result ?? new Promise<Response>(() => {}), { timeoutMs: 5 }),
    (error: unknown) => error instanceof IdentificationServiceError && error.category === "timeout");
  }
});

test("the combined deadline reserves backup time and never stacks two full provider waits", async (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const providers: string[] = [];
  const events: IdentificationEvent[] = [];
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  try {
    const pending = identifyPlant(photo, keys, { onEvent: (event) => events.push(event), fetcher: async (url) => {
      providers.push(isBackup(url) ? "plantnet" : "gemini");
      return new Promise<Response>(() => {}); // deliberately ignores abort
    } });
    const rejected = assert.rejects(pending,
      (error: unknown) => error instanceof IdentificationServiceError && error.category === "timeout");
    await flush();
    context.mock.timers.tick(30_000);
    await flush();
    assert.deepEqual(providers, ["gemini", "plantnet"]);
    assert.equal(events.find((event) => event.event === "fallback_started")?.elapsedMs, 30_000);
    context.mock.timers.tick(15_000);
    await rejected;
    assert.deepEqual(providers, ["gemini", "plantnet"]);
  } finally {
    context.mock.timers.reset();
  }
});

test("missing backup credentials never break primary success and explain fallback configuration failure", async () => {
  assert.equal((await identifyPlant(photo, { gemini: keys.gemini }, { fetcher: async () => geminiResponse() })).status, "identified");
  await assert.rejects(identifyPlant(photo, { gemini: keys.gemini }, { ...noDelay,
    fetcher: async () => new Response("{}", { status: 503 }),
  }), /backup is not configured.*PLANTNET_API_KEY/);
});

test("WebP retains Gemini support but is never mislabeled and sent to the backup", async () => {
  const webp = { ...photo, mimeType: "image/webp" as const };
  assert.equal((await identifyPlant(webp, keys, { fetcher: async () => geminiResponse() })).status, "identified");
  let backups = 0;
  await assert.rejects(identifyPlant(webp, keys, { ...noDelay, fetcher: async (url) => {
    if (isBackup(url)) backups++;
    return new Response("{}", { status: 503 });
  } }), /backup supports only JPEG or PNG/);
  assert.equal(backups, 0);
});

test("both providers failing keeps a friendly error and a subsequent retry can succeed", async () => {
  let backupFails = true;
  const fetcher: typeof fetch = async (url) => !isBackup(url) ? new Response("{}", { status: 503 })
    : backupFails ? new Response("{}", { status: 429 }) : plantnetResponse();
  await assert.rejects(identifyPlant(photo, keys, { ...noDelay, fetcher }), /Gemini.*Pl@ntNet.*quota/);
  backupFails = false;
  assert.equal((await identifyPlant(photo, keys, { ...noDelay, fetcher })).status, "identified");
});

test("backup credential changes invalidate cached results without retaining failed analyses", async () => {
  const cache = createIdentificationCache();
  let calls = 0;
  const analyze = async () => { calls++; return normalizePlantNetIdentification(pnMatch); };
  await cache(photo, "client", keys, analyze);
  await cache(photo, "client", keys, analyze);
  assert.equal(calls, 1);
  await cache(photo, "client", { ...keys, plantnet: "new-unit-key" }, analyze);
  assert.equal(calls, 2);
  await assert.rejects(cache(photo, "other-client", keys, async () => {
    throw new IdentificationServiceError("Both services unavailable", 503, "unavailable");
  }));
  await cache(photo, "other-client", keys, analyze);
  assert.equal(calls, 3);
});

test("app concurrency limits are outside provider fallback and never call another provider", async () => {
  const cache = createIdentificationCache();
  const inFlight = Array.from({ length: 16 }, (_, i) =>
    cache(photo, `client-${i}`, keys, () => new Promise(() => {})));
  void inFlight;
  let analyses = 0;
  await assert.rejects(cache(photo, "client-17", keys, async () => {
    analyses++;
    return normalizePlantNetIdentification(pnMatch);
  }), (error: unknown) => error instanceof IdentificationServiceError && error.category === "app_limit");
  assert.equal(analyses, 0);
});
