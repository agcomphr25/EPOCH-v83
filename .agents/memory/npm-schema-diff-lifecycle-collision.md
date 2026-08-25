---
name: npm schema-diff lifecycle collision
description: Prevent migration safety helpers from being auto-run by npm before Replit's Drizzle schema-diff command.
---

Do not name the explicit pre-deployment migration safety command `predb:push`. npm treats it as the automatic pre-lifecycle for `db:push`, so a normal Drizzle schema-diff invocation runs the safety helper first.

**Why:** The safety helper correctly fails closed for unapproved destructive SQL, but its failure prevents Drizzle from calculating the development schema diff and the UI can surface the result as an unexpected server disconnect.

**How to apply:** Keep the safety helper under a non-lifecycle name such as `predeploy-migrate`, invoke it explicitly from any manual deployment script, and leave `db:push` to invoke Drizzle directly.