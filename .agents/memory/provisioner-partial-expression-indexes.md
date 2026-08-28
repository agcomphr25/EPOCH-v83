---
name: Provisioner partial expression indexes
description: Replit migration validation can malformedly rewrite partial JSON expression indexes.
---

For a unique index on a nullable JSON text expression, omit a redundant `WHERE expression IS NOT NULL` predicate when migration validation rewrites it incorrectly. PostgreSQL unique indexes permit multiple `NULL` values, so indexing the nullable expression directly preserves uniqueness for populated keys. Also inspect the generated publish diff for balanced parentheses: unusually long JSON key literals can still be emitted with a missing closing parenthesis even after the predicate is removed.

**Why:** Replit migration validation rewrote a valid partial JSON expression index into malformed SQL with the `WHERE` clause inside the index expression. Removing the predicate exposed a second rewrite defect where one long JSON key literal still produced an unbalanced expression.

**How to apply:** When enforcing uniqueness on `jsonb ->> key`, use a unique expression index without a partial predicate unless rows with null expression results must be excluded for index-size or planner reasons. Validate the exact publish SQL, not just the migration file; if parentheses remain unbalanced, use a shorter metadata key and preserve the legacy key alongside it when compatibility matters.
