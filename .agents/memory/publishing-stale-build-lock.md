---
name: Publishing stale build lock
description: Recovery for a Replit publish pane that claims a completed build is still in progress
---

Replit’s Publishing pane can retain an “already in progress” lock for a build whose deployment service status is already `success`; restarting compute and reopening the Publishing pane clears the stale control-plane state before republishing.

**Why:** A completed older build was reported as still publishing, while the deployment service showed no active failed build and the app remained live.

**How to apply:** Verify the build status through deployment metadata first. If the referenced build is successful, use the workspace command palette’s “Restart compute,” then reopen Publishing and republish. Escalate to Replit Support if the lock persists.