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

## Reproducible backup accuracy check

The server-only suite calls **real Pl@ntNet directly**, not Gemini and not a
simulated Pl@ntNet response. It bypasses the app cache. It tests provider
accuracy, not the mobile camera workflow or Gemini's availability.

From the workspace root:

```sh
# Default: list the dataset, no downloads, no secrets needed, no provider calls.
pnpm --filter @workspace/api-server run test:identify:live --suite

# Optional: download and verify all three public photos without provider calls.
pnpm --filter @workspace/api-server run test:identify:live --suite --prepare

# Explicit opt-in: consumes up to 3 real requests using PLANTNET_API_KEY only.
pnpm --filter @workspace/api-server run test:identify:live --suite --live --max-calls 3
```

`--max-calls` accepts only integers 1–3 (default 3). Requests are sequential,
with no retries and a hard 15-second deadline including response reading.
Quota (429), credential (401/403), and configuration failures stop the run;
remaining rows are explicitly skipped. Missing configuration consumes no quota.
Other errors count against the call limit. Image downloads have a separate
12-second deadline and a 1.5 MB streaming limit per photo. A complete run is
bounded to three downloads and three provider attempts, at most about 81 seconds
of network waiting. HTTP status is recorded only if headers were actually
received; local configuration and transport failures have a null HTTP status.

### Photos, labels and licensing

The small photo set is defined by
[`src/scripts/identification-photos.json`](src/scripts/identification-photos.json).
Each entry includes its creator, source page, image URL, license/link,
modifications, source-label evidence, accepted species names and SHA-256.
These labels were checked against Commons descriptions/species categories and
the photos visually inspected; they are **not independent expert botanical
certifications**. The manifest records Aloe barbadensis as a synonym of Aloe
vera; matching otherwise uses exact names after case/whitespace normalization,
not genus-only matches or prefix guesses.

| Photo | Source label | Creator | License |
| --- | --- | --- | --- |
| [Monstera leaf](https://commons.wikimedia.org/wiki/File:Monstera_deliciosa_DSC02605.jpg) | Monstera deliciosa | Smatu | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| [Aloe in Lanzarote](https://commons.wikimedia.org/wiki/File:Aloe_vera_Lanzarote.jpg) | Aloe vera | H. Zell | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| [Sunflower head](https://commons.wikimedia.org/wiki/File:Sunflower_head_2026_G1.jpg) | Helianthus annuus | George Chernilevsky | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

All three are Wikimedia-generated 960px JPEG thumbnails; no local crop,
enhancement, or image generation was applied. License attribution above also
applies to the downloaded copies. Retain attribution and applicable ShareAlike
terms if redistributing the photos. They are downloaded on demand to
`generated-artifacts/identification-photos/` at the workspace root, excluded
from Git and deployment. Only the manifest and a small sanitized evidence
report are tracked. No user photos are included. Hash mismatches (including a
changed remote thumbnail) fail explicitly; never update hashes to hide a
different image without checking its label, license and contents again.

### Reports and interpretation

The CLI prints sanitized JSON and writes
`generated-artifacts/plantnet-verification.json` at the workspace root.
Override with `--report path` or `--photo-dir path` (custom relative paths are
relative to the command's working directory, `artifacts/api-server` under
`pnpm --filter`). Reports contain only selected scalar diagnostics: label,
photo ID/hash, top species/score, normalized result, correctness/uncertainty,
HTTP status, failure category/stage, skipped reason and elapsed time.
They never contain images/base64, request URLs, raw provider payloads or raw
exceptions. Known secret values and their URL-encoded forms are redacted from
both console and report output.

- `correct`: accepted identification matches a source label or listed synonym.
- `incorrect`: confident identification disagrees with the source label.
- `uncertain`: conservative normalization declined to identify, even if the
  top guess matches the label. `topMatchesLabel` is reported separately.
- `failure`: configuration, fixture or provider failure, not an accuracy result.
- `skipped`: call cap or an earlier quota/configuration failure prevented a call.

The exit code is nonzero for confident mistakes and operational failures.
Uncertainty alone does not fail the command, but **exit code zero is not an
accuracy target met**: inspect the summary. Never inflate scores or lower the
0.7 cutoff to make a run pass. The suite's unit tests mark all mocked results
as `synthetic_unit` and report zero `realProviderCalls`; automated tests never
consume live quota.

### Observed live evidence — 2026-10-18

The unmodified three-photo suite made exactly three real Pl@ntNet calls, all
HTTP 200, with no retry, Gemini call or simulated primary failure.
The complete sanitized report is retained in
[`verification/plantnet-2026-10-18.json`](verification/plantnet-2026-10-18.json).

| Source label | Actual top species | Raw score | App outcome | Row elapsed / provider elapsed |
| --- | --- | --- | --- | --- |
| Monstera deliciosa | Monstera deliciosa | 0.90219 | Correct, identified | 1070 / 1061 ms |
| Aloe vera | Aloe vera | 0.85559 | Correct, identified | 851 / 698 ms |
| Helianthus annuus | Helianthus annuus | 0.40203 | Uncertain; no name accepted | 355 / 283 ms |

Total elapsed: 2276 ms. Confident correct: 2; confident incorrect: 0;
uncertain: 1; failures/skips: 0. No live quota or configuration failure was
observed; those paths are tested with **synthetic** responses, not reported as
live evidence. A confident backup match has now been observed without changing
the threshold. This tiny, source-labeled convenience set is a smoke check,
not a statistically representative accuracy estimate or evidence of future
provider reliability. Physical iPhone/Android camera checks remain separate.
