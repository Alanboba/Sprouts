import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlantImage,
  identifyPlantWithGemini,
  normalizeGeminiIdentification,
  GeminiServiceError,
} from "../lib/plant-identification";
import { createIdentificationCache } from "../lib/plant-identification-cache";

test("identification accepts a complete high-confidence plant match", () => {
  const result = normalizeGeminiIdentification({
    status: "identified",
    commonName: "Monstera",
    scientificName: "Monstera deliciosa",
    confidence: 0.93,
  });

  assert.equal(result.status, "identified");
  assert.equal(result.commonName, "Monstera");
  assert.equal(result.scientificName, "Monstera deliciosa");
  assert.equal(result.confidence, 0.93);
});

test("low confidence suppresses candidate names and asks for a clearer image", () => {
  const result = normalizeGeminiIdentification({
    status: "identified",
    commonName: "Possible plant",
    scientificName: "Maybe plantus",
    confidence: 0.42,
  });

  assert.equal(result.status, "uncertain");
  assert.equal(result.commonName, "");
  assert.equal(result.scientificName, "");
  assert.equal(result.confidence, 0.42);
  assert.match(result.message, /clearer photo/i);
});

test("unrecognized model output never becomes an invented plant identity", () => {
  const result = normalizeGeminiIdentification({
    status: "identified",
    commonName: "Plant",
    confidence: 0.99,
  });

  assert.equal(result.status, "uncertain");
  assert.equal(result.commonName, "");
  assert.equal(result.scientificName, "");
  assert.equal(result.confidence, 0.99);
});

test("not-plant results have no species names or confidence claim", () => {
  const result = normalizeGeminiIdentification({
    status: "not_plant",
    commonName: "Not a plant",
    scientificName: "",
    confidence: 1,
  });

  assert.equal(result.status, "not_plant");
  assert.equal(result.commonName, "");
  assert.equal(result.scientificName, "");
  assert.equal(result.confidence, null);
  assert.match(result.message, /try another photo/i);
});

test("photo validation checks image signatures against the selected MIME type", () => {
  assert.equal(
    isPlantImage(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      "image/jpeg",
    ),
    true,
  );
  assert.equal(
    isPlantImage(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    ),
    true,
  );
  assert.equal(isPlantImage(Buffer.from("not an image"), "image/jpeg"), false);
  assert.equal(
    isPlantImage(Buffer.from("RIFFxxxxWEBP"), "image/png"),
    false,
  );
});

test("Gemini receives inline image bytes through the server-only API-key header", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const imageBase64 = Buffer.from([
    0xff, 0xd8, 0xff, 0x01, 0x02, 0x03,
  ]).toString("base64");
  const fakeFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    status: "identified",
                    commonName: "Pothos",
                    scientificName: "Epipremnum aureum",
                    confidence: 0.88,
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await identifyPlantWithGemini(
    { imageBase64, mimeType: "image/jpeg" },
    "unit-test-only",
    fakeFetch,
  );
  const sentBody = JSON.parse(String(capturedInit?.body)) as {
    contents: Array<{ parts: Array<{ inlineData?: { mimeType: string; data: string } }> }>;
  };

  assert.match(capturedUrl, /models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(new Headers(capturedInit?.headers).get("x-goog-api-key"), "unit-test-only");
  assert.deepEqual(sentBody.contents[0]?.parts[0]?.inlineData, {
    mimeType: "image/jpeg",
    data: imageBase64,
  });
  assert.equal(result.status, "identified");
  assert.equal(result.commonName, "Pothos");
});

const fixture = { imageBase64: "test-image", mimeType: "image/jpeg" as const };
const identified = {
  status: "identified" as const,
  commonName: "Pothos",
  scientificName: "Epipremnum aureum",
  confidence: 0.9,
};
const noDelay = { sleep: async () => {} };
const success = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify(identified) }] } }],
}));

test("a match may omit an unavailable confidence estimate", () => {
  const result = normalizeGeminiIdentification({ ...identified, confidence: undefined });
  assert.equal(result.status, "identified");
  assert.equal(result.confidence, null);
});

test("invalid confidence estimates do not become confident matches", () => {
  assert.equal(normalizeGeminiIdentification({ ...identified, confidence: 90 }).status, "uncertain");
});

