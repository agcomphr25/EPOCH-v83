/**
 * Nightly drift check — verifies that live docs/policies/*.md hashes match the
 * latest published versions of each in-repo policy. Logs a warning when drift
 * is detected; admins can also see the report via GET /api/policies/admin/drift.
 */

import { detectDrift } from '../services/policiesService';

export async function runPoliciesDriftCheck(): Promise<{ drifted: number; missing: number; total: number }> {
  const rows = await detectDrift();
  const drifted = rows.filter((r) => r.state === 'drift');
  const missing = rows.filter((r) => r.state === 'doc-missing');
  if (drifted.length > 0 || missing.length > 0) {
    console.warn(
      `⚠️  [policiesDriftCheck] Detected drift in ${drifted.length} policy doc(s) and ${missing.length} missing doc(s)`,
    );
    for (const r of drifted) {
      console.warn(`   - DRIFT  ${r.policyKey}: live=${r.liveHash} published=${r.publishedHash}`);
    }
    for (const r of missing) {
      console.warn(`   - MISSING ${r.policyKey}: docs/policies/${r.policyKey}.md not found`);
    }
  } else {
    console.log(`✅ [policiesDriftCheck] All ${rows.length} policies in sync`);
  }
  return { drifted: drifted.length, missing: missing.length, total: rows.length };
}
