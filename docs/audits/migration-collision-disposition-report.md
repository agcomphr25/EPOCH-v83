# Migration Collision Disposition Report

Audit basis: clean detached `origin/main` at `22f478990ee2a59f2780b79ac71507b9818e0242`. No database or migration was executed.

## Disposition

| Question                            | Result                                                                    | Disposition                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Duplicate numeric prefixes          | 31 prefixes / 76 files                                                    | Finding only. Prefix is not an identity in either inspected runner.                                                                                                |
| Duplicate complete filenames        | None possible in one filesystem directory; static inventory verifies none | No collision.                                                                                                                                                      |
| Migration-runner identity collision | None found                                                                | Pre-deploy uses the complete filename stem; safe boot uses complete filenames.                                                                                     |
| Registration collision              | Static check required; see generated `migration-disposition.json`         | Complete-name registration, not prefix registration.                                                                                                               |
| Ordering ambiguity                  | No prefix-level ambiguity                                                 | Pre-deploy lexicographically sorts complete filenames; safe boot uses explicit array order. Same-prefix files therefore have a deterministic secondary name order. |
| Clean-schema execution              | Not established in this environment                                       | Requires an isolated PostgreSQL instance; never production.                                                                                                        |
| Production migration history        | Not inspected                                                             | Needed to confirm actual hashes and historical success, but not to interpret prefix identity.                                                                      |

## Runner behavior

`server/pre-deploy-migrate.ts` discovers every `.sql` file, sorts complete names lexicographically, derives the tracking key by removing `.sql`, and stores that full stem in `drizzle.__drizzle_migrations.hash`. Consequently, `0075_cutting_documents_table` and `0075_time_off_requests` are distinct identities.

`server/scripts/migrations/runSafeBootMigrations.ts` does not discover by prefix or record applied identities. It replays an explicit ordered array of complete filenames. Critical entries fail closed; noncritical errors are logged and skipped. This creates a separate audit concern: successful historical execution cannot be inferred from a successful boot count, and idempotence is required on every boot.

## Remaining validation

Run clean-schema replay in disposable PostgreSQL and compare its final schema to the Drizzle schema. Separately, run the read-only production query against `drizzle.__drizzle_migrations` to identify absent, duplicate, or unexpected complete-name hashes. Do not rename historical migrations.
