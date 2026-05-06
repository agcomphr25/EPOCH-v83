# EPOCH Written Policies

This directory holds the canonical, versioned written policies required for DCAA review and CMMC governance. Each policy lives as a markdown file and is published into the system through the Policies admin surface, which snapshots the file content into an immutable `policy_versions` row with a SHA-256 content hash.

## Required policies

| Key | File | Purpose |
| --- | --- | --- |
| `timekeeping` | [timekeeping.md](./timekeeping.md) | Daily time recording, certification, and supervisor approval rules. |
| `labor-charging` | [labor-charging.md](./labor-charging.md) | Charging direct vs. indirect labor against authorized WADs and charge codes. |
| `corrections` | [corrections.md](./corrections.md) | After-the-fact timesheet correction workflow and audit trail. |
| `approvals` | [approvals.md](./approvals.md) | Multi-stage approval responsibilities for time, PTO, and labor cost. |
| `period-close` | [period-close.md](./period-close.md) | Pay period and accounting period close procedures. |
| `indirect-cost-allocation` | [indirect-cost-allocation.md](./indirect-cost-allocation.md) | Indirect cost pools, allocation bases, and rate computation. |
| `unallowable-costs` | [unallowable-costs.md](./unallowable-costs.md) | Identification, segregation, and exclusion of FAR Part 31 unallowable costs. |

## Authoring rules

1. **Drafts are written manually** — no auto-generation from system behavior.
2. Every policy file MUST include a top-level `# Title`, an **Effective date**, an **Owner**, and a **Change summary** for the most recent revision.
3. Cross-reference the relevant compliance task (`task-XX.md`) where applicable.
4. **Never** rewrite history. To change a policy, edit the file and use the admin "Publish new version" action — the previous published version is preserved immutably in `policy_versions`.

## Drift detection

A nightly job (`policiesDriftCheck`) hashes each `docs/policies/*.md` file with SHA-256 and compares the hash to the latest published version of the in-repo policy with the same key. Mismatches are reported to admins in the Policies admin dashboard. This is the guardrail that prevents the markdown source and the published snapshot from silently diverging.

## External-source policies

Some policies (e.g., legal-team-authored documents) live outside this repo. For those, set `source = 'external-upload'` on the policy record and use the admin upload action to attach a new version (PDF / DOCX / MD). Drift detection is skipped for external-source policies.