test("transient rate limits are retried once with backoff", async () => {
  let calls = 0;
  const delays: number[] = [];
  const fakeFetch: typeof fetch = async () => ++calls === 1
    ? new Response("{}", { status: 429, headers: { "Retry-After": "1" } })
    : success();
  const result = await identifyPlantWithGemini(fixture, "test", fakeFetch, {
    sleep: async (delay) => { delays.push(delay); },
  });
  assert.equal(result.status, "identified");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1000]);
});

test("long rate-limit waits and exhausted daily quota are not retried", async () => {
  for (const response of [
    () => new Response("{}", { status: 429, headers: { "Retry-After": "60" } }),
    () => new Response(JSON.stringify({
      error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDay" }] }] },
    }), { status: 429 }),
  ]) {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => { calls++; return response(); };
    await assert.rejects(identifyPlantWithGemini(fixture, "test", fakeFetch, noDelay), /quota/i);
    assert.equal(calls, 1);
  }
});

test("invalid credentials, forbidden access, invalid requests and missing models never retry or leak raw errors", async () => {
  for (const status of [400, 401, 403, 404]) {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "private-key-marker" } }), { status });
    };
    await assert.rejects(
      identifyPlantWithGemini(fixture, "test", fakeFetch, noDelay),
      (error: unknown) => error instanceof GeminiServiceError &&
        error.upstreamStatus === status && !error.message.includes("private-key-marker"),
    );
    assert.equal(calls, 1);
  }
});

test("server failures and transport errors have a strict two-attempt limit", async () => {
  for (const transportError of [false, true]) {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      if (transportError) throw new TypeError("private network detail");
      return new Response("{}", { status: 503 });
    };
    await assert.rejects(identifyPlantWithGemini(fixture, "test", fakeFetch, noDelay), GeminiServiceError);
    assert.equal(calls, 2);
  }
});

test("hung requests are aborted, retried at most once, and return a timeout error", async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  };
  await assert.rejects(
    identifyPlantWithGemini(fixture, "test", fakeFetch, { ...noDelay, attemptTimeoutMs: 5 }),
    (error: unknown) => error instanceof GeminiServiceError && error.upstreamStatus === 504,
  );
  assert.equal(calls, 2);
});

test("timeout remains active while reading the response body", async () => {
  const fakeFetch: typeof fetch = async (_url, init) => {
    const response = new Response("{}");
    Object.defineProperty(response, "json", { value: () => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }) });
    return response;
  };
  await assert.rejects(
    identifyPlantWithGemini(fixture, "test", fakeFetch, { ...noDelay, attemptTimeoutMs: 5 }),
    /timed out/,
  );
});

test("malformed or empty provider output is an explicit error, not a fake identification", async () => {
  for (const body of [
    "not-json",
    JSON.stringify({ candidates: [] }),
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "{truncated" }] } }] }),
  ]) {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => { calls++; return new Response(body); };
    await assert.rejects(identifyPlantWithGemini(fixture, "test", fakeFetch, noDelay), GeminiServiceError);
    assert.equal(calls, 1);
  }
});

test("thought text is excluded when parsing structured plant names", async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [
      { thought: true, text: "internal reasoning, not JSON" },
      { text: JSON.stringify(identified) },
    ] } }],
  }));
  assert.equal((await identifyPlantWithGemini(fixture, "test", fakeFetch)).commonName, "Pothos");
});

test("simultaneous and repeated identical images share one Gemini analysis", async () => {
  const cache = createIdentificationCache();
  let calls = 0;
  const analyze = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return normalizeGeminiIdentification(identified);
  };
  const results = await Promise.all(Array.from({ length: 5 }, () => cache(fixture, "client", "key", analyze)));
  assert.equal(calls, 1);
  assert.equal(results.length, 5);
  await cache(fixture, "client", "key", analyze);
  assert.equal(calls, 1);
  await cache(fixture, "other-client", "key", analyze);
  assert.equal(calls, 2);
  await cache(fixture, "client", "new-key", analyze);
  assert.equal(calls, 3);
});

test("failed analyses are not cached and can be retried", async () => {
  const cache = createIdentificationCache();
  await assert.rejects(cache(fixture, "client", "key", async () => { throw new Error("failed"); }));
  const result = await cache(fixture, "client", "key", async () => normalizeGeminiIdentification(identified));
  assert.equal(result.status, "identified");
});
