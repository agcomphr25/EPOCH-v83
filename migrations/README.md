# Migrations

Migration files in this directory are applied in numeric-prefix order by the
startup script in `server/migrate.ts`.

**Before writing a new migration, read the authoring guide:**
[`docs/migration-authoring.md`](../docs/migration-authoring.md)

The guide covers:
- The EXISTS guard rule for data-seed migrations
- Copy-paste templates for the three guard patterns used in this codebase
- A pre-commit checklist
- Real-world examples from this directory
