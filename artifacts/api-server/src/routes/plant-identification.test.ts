import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlantImage,
  identifyPlantWithGemini,
  normalizeGeminiIdentification,
  GeminiServiceError,
  GEMINI_ATTEMPT_TIMEOUT_MS,
  GEMINI_TOTAL_TIMEOUT_MS,
  type GeminiAttemptEvent,
} from "../lib/plant-identification";
import { createIdentificationCache } from "../lib/plant-identification-cache";
import app from "../app";
import { request } from "node:http";

test("HTTP boundary validates every close-up and permits the bounded two-photo JSON envelope", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const send = (body: unknown) => new Promise<{ status: number; body: { error: string } }>((resolve, reject) => {
    const req = request({
      host: "127.0.0.1", port: address.port, path: "/api/plants/identify",
      method: "POST", headers: { "Content-Type": "application/json" },
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        try { resolve({ status: response.statusCode!, body: JSON.parse(text) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
  const photo = {
    mimeType: "image/jpeg",
    imageBase64: Buffer.from([0xff, 0xd8, 0xff, ...new Array(40).fill(0)]).toString("base64"),
  };
  try {
    // These all fail before configuration/provider access; no external calls.
    for (const additionalPhotos of [
      [{ ...photo, imageBase64: "!".repeat(44) }],
      [{ ...photo, imageBase64: Buffer.alloc(40).toString("base64") }],
      [{ ...photo, imageBase64: Buffer.alloc(30).toString("base64") }],
      [{ ...photo, mimeType: "image/gif" }],
      [photo, photo],
    ]) {
      assert.equal((await send({ ...photo, additionalPhotos })).status, 400);
    }
    const response = await send({
      ...photo,
      additionalPhotos: [{ ...photo, imageBase64: Buffer.alloc(1_500_000).toString("base64") }],
    });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /not a valid JPEG/);
    // Almost 4 MB of base64 JSON fits the parser and reaches second-image
    // validation; first-image signature passes but the second is invalid.
    const large = Buffer.alloc(1_500_000);
    large.set([0xff, 0xd8, 0xff]);
    const pair = await send({
      ...photo, imageBase64: large.toString("base64"),
      additionalPhotos: [{ ...photo, imageBase64: Buffer.alloc(1_500_000).toString("base64") }],
    });
    assert.equal(pair.status, 400);
    assert.match(pair.body.error, /not a valid JPEG/);
    const oversized = await send({ ...photo, additionalPhotos: [{ ...photo, imageBase64: "A".repeat(4_200_000) }] });
    assert.equal(oversized.status, 413);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

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

test("generated descriptions are bounded and only shown for confident identifications", () => {
  const input = {
    status: "identified",
    commonName: "Pothos",
    scientificName: "Epipremnum aureum",
    confidence: 0.95,
    description: " Bright, heart-shaped leaves on trailing stems. ",
  };
  assert.equal(normalizeGeminiIdentification(input).description, input.description.trim());
  assert.equal(normalizeGeminiIdentification({ ...input, description: "x".repeat(900) }).description?.length, 600);
  assert.equal(normalizeGeminiIdentification({ ...input, confidence: 0.2 }).description, undefined);
  assert.equal(normalizeGeminiIdentification({ ...input, status: "not_plant" }).description, undefined);
  assert.equal(normalizeGeminiIdentification({ ...input, description: undefined }).description, undefined);
});

test("Google invalid-key, invalid-image, configuration and exhausted-quota errors are distinct and safe", async () => {
  const cases = [
    { status: 400, error: { message: "API key not valid", details: [{ reason: "API_KEY_INVALID" }] }, expected: /credentials|permissions/i },
    { status: 400, error: { message: "Could not decode image" }, expected: /image/i },
    { status: 400, error: { message: "Invalid response schema" }, expected: /request configuration/i },
    { status: 429, error: { details: [{ violations: [{ quotaId: "RequestsPerDay", quotaValue: "0" }] }] }, expected: /quota.*exhausted/i },
  ];
  for (const entry of cases) {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: entry.error }), { status: entry.status });
    };
    await assert.rejects(
      identifyPlantWithGemini({ imageBase64: "test", mimeType: "image/jpeg" }, "test-key", fetcher),
      (error: unknown) => {
        assert.ok(error instanceof GeminiServiceError);
        assert.match(error.message, entry.expected);
        assert.equal(error.message.includes("test-key"), false);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
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
    /took too long/,
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

test("a genuine response slower than the former 12-second cutoff succeeds within the new budget", async (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const events: GeminiAttemptEvent[] = [];
  const fakeFetch: typeof fetch = async () => new Promise((resolve) =>
    setTimeout(() => resolve(success()), 15_000));
  try {
    const pending = identifyPlantWithGemini(fixture, "private-key-marker", fakeFetch, {
      onAttempt: (event) => events.push(event),
    });
    context.mock.timers.tick(15_000);
    assert.equal((await pending).status, "identified");
    assert.equal(events.find((event) => event.event === "headers_received")?.elapsedMs, 15_000);
    assert.equal(events.at(-1)?.event, "completed");
    assert.equal(events.filter((event) => event.event === "started").length, 1);
    assert.equal(JSON.stringify(events).includes("private-key-marker"), false);
    assert.equal(JSON.stringify(events).includes(fixture.imageBase64), false);
    assert.equal(GEMINI_ATTEMPT_TIMEOUT_MS, 30_000);
    assert.equal(GEMINI_TOTAL_TIMEOUT_MS, 45_000);
  } finally {
    context.mock.timers.reset();
  }
});

test("the total deadline caps a single stalled attempt and prevents an over-budget retry", async () => {
  const events: GeminiAttemptEvent[] = [];
  let calls = 0;
  const fakeFetch: typeof fetch = async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  };
  await assert.rejects(
    identifyPlantWithGemini(fixture, "test", fakeFetch, {
      attemptTimeoutMs: 100, totalTimeoutMs: 5,
      onAttempt: (event) => events.push(event),
    }),
    (error: unknown) => error instanceof GeminiServiceError && error.upstreamStatus === 504,
  );
  assert.equal(calls, 1);
  assert.equal(events.at(-1)?.failureKind, "timeout");
  assert.equal(events.at(-1)?.stage, "waiting_for_response");
});

test("the retry receives only the remaining total budget, not another full attempt", async () => {
  const events: GeminiAttemptEvent[] = [];
  let calls = 0;
  const fakeFetch: typeof fetch = async (_url, init) => {
    calls++;
    if (calls === 1) return new Response("{}", { status: 503 });
    return new Promise((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  };
  await assert.rejects(identifyPlantWithGemini(fixture, "test", fakeFetch, {
    attemptTimeoutMs: 1_000, totalTimeoutMs: 800,
    onAttempt: (event) => events.push(event),
  }), /took too long/);
  assert.equal(calls, 2);
  const attempts = events.filter((event) => event.event === "started");
  assert.equal(attempts[1]?.attempt, 2);
  assert.ok((attempts[1]?.elapsedMs ?? 0) >= 550);
  assert.ok((events.at(-1)?.attemptElapsedMs ?? 1_000) < 1_000);
});

test("attempt diagnostics distinguish provider body timeouts and safe transport failures", async () => {
  for (const stage of ["reading_response", "waiting_for_response"]) {
    const events: GeminiAttemptEvent[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      if (stage === "waiting_for_response") {
        throw new TypeError("private network detail", { cause: { code: "ECONNRESET", url: "private" } });
      }
      const response = success();
      Object.defineProperty(response, "json", { value: () => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }) });
      return response;
    };
    await assert.rejects(identifyPlantWithGemini(fixture, "test", fakeFetch, {
      ...noDelay, attemptTimeoutMs: 5,
      onAttempt: (event) => events.push(event),
    }));
    const failed = events.find((event) => event.event === "failed");
    assert.equal(failed?.stage, stage);
    assert.equal(failed?.failureKind, stage === "reading_response" ? "timeout" : "transport");
    assert.equal(failed?.transportCode, stage === "waiting_for_response" ? "ECONNRESET" : undefined);
    assert.equal(JSON.stringify(events).includes("private"), false);
  }
});

test("provider errors are timed and classified without forwarding raw error details", async () => {
  const events: GeminiAttemptEvent[] = [];
  const fakeFetch: typeof fetch = async () => new Response(
    JSON.stringify({ error: { message: "private provider detail" } }), { status: 503 });
  await assert.rejects(identifyPlantWithGemini(fixture, "test", fakeFetch, {
    ...noDelay, onAttempt: (event) => events.push(event),
  }), /busy or unavailable/);
  assert.equal(events.filter((event) => event.event === "started").length, 2);
  assert.equal(events.find((event) => event.event === "failed")?.failureKind, "provider");
  assert.equal(events.find((event) => event.event === "failed")?.status, 503);
  assert.equal(JSON.stringify(events).includes("private"), false);
});

test("cache diagnostics distinguish fresh, shared, and repeated results", async () => {
  const cache = createIdentificationCache();
  const states: string[] = [];
  const analyze = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return normalizeGeminiIdentification(identified);
  };
  await Promise.all([
    cache(fixture, "client", "key", analyze, (state) => states.push(state)),
    cache(fixture, "client", "key", analyze, (state) => states.push(state)),
  ]);
  await cache(fixture, "client", "key", analyze, (state) => states.push(state));
  assert.deepEqual(states, ["miss", "shared", "hit"]);
});
