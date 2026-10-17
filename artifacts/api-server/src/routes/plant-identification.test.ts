import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlantImage,
  identifyPlantWithGemini,
  normalizeGeminiIdentification,
} from "../lib/plant-identification";

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

  assert.match(capturedUrl, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(new Headers(capturedInit?.headers).get("x-goog-api-key"), "unit-test-only");
  assert.deepEqual(sentBody.contents[0]?.parts[0]?.inlineData, {
    mimeType: "image/jpeg",
    data: imageBase64,
  });
  assert.equal(result.status, "identified");
  assert.equal(result.commonName, "Pothos");
});
