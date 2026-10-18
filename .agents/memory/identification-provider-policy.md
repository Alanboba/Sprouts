---
name: Identification provider policy
description: User-authorized roles for Gemini and Pl@ntNet, and boundaries around plant identification.
---

Keep Google Gemini as the primary provider for identification and image descriptions. Pl@ntNet is explicitly authorized only as an automatic backup for appropriate provider failures, not as a replacement for Gemini. Never invent a description when the backup supplies only species and confidence.

**Why:** The user specifically requested both providers in the existing app while preserving Gemini, current camera/upload workflows, styling, profiles, and care features.

**How to apply:** Make minimal integration changes, keep both credentials backend-only, and preserve uncertainty rather than forcing another identification for a successful uncertain result. Identification must remain separate from ESP32/Arduino, soil-moisture readings, and watering logic.

An explicit retry after uncertainty may use a second close-up of the same plant. Keep Gemini first, send all selected actual images together, and keep confidence standards unchanged. Do not combine separate per-photo guesses or average provider scores to manufacture confidence.

**Why:** The user authorized extra visual evidence to improve uncertain matches, not a more permissive identification policy or automatic provider switching after an uncertain result.

**How to apply:** Keep close-ups temporary and separate from the original device-local profile photo. Unsupported provider formats must be explained rather than silently dropping an image. Changes to watering or hardware remain out of scope.
