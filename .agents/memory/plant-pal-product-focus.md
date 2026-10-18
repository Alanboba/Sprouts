---
name: Plant Pal product focus
description: User's preference for functional simplicity and the scope of plant photos.
---

The user requested: “take off the unnecessary designs and generate a moisture dashboard + a photo upload option.”

**Why:** The user wanted a simpler, functional surface after seeing the decorative Field Notes journal design.

**How to apply:** Prioritize moisture readings, sensor status, useful watering guidance, and the user's own plant photo. Do not reintroduce journal stamps, ornamental plant artwork, or editorial filler without a new request.

Plant photos are device-local, not a cloud upload feature.

**Why:** The existing care experience is local and no account, remote photo storage, or sharing feature was requested. Device-local persistence was explicitly explained during implementation.

**How to apply:** Describe photos as saved on the device. Treat cross-device/cloud storage as a separate scope change, not an implied capability.

The first part of the subtitle is a user-editable plant nickname, separate from its species: “Nickname · Pothos”.

**Why:** The user clarified that “Name” was meant to be changed freely by the user, not displayed as a fixed label.

**How to apply:** Keep nicknames specific to each plant and independent of Gemini identification and scientific/common species names.

Keep the photo option available even when there are no saved plant profiles.

**Why:** After plant removal was added, hiding the photo controls in the empty state made the user report the photo feature missing on both iPhone/Expo Go and Replit preview.

**How to apply:** Verify the empty-profile experience as well as the default plant. A photo chosen before a profile exists should remain available and attach to the first new plant, without sharing photos across plants.

Diagnose photo complaints through the user's complete UI journey before changing the AI integration.

**Why:** Working Gemini requests and successful uploads with a default plant did not rule out a blocked empty-profile journey. Repeated service-only checks missed the UI entry and confirmation steps.

**How to apply:** Reproduce selection, preview, identification access, result rendering, confirmation, and reload in the relevant profile state. Distinguish observed failures from unverified native-device behavior; a successful backend request alone is not proof that the feature works.
