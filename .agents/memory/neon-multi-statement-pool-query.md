---
name: Neon multi-statement pool.query bug
description: pool.query() with multiple semicolon-separated statements crashes toCompatibleQueryResult because Neon returns an array instead of a single QueryResult
---

## Rule
Never pass multiple SQL statements (separated by semicolons) to `pool.query()` in this codebase.

## Why
`server/db.ts` wraps every `pool.query()` result in `toCompatibleQueryResult`, which does `[...result.rows]`. The Neon serverless driver returns an **array** of QueryResult objects for multi-statement queries. Arrays have no `.rows` property, so spreading it throws `TypeError: result.rows is not iterable`, crashing the caller.

The standard `pg` driver used in development (connected to `helium/heliumdb`) handles multi-statement queries differently and returns only the last result — so this bug is silent in dev but fatal in production.

## How to apply
- Any time you see `pool.query(\`...; ...\`)` (two or more statements in one string), split them into chained sequential calls: `pool.query(stmt1).then(() => pool.query(stmt2))`.
- This pattern appeared in `ensureEmployeeAccessExceptionSchema` in `server/src/routes/auth.ts` and caused a complete login outage.
- Also applies to `ensureUserSessionsLoginSchema` and any other lazy-init schema guard that uses `pool.query`.
