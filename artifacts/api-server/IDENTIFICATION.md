# Gemini-first identification with Pl@ntNet backup

## Secrets and startup

In Replit, open **Tools → Secrets** and keep these two names:

- `GEMINI_API_KEY`: the existing Google Gemini key.
- `PLANTNET_API_KEY`: the backup key from your Pl@ntNet account.

Do not put keys in chat, `.replit`, public variables, source files or URLs you
share. If a key was previously exposed in tracked configuration, rotate it.
Both keys are read only by the backend. Pl@ntNet's official authentication uses
a query parameter internally; raw URLs and provider errors are never logged.

Restart the API server after adding/changing secrets. For a published app,
confirm the keys in **Production app secrets**, then republish. Updating the
workspace alone does not update an already-published app.

## How it works

1. The existing camera/library picker prepares a bounded JPEG and saves the
   preview on the device. The backend validates the image before any API call.
2. A new uncached analysis tries the existing `gemini-3.5-flash-lite` model first.
   Successful Gemini descriptions, confidence and confirmation stay unchanged.
3. Eligible quota, rate-limit, transport, temporary-service, timeout or malformed
   provider failures use Pl@ntNet once. Valid uncertainty, invalid images and
   credential/model configuration errors do not silently switch providers.
4. With a usable backup, Gemini has up to 30 seconds and Pl@ntNet the remaining
   time, up to 15 seconds. The whole backend stays within 45 seconds; the client
   allows 55 seconds for upload/response overhead. Without a usable backup,
   Gemini retains its former 45-second allowance.
5. Pl@ntNet gets the actual JPEG/PNG bytes as multipart files. It does not supply
   an invented description. Scores below 0.7 request a clearer photo; a score is
   an estimate, not proof of a correct identification. Missing common names use
   the returned scientific name with an explicit review message.

The API still accepts WebP for Gemini; Pl@ntNet accepts only JPEG/PNG. A direct
WebP API caller gets an honest backup-format limitation if Gemini fails. The
app's existing picker already converts photos to JPEG.

Saved photos/profiles, name editing and confirmation are unchanged. The backend
does not persist images. No Arduino, ESP32, moisture or watering logic changed.

## Files

- `src/lib/plant-identification.ts`: existing Gemini adapter and safe categories.
- `src/lib/plantnet-identification.ts`: official Pl@ntNet multipart adapter.
- `src/lib/identify-plant.ts`: Gemini-first policy and shared time budget.
- `src/lib/identification-provider.ts`: safe errors and hard deadlines.
- `src/lib/plant-identification-cache.ts`: credential-aware cache/coalescing.
- `src/routes/plant-identification.ts`: existing validated endpoint.
- `../plant-tamagotchi/app/identify.tsx`: explanatory text only.
- `../../lib/api-spec/openapi.yaml`: contract documentation and timeout response.

## Tests

Automated tests use synthetic provider responses **only as unit-test fixtures**:

```sh
pnpm --filter @workspace/api-server test
```

The opt-in live check below uses a real local photo, bypasses the app cache and
consumes real provider quota. It logs only normalized results and safe metadata.

```sh
pnpm --filter @workspace/api-server run test:identify:live --photo /path/plant.jpg
pnpm --filter @workspace/api-server run test:identify:live --photo /path/plant.jpg --fallback
```

The first command calls Gemini normally (and may fall back if it genuinely
fails). The second simulates only a Gemini rate-limit error inside this local
test process, then calls the **real Pl@ntNet API**. It never fabricates a plant
result or changes a running app's keys. There is no public force-failure route.
Check the logged provider events to see which provider actually answered.

An HTTP success with `status: uncertain` is a real provider response handled
conservatively, not a successful species identification. Do not lower the
threshold merely to make a test pass. Physical iPhone/Android camera testing
still requires access to those devices.

Official API documentation: <https://my.plantnet.org/doc/api/identify> and
<https://my.plantnet.org/doc/getting-started/faq>.
