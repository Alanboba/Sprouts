---
name: Gemini availability checks
description: Distinguishing working credentials and model discovery from actual vision inference availability.
---

Verify Gemini availability with a bounded, real image-generation request, not just model discovery or metadata.

**Why:** During identification repair, authentication and model metadata succeeded while generation repeatedly timed out, even on tiny inputs and with lower thinking settings. Another officially supported vision model completed the same identification promptly using the unchanged key. Listed models also did not all respond successfully to generation.

**How to apply:** Do not blame or rotate credentials merely because generation hangs. Check Google's current model capabilities, test the exact request shape, and measure actual inference before choosing a model. Preserve conservative uncertainty handling when changing models. Never introduce mock identifications as an outage fallback.
