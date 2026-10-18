---
name: Orphaned development servers
description: Recurrent stale child processes after managed API and Expo workflow restarts in this workspace.
---

Check the actual listening process when a managed restart reports success but logs show an occupied port or an interactive alternate-port prompt.

**Why:** Old API and Metro child processes survived managed workflow restarts here. This left the old server answering while the replacement failed or waited for input, making a healthy HTTP response misleading.

**How to apply:** Inspect the listener and its working directory. Terminate only a confirmed stale process belonging to the same artifact, then restart the existing managed workflow. Do not create duplicate workflows, change assigned ports, or kill unrelated Node processes. Verify the new workflow is actually serving the changed code.
