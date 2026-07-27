import { promises as fs } from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { pgPool } from '../../db';
import {
  DHF_MANIFEST_SCHEMA_VERSION,
  policyForRelease,
  type DhfRequirement,
} from '../../../shared/designHistoryFilePolicy';
import {
  canonicalizeDhfManifest,
  safeDhfSegment,
  safeExportPath,
  sha256,
} from '../../../shared/designHistoryFileManifest';

export const DHF_EXPORTER_VERSION = 'epoch-dhf-exporter/v1';
export type DhfActor = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  capabilities: string[];
};
type ManifestItem = {
  category: string;
  evidenceType: string;
  sourceTable: string;
  sourceRecordId: string;
  sourceRevision: string | null;
  sourceGeneration: string | null;
  sourceChecksum: string | null;
  displayNumber: string | null;
  displayTitle: string;
  lifecycleStatus: string | null;
  baselineRelationship: string;
  requirementClass: DhfRequirement;
  inclusionStatus:
    | 'INCLUDED'
    | 'MISSING'
    | 'LEGACY_MISSING'
    | 'LEGACY_UNVERIFIED'
    | 'AUTHORIZED_OMISSION';
  omissionReason: string | null;
  retainedArtifactPath: string | null;
  sortOrder: number;
  metadata: Record<string, unknown>;
};
export class DesignHistoryFileError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}
const actorSnapshot = (actor: DhfActor) => ({
  id: actor.id,
  username: actor.username,
  displayName: actor.displayName,
  role: actor.role,
  capabilities: actor.capabilities,
});
async function one(client: PoolClient, text: string, values: unknown[] = []) {
  return (await client.query(text, values)).rows[0] ?? null;
}
async function loadRelease(
  client: PoolClient,
  releaseId: string,
  lock = false
) {
  const release = await one(
    client,
    `SELECT er.*, b.id baseline_id,b.baseline_revision,b.baseline_status,
            COALESCE(b.baseline_checksum,bi.computed_checksum) baseline_checksum,
            b.baseline_checksum recorded_baseline_checksum,b.locked_at baseline_locked_at
       FROM engineering_releases er
       LEFT JOIN engineering_release_baselines b ON b.engineering_release_id=er.id
       LEFT JOIN LATERAL (
         SELECT encode(digest(COALESCE(string_agg(
           concat_ws('|',i.baseline_category,i.source_table,i.source_record_id,
                     i.source_revision,i.source_status,i.source_checksum),
           E'\\n' ORDER BY i.baseline_category,i.source_table,i.source_record_id,i.id
         ),''),'sha256'),'hex') computed_checksum
         FROM engineering_release_baseline_items i WHERE i.baseline_id=b.id
       ) bi ON true
      WHERE er.id=$1 ${lock ? 'FOR UPDATE OF er' : ''}`,
    [releaseId]
  );
  if (!release)
    throw new DesignHistoryFileError(
      'ENGINEERING_RELEASE_NOT_FOUND',
      'Engineering Release not found',
      404
    );
  if (!release.rd_project_id || !release.design_control_record_id)
    throw new DesignHistoryFileError(
      'DHF_DESIGN_PROJECT_REQUIRED',
      'A DHF belongs only to an R&D Design Project and authoritative Design Control record',
      409
    );
  return release;
}
function releaseSequence(revision: string) {
  const normalized = revision.trim().toUpperCase();
  if (/^[A-Z]+$/.test(normalized)) {
    return normalized
      .split('')
      .reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}
function categoryMatches(key: string, item: any) {
  const text =
    `${item.baseline_category} ${item.source_module} ${item.source_table}`.toLowerCase();
  const map: Record<string, string[]> = {
    project_identity: ['rd_project', 'design_control_record'],
    project_intake: ['design_step_1', 'planning', 'intake'],
    design_inputs: ['requirement', 'design_step_2', 'design_step_3'],
    risk: ['risk', 'design_step_4'],
    reviews: ['review', 'design_step_5', 'design_step_7', 'design_step_11'],
    outputs: [
      'bom',
      'cad',
      'drawing',
      'spec',
      'design_step_6',
      'design_step_12',
    ],
    prototype: ['prototype', 'design_step_8'],
    verification: ['verification', 'design_step_9'],
    validation: ['validation', 'design_step_10'],
    controlled_forms: ['project_form', 'controlled_form'],
    engineering_release: ['release', 'baseline'],
    change_control: ['ecr', 'ecn', 'change'],
    audit: ['approval', 'audit', 'controlled_copy'],
    engineering_package: ['engineering_package', 'package'],
  };
  return (map[key] ?? []).some((token) => text.includes(token));
}
async function collectManifestItems(client: PoolClient, release: any) {
  const sequence = releaseSequence(release.release_revision);
  const baselineItems = (
    await client.query(
      `SELECT * FROM engineering_release_baseline_items
        WHERE baseline_id=$1 ORDER BY baseline_category,source_table,source_record_id,id`,
      [release.baseline_id]
    )
  ).rows;
  const [forms, changes, copyExceptions, engineeringPackage] =
    await Promise.all([
      client.query(
        `SELECT pfi.id,pfi.instance_number,pfi.lifecycle_status,pfi.retained_pdf_path,
                pfi.retained_pdf_checksum,pfi.template_revision_snapshot,
                pfi.current_content_revision_id
           FROM project_form_instances pfi
          WHERE pfi.design_control_record_id=$1 AND pfi.lifecycle_status='APPROVED'
          ORDER BY pfi.step_key,pfi.instance_number`,
        [release.design_control_record_id]
      ),
      client.query(
        `SELECT 'ECR' kind,e.id,e.ecr_number number,e.lifecycle_status status,
                r.revision_number::text revision,r.content_checksum checksum
           FROM engineering_change_requests e
           LEFT JOIN engineering_change_request_revisions r ON r.id=e.current_revision_id
          WHERE e.design_control_record_id=$1
         UNION ALL
         SELECT 'ECN',e.id,e.ecn_number,e.status::text,
                r.revision_number::text,r.content_checksum
           FROM engineering_change_orders e
           LEFT JOIN engineering_change_notice_revisions r ON r.id=e.current_revision_id
          WHERE e.design_control_record_id=$1
          ORDER BY kind,number`,
        [release.design_control_record_id]
      ),
      client.query(
        `SELECT id,copy_number,lifecycle_status,source_revision,issued_pdf_checksum
           FROM controlled_printed_copies
          WHERE design_control_record_id=$1
            AND lifecycle_status IN ('ISSUED','LOST')
          ORDER BY copy_number`,
        [release.design_control_record_id]
      ),
      client.query(
        `SELECT p.*,count(i.id)::int item_count
           FROM engineering_packages p
           LEFT JOIN engineering_package_items i ON i.engineering_package_id=p.id
          WHERE p.engineering_release_id=$1
          GROUP BY p.id`,
        [release.id]
      ),
    ]);
  const results: ManifestItem[] = [];
  let order = 0;
  const add = (item: Omit<ManifestItem, 'sortOrder'>) =>
    results.push({ ...item, sortOrder: ++order });
  for (const definition of policyForRelease(sequence)) {
    const matches = baselineItems.filter((item) =>
      categoryMatches(definition.key, item)
    );
    if (definition.key === 'controlled_forms') {
      for (const form of forms.rows)
        add({
          category: definition.category,
          evidenceType: 'PROJECT_FORM_INSTANCE',
          sourceTable: 'project_form_instances',
          sourceRecordId: form.id,
          sourceRevision: form.template_revision_snapshot,
          sourceGeneration: form.current_content_revision_id,
          sourceChecksum: form.retained_pdf_checksum,
          displayNumber: form.instance_number,
          displayTitle: definition.title,
          lifecycleStatus: form.lifecycle_status,
          baselineRelationship: 'EXACT_RELEASE_EVIDENCE',
          requirementClass: definition.requirement,
          inclusionStatus:
            form.retained_pdf_checksum && form.retained_pdf_path
              ? 'INCLUDED'
              : 'MISSING',
          omissionReason: null,
          retainedArtifactPath: form.retained_pdf_path,
          metadata: { policyKey: definition.key },
        });
      if (forms.rows.length) continue;
    }
    if (definition.key === 'change_control' && sequence > 1) {
      for (const change of changes.rows)
        add({
          category: definition.category,
          evidenceType: change.kind,
          sourceTable:
            change.kind === 'ECR'
              ? 'engineering_change_requests'
              : 'engineering_change_orders',
          sourceRecordId: change.id,
          sourceRevision: change.revision,
          sourceGeneration: null,
          sourceChecksum: change.checksum,
          displayNumber: change.number,
          displayTitle: `${change.kind} change authorization`,
          lifecycleStatus: change.status,
          baselineRelationship: 'POST_RELEASE_CHANGE',
          requirementClass: definition.requirement,
          inclusionStatus:
            change.checksum &&
            [
              'APPROVED',
              'IMPLEMENTED',
              'VERIFIED',
              'VALIDATED',
              'CLOSED',
            ].includes(String(change.status).toUpperCase())
              ? 'INCLUDED'
              : 'MISSING',
          omissionReason: null,
          retainedArtifactPath: null,
          metadata: { policyKey: definition.key },
        });
      if (changes.rows.length) continue;
    }
    if (definition.key === 'engineering_package') {
      const pkg = engineeringPackage.rows[0];
      add({
        category: definition.category,
        evidenceType: 'ENGINEERING_PACKAGE',
        sourceTable: 'engineering_packages',
        sourceRecordId: pkg?.id ?? `missing:${release.id}`,
        sourceRevision: pkg?.package_revision ?? null,
        sourceGeneration: null,
        sourceChecksum:
          pkg?.package_checksum ??
          (pkg?.package_snapshot
            ? sha256(canonicalizeDhfManifest(pkg.package_snapshot))
            : null),
        displayNumber: pkg?.package_number ?? null,
        displayTitle: definition.title,
        lifecycleStatus: pkg?.package_status ?? null,
        baselineRelationship: 'RELEASE_CONFIGURATION',
        requirementClass: definition.requirement,
        inclusionStatus:
          pkg?.package_status === 'LOCKED' ? 'INCLUDED' : 'MISSING',
        omissionReason: null,
        retainedArtifactPath: null,
        metadata: {
          policyKey: definition.key,
          itemCount: pkg?.item_count ?? 0,
        },
      });
      continue;
    }
    if (matches.length) {
      for (const item of matches)
        add({
          category: definition.category,
          evidenceType: item.baseline_category,
          sourceTable:
            item.source_table ?? 'engineering_release_baseline_items',
          sourceRecordId: item.source_record_id ?? item.id,
          sourceRevision: item.source_revision,
          sourceGeneration: null,
          sourceChecksum: item.source_checksum,
          displayNumber: item.source_record_id,
          displayTitle: definition.title,
          lifecycleStatus: item.source_status,
          baselineRelationship:
            sequence === 1
              ? 'INITIAL_RELEASE'
              : 'CURRENT_OR_PREDECESSOR_REFERENCE',
          requirementClass: definition.requirement,
          inclusionStatus: item.source_checksum ? 'INCLUDED' : 'MISSING',
          omissionReason: null,
          retainedArtifactPath:
            item.immutable_snapshot?.retainedArtifactPath ?? null,
          metadata: { policyKey: definition.key, baselineItemId: item.id },
        });
      continue;
    }
    add({
      category: definition.category,
      evidenceType: definition.key,
      sourceTable: 'engineering_release_baseline_items',
      sourceRecordId: `missing:${definition.key}`,
      sourceRevision: null,
      sourceGeneration: null,
      sourceChecksum: null,
      displayNumber: null,
      displayTitle: definition.title,
      lifecycleStatus: null,
      baselineRelationship: 'EXPECTED_BY_POLICY',
      requirementClass: definition.requirement,
      inclusionStatus: release.metadata?.legacyImported
        ? 'LEGACY_MISSING'
        : 'MISSING',
      omissionReason: null,
      retainedArtifactPath: null,
      metadata: { policyKey: definition.key },
    });
  }
  for (const copy of copyExceptions.rows)
    add({
      category: '11-Approvals-and-Audit',
      evidenceType: 'CONTROLLED_COPY_EXCEPTION',
      sourceTable: 'controlled_printed_copies',
      sourceRecordId: copy.id,
      sourceRevision: copy.source_revision,
      sourceGeneration: null,
      sourceChecksum: copy.issued_pdf_checksum,
      displayNumber: copy.copy_number,
      displayTitle: `Material controlled-copy exception: ${copy.lifecycle_status}`,
      lifecycleStatus: copy.lifecycle_status,
      baselineRelationship: 'AUDIT_EXCEPTION',
      requirementClass: 'OPTIONAL',
      inclusionStatus: 'INCLUDED',
      omissionReason: null,
      retainedArtifactPath: null,
      metadata: {},
    });
  return results
    .sort((a, b) =>
      `${a.category}|${a.evidenceType}|${a.sourceRecordId}`.localeCompare(
        `${b.category}|${b.evidenceType}|${b.sourceRecordId}`
      )
    )
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));
}
function manifestPayload(
  release: any,
  items: ManifestItem[],
  predecessor: any
) {
  return {
    manifestSchemaVersion: DHF_MANIFEST_SCHEMA_VERSION,
    project: {
      rdProjectId: release.rd_project_id,
      designControlRecordId: release.design_control_record_id,
    },
    release: {
      engineeringReleaseId: release.id,
      baselineId: release.baseline_id,
      revision: release.release_revision,
      sequence: releaseSequence(release.release_revision),
      baselineChecksum: release.baseline_checksum,
    },
    predecessor: predecessor
      ? {
          versionId: predecessor.id,
          versionNumber: predecessor.version_number,
          manifestChecksum: predecessor.manifest_checksum,
        }
      : null,
    items: items.map(({ metadata, ...item }) => ({
      ...item,
      metadata,
    })),
  };
}
export async function previewDesignHistoryFile(releaseId: string) {
  const client = await pgPool.connect();
  try {
    const release = await loadRelease(client, releaseId);
    const predecessor = await one(
      client,
      `SELECT v.* FROM design_history_file_versions v
       JOIN design_history_files d ON d.id=v.design_history_file_id
       WHERE d.rd_project_id=$1 AND v.generation_status IN ('LOCKED','SUPERSEDED')
       ORDER BY v.version_number DESC LIMIT 1`,
      [release.rd_project_id]
    );
    const items = await collectManifestItems(client, release);
    const blockingItems = items.filter(
      (item) =>
        ['REQUIRED', 'CONDITIONALLY_REQUIRED'].includes(
          item.requirementClass
        ) && item.inclusionStatus !== 'INCLUDED'
    );
    const checksumFailures = items.filter(
      (item) => item.inclusionStatus === 'INCLUDED' && !item.sourceChecksum
    );
    const manifest = manifestPayload(release, items, predecessor);
    return {
      ready:
        release.release_status === 'RELEASED' &&
        release.baseline_status === 'LOCKED' &&
        Boolean(release.baseline_checksum) &&
        blockingItems.length === 0 &&
        checksumFailures.length === 0,
      release,
      manifest,
      manifestChecksum: sha256(canonicalizeDhfManifest(manifest)),
      expectedCount: items.length,
      includedCount: items.filter((item) => item.inclusionStatus === 'INCLUDED')
        .length,
      blockingItems,
      checksumFailures,
      warnings: items.filter((item) =>
        ['LEGACY_MISSING', 'LEGACY_UNVERIFIED'].includes(item.inclusionStatus)
      ),
      controlledCopyExceptions: items.filter(
        (item) => item.evidenceType === 'CONTROLLED_COPY_EXCEPTION'
      ),
      engineeringPackageStatus: items.find(
        (item) => item.evidenceType === 'ENGINEERING_PACKAGE'
      ),
    };
  } finally {
    client.release();
  }
}
async function createCoverPdf(
  dhfNumber: string,
  release: any,
  checksum: string
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText('DESIGN HISTORY FILE', { x: 54, y: 720, size: 22, font: bold });
  for (const [index, line] of [
    `DHF: ${dhfNumber}`,
    `Engineering Release: ${release.release_number} Rev ${release.release_revision}`,
    `R&D Design Project: ${release.rd_project_id}`,
    `Manifest SHA-256: ${checksum}`,
    'Checksummed evidence manifest; source systems remain authoritative.',
    'Generation does not by itself establish AS9100 compliance.',
  ].entries())
    page.drawText(line, { x: 54, y: 675 - index * 30, size: 10, font });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
async function buildExport(
  dhfNumber: string,
  release: any,
  manifest: unknown,
  checksum: string,
  items: ManifestItem[]
) {
  const zip = new JSZip();
  const root = `${safeDhfSegment(dhfNumber)}-Rev-${safeDhfSegment(release.release_revision)}`;
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const cover = await createCoverPdf(dhfNumber, release, checksum);
  zip.file(`${root}/00-DHF-Cover-and-Index.pdf`, cover);
  zip.file(`${root}/00-DHF-Manifest.json`, manifestText);
  const sums = [
    `${sha256(cover)}  00-DHF-Cover-and-Index.pdf`,
    `${sha256(manifestText)}  00-DHF-Manifest.json`,
  ];
  const used = new Set<string>();
  for (const item of items) {
    let archivePath = safeExportPath(
      item.category,
      item.sortOrder,
      item.displayTitle
    );
    while (used.has(archivePath))
      archivePath = archivePath.replace(
        /\.json$/,
        `-${safeDhfSegment(item.sourceRecordId)}.json`
      );
    used.add(archivePath);
    const evidenceIndex = `${JSON.stringify(item, null, 2)}\n`;
    zip.file(`${root}/${archivePath}`, evidenceIndex);
    sums.push(`${sha256(evidenceIndex)}  ${archivePath}`);
    if (
      item.inclusionStatus === 'INCLUDED' &&
      item.retainedArtifactPath &&
      !item.retainedArtifactPath.startsWith('internal://')
    ) {
      const approvedRoot = path.resolve(process.cwd(), 'uploads');
      const artifactPath = path.resolve(item.retainedArtifactPath);
      if (
        artifactPath !== approvedRoot &&
        !artifactPath.startsWith(`${approvedRoot}${path.sep}`)
      )
        throw new DesignHistoryFileError(
          'DHF_EXTERNAL_EVIDENCE_INGESTION_REQUIRED',
          'Mutable or external evidence must be ingested into approved retained storage',
          409,
          { sourceRecordId: item.sourceRecordId }
        );
      const artifact = await fs.readFile(artifactPath);
      if (item.sourceChecksum && sha256(artifact) !== item.sourceChecksum)
        throw new DesignHistoryFileError(
          'DHF_ITEM_CHECKSUM_MISMATCH',
          'Retained source evidence failed checksum verification',
          409,
          { sourceRecordId: item.sourceRecordId }
        );
      let binaryPath = archivePath.replace(
        /\.json$/,
        `-${safeDhfSegment(path.basename(artifactPath))}`
      );
      while (used.has(binaryPath))
        binaryPath = binaryPath.replace(
          /(\.[^.]+)?$/,
          `-${safeDhfSegment(item.sourceRecordId)}$1`
        );
      used.add(binaryPath);
      zip.file(`${root}/${binaryPath}`, artifact);
      sums.push(`${sha256(artifact)}  ${binaryPath}`);
    }
  }
  zip.file(`${root}/00-SHA256SUMS.txt`, `${sums.sort().join('\n')}\n`);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    platform: 'UNIX',
  });
}
async function recordEvent(
  client: PoolClient,
  dhfId: string,
  versionId: string | null,
  type: string,
  actor: DhfActor,
  reason: string,
  after: unknown,
  manifestChecksum?: string | null,
  exportChecksum?: string | null
) {
  await client.query(
    `INSERT INTO design_history_file_events
      (design_history_file_id,design_history_file_version_id,event_type,actor_user_id,
       actor_snapshot,reason,after_values,manifest_checksum,export_checksum)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9)`,
    [
      dhfId,
      versionId,
      type,
      actor.id,
      JSON.stringify(actorSnapshot(actor)),
      reason,
      JSON.stringify(after ?? null),
      manifestChecksum ?? null,
      exportChecksum ?? null,
    ]
  );
}
export async function generateDesignHistoryFile(input: {
  releaseId: string;
  actor: DhfActor;
  reason: string;
  authorizedOmissions?: Array<{ policyKey: string; reason: string }>;
}) {
  const client = await pgPool.connect();
  let stagedPath: string | null = null;
  try {
    await client.query('BEGIN');
    const release = await loadRelease(client, input.releaseId, true);
    await client.query(
      `SELECT id FROM engineering_release_baselines
       WHERE id=$1 FOR UPDATE`,
      [release.baseline_id]
    );
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('dhf:' || $1::text))`,
      [release.rd_project_id]
    );
    const existing = await one(
      client,
      `SELECT v.*,d.dhf_number FROM design_history_file_versions v
       JOIN design_history_files d ON d.id=v.design_history_file_id
       WHERE v.engineering_release_id=$1`,
      [release.id]
    );
    if (existing) {
      await client.query('COMMIT');
      return { status: 'existing' as const, version: existing };
    }
    const preview = await (async () => {
      const predecessor = await one(
        client,
        `SELECT v.* FROM design_history_file_versions v
         JOIN design_history_files d ON d.id=v.design_history_file_id
         WHERE d.rd_project_id=$1 AND v.generation_status IN ('LOCKED','SUPERSEDED')
         ORDER BY v.version_number DESC LIMIT 1`,
        [release.rd_project_id]
      );
      const items = await collectManifestItems(client, release);
      for (const omission of input.authorizedOmissions ?? []) {
        if (!omission.reason?.trim())
          throw new DesignHistoryFileError(
            'DHF_OMISSION_JUSTIFICATION_REQUIRED',
            'Every authorized omission requires a justification',
            422
          );
        const item = items.find(
          (candidate) =>
            candidate.metadata.policyKey === omission.policyKey &&
            candidate.inclusionStatus !== 'INCLUDED'
        );
        if (!item)
          throw new DesignHistoryFileError(
            'DHF_OMISSION_ITEM_NOT_FOUND',
            'Authorized omission does not match missing expected evidence',
            422
          );
        if (item.requirementClass === 'REQUIRED')
          throw new DesignHistoryFileError(
            'DHF_REQUIRED_EVIDENCE_CANNOT_BE_OMITTED',
            'Required DHF evidence cannot be administratively omitted',
            422
          );
        item.requirementClass = 'NOT_APPLICABLE_WITH_JUSTIFICATION';
        item.inclusionStatus = 'AUTHORIZED_OMISSION';
        item.omissionReason = omission.reason.trim();
        item.metadata.omissionAuthorizedBy = actorSnapshot(input.actor);
      }
      const manifest = manifestPayload(release, items, predecessor);
      const blocking = items.filter(
        (item) =>
          ['REQUIRED', 'CONDITIONALLY_REQUIRED'].includes(
            item.requirementClass
          ) &&
          !['INCLUDED', 'AUTHORIZED_OMISSION'].includes(item.inclusionStatus)
      );
      return { predecessor, items, manifest, blocking };
    })();
    if (
      release.release_status !== 'RELEASED' ||
      release.baseline_status !== 'LOCKED' ||
      !release.baseline_checksum ||
      preview.blocking.length
    )
      throw new DesignHistoryFileError(
        'DHF_NOT_READY',
        'Required immutable release evidence is incomplete',
        422,
        { blockingItems: preview.blocking }
      );
    let dhf = await one(
      client,
      `SELECT * FROM design_history_files WHERE rd_project_id=$1 FOR UPDATE`,
      [release.rd_project_id]
    );
    if (!dhf) {
      const sequence = await one(
        client,
        `SELECT nextval('design_history_file_number_seq') value`
      );
      dhf = await one(
        client,
        `INSERT INTO design_history_files
          (rd_project_id,design_control_record_id,dhf_number,owner_user_id,owner_snapshot)
         VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
        [
          release.rd_project_id,
          release.design_control_record_id,
          `DHF-${String(sequence.value).padStart(6, '0')}`,
          input.actor.id,
          JSON.stringify(actorSnapshot(input.actor)),
        ]
      );
    }
    const versionNumber = Number(dhf.current_version) + 1;
    const manifestChecksum = sha256(canonicalizeDhfManifest(preview.manifest));
    const version = await one(
      client,
      `INSERT INTO design_history_file_versions
       (design_history_file_id,engineering_release_id,release_baseline_id,
        engineering_package_id,version_number,release_revision,release_sequence,
        predecessor_version_id,manifest_schema_version,canonical_manifest,
        manifest_checksum,item_count,generation_status,generated_by_user_id,
        generated_by_snapshot,approval_evidence,correction_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,'VALIDATING',$13,$14::jsonb,$15::jsonb,$16)
       RETURNING *`,
      [
        dhf.id,
        release.id,
        release.baseline_id,
        preview.items.find(
          (item) => item.evidenceType === 'ENGINEERING_PACKAGE'
        )?.sourceRecordId ?? null,
        versionNumber,
        release.release_revision,
        releaseSequence(release.release_revision),
        preview.predecessor?.id ?? null,
        DHF_MANIFEST_SCHEMA_VERSION,
        JSON.stringify(preview.manifest),
        manifestChecksum,
        preview.items.length,
        input.actor.id,
        JSON.stringify(actorSnapshot(input.actor)),
        JSON.stringify({
          engineeringReleaseStatus: release.release_status,
          baselineStatus: release.baseline_status,
          generatedBy: actorSnapshot(input.actor),
        }),
        input.reason,
      ]
    );
    if (
      !release.recorded_baseline_checksum &&
      !release.metadata?.legacyImported
    )
      await client.query(
        `UPDATE engineering_release_baselines SET baseline_checksum=$2
         WHERE id=$1 AND baseline_checksum IS NULL`,
        [release.baseline_id, release.baseline_checksum]
      );
    for (const item of preview.items)
      await client.query(
        `INSERT INTO design_history_file_items
         (design_history_file_version_id,category,evidence_type,source_table,
          source_record_id,source_revision,source_generation,source_checksum,
          display_number,display_title,lifecycle_status_snapshot,baseline_relationship,
          requirement_class,inclusion_status,omission_reason,retained_artifact_path,
          sort_order,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)`,
        [
          version.id,
          item.category,
          item.evidenceType,
          item.sourceTable,
          item.sourceRecordId,
          item.sourceRevision,
          item.sourceGeneration,
          item.sourceChecksum,
          item.displayNumber,
          item.displayTitle,
          item.lifecycleStatus,
          item.baselineRelationship,
          item.requirementClass,
          item.inclusionStatus,
          item.omissionReason,
          item.retainedArtifactPath,
          item.sortOrder,
          JSON.stringify(item.metadata),
        ]
      );
    const attempt = 1;
    const stagingDir = path.resolve(
      process.cwd(),
      'uploads',
      'dhf-exports',
      'staging'
    );
    await fs.mkdir(stagingDir, { recursive: true });
    stagedPath = path.join(stagingDir, `${version.id}-${attempt}.zip`);
    await client.query(
      `INSERT INTO design_history_file_exports
       (design_history_file_version_id,export_attempt,export_status,staged_path,
        exporter_version,created_by_user_id,created_by_snapshot)
       VALUES ($1,$2,'STAGED',$3,$4,$5,$6::jsonb)`,
      [
        version.id,
        attempt,
        stagedPath,
        DHF_EXPORTER_VERSION,
        input.actor.id,
        JSON.stringify(actorSnapshot(input.actor)),
      ]
    );
    await client.query('COMMIT');
    let archive: Buffer;
    try {
      archive = await buildExport(
        dhf.dhf_number,
        release,
        preview.manifest,
        manifestChecksum,
        preview.items
      );
      await fs.writeFile(stagedPath, archive, { flag: 'wx' });
    } catch (error) {
      await pgPool.query(
        `UPDATE design_history_file_versions SET generation_status='FAILED',
          failure_details=$2::jsonb WHERE id=$1 AND generation_status='VALIDATING';
         UPDATE design_history_file_exports SET export_status='FAILED',
          failure_details=$2::jsonb WHERE design_history_file_version_id=$1`,
        [version.id, JSON.stringify({ message: String(error) })]
      );
      throw error;
    }
    const exportChecksum = sha256(archive);
    const finalDir = path.resolve(process.cwd(), 'uploads', 'dhf-exports');
    await fs.mkdir(finalDir, { recursive: true });
    const finalPath = path.join(
      finalDir,
      `${safeDhfSegment(dhf.dhf_number)}-v${versionNumber}-${exportChecksum}.zip`
    );
    await fs.rename(stagedPath, finalPath);
    stagedPath = null;
    await client.query('BEGIN');
    const locked = await one(
      client,
      `SELECT * FROM design_history_file_versions WHERE id=$1 FOR UPDATE`,
      [version.id]
    );
    if (
      locked.manifest_checksum !== manifestChecksum ||
      sha256(archive) !== exportChecksum
    )
      throw new DesignHistoryFileError(
        'DHF_FINALIZATION_CHECKSUM_MISMATCH',
        'DHF export checksum validation failed',
        409
      );
    await client.query(
      `UPDATE design_history_file_exports SET export_status='FINALIZED',
        retained_path=$2,provider_key=$2,sha256_checksum=$3,byte_size=$4,finalized_at=now()
       WHERE design_history_file_version_id=$1 AND export_attempt=1;
       UPDATE design_history_file_versions SET generation_status='LOCKED',
        retained_export_path=$2,retained_export_provider_key=$2,export_checksum=$3,
        export_size=$4,export_format='ZIP',exporter_version=$5,locked_at=now()
       WHERE id=$1 AND generation_status='VALIDATING';
       UPDATE design_history_files SET current_version=$6,status='LOCKED',updated_at=now()
       WHERE id=$7;
       UPDATE engineering_packages SET dhf_version_id=$1,
        package_checksum=COALESCE(package_checksum,encode(digest(package_snapshot::text,'sha256'),'hex'))
       WHERE engineering_release_id=$8;
       UPDATE design_history_file_versions SET generation_status='SUPERSEDED',
        superseded_by_version_id=$1
       WHERE id=$9 AND generation_status='LOCKED'`,
      [
        version.id,
        finalPath,
        exportChecksum,
        archive.length,
        DHF_EXPORTER_VERSION,
        versionNumber,
        dhf.id,
        release.id,
        preview.predecessor?.id ?? null,
      ]
    );
    await recordEvent(
      client,
      dhf.id,
      version.id,
      'DHF_GENERATED_LOCKED',
      input.actor,
      input.reason,
      { itemCount: preview.items.length, finalPath },
      manifestChecksum,
      exportChecksum
    );
    await client.query('COMMIT');
    return {
      status: 'created' as const,
      dhf,
      version: {
        ...version,
        generation_status: 'LOCKED',
        retained_export_path: finalPath,
        export_checksum: exportChecksum,
        export_size: archive.length,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (stagedPath) await fs.unlink(stagedPath).catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
export async function getDesignHistoryFileByRelease(releaseId: string) {
  const result = await pgPool.query(
    `SELECT d.*,v.id version_id,v.version_number,v.release_revision,
            v.generation_status,v.manifest_checksum,v.export_checksum,
            v.item_count,v.generated_at,v.locked_at,p.package_status
       FROM design_history_files d
       JOIN design_history_file_versions v ON v.design_history_file_id=d.id
       LEFT JOIN engineering_packages p ON p.id=v.engineering_package_id
      WHERE v.engineering_release_id=$1`,
    [releaseId]
  );
  return result.rows[0] ?? null;
}
export async function getDesignHistoryFile(dhfId: string) {
  const result = await pgPool.query(
    `SELECT * FROM design_history_files WHERE id=$1`,
    [dhfId]
  );
  return result.rows[0] ?? null;
}
export async function listDesignHistoryFileVersions(dhfId: string) {
  return (
    await pgPool.query(
      `SELECT * FROM design_history_file_versions WHERE design_history_file_id=$1
       ORDER BY version_number DESC`,
      [dhfId]
    )
  ).rows;
}
export async function getDesignHistoryFileVersion(
  dhfId: string,
  versionId: string
) {
  const version = (
    await pgPool.query(
      `SELECT * FROM design_history_file_versions
       WHERE id=$1 AND design_history_file_id=$2`,
      [versionId, dhfId]
    )
  ).rows[0];
  if (!version) return null;
  const items = (
    await pgPool.query(
      `SELECT * FROM design_history_file_items
       WHERE design_history_file_version_id=$1 ORDER BY sort_order`,
      [versionId]
    )
  ).rows;
  return { version, items };
}
export async function verifyDesignHistoryFileVersion(
  dhfId: string,
  versionId: string,
  actor?: DhfActor
) {
  const result = await getDesignHistoryFileVersion(dhfId, versionId);
  if (!result)
    throw new DesignHistoryFileError(
      'DHF_VERSION_NOT_FOUND',
      'DHF version not found',
      404
    );
  const manifestChecksum = sha256(
    canonicalizeDhfManifest(result.version.canonical_manifest)
  );
  const exportBytes = result.version.retained_export_path
    ? await fs.readFile(path.resolve(result.version.retained_export_path))
    : null;
  const exportChecksum = exportBytes ? sha256(exportBytes) : null;
  const itemFailures = result.items.filter(
    (item: any) => item.inclusion_status === 'INCLUDED' && !item.source_checksum
  );
  const baseline = await pgPool.query(
    `SELECT baseline_checksum FROM engineering_release_baselines WHERE id=$1`,
    [result.version.release_baseline_id]
  );
  const pkg = result.version.engineering_package_id
    ? await pgPool.query(
        `SELECT package_checksum FROM engineering_packages WHERE id=$1`,
        [result.version.engineering_package_id]
      )
    : { rows: [] };
  const verification = {
    valid:
      manifestChecksum === result.version.manifest_checksum &&
      exportChecksum === result.version.export_checksum &&
      Boolean(baseline.rows[0]?.baseline_checksum) &&
      Boolean(pkg.rows[0]?.package_checksum) &&
      itemFailures.length === 0,
    manifest: {
      expected: result.version.manifest_checksum,
      actual: manifestChecksum,
    },
    export: {
      expected: result.version.export_checksum,
      actual: exportChecksum,
    },
    baselineChecksum: baseline.rows[0]?.baseline_checksum ?? null,
    engineeringPackageChecksum: pkg.rows[0]?.package_checksum ?? null,
    itemFailures,
  };
  if (actor)
    await pgPool.query(
      `INSERT INTO design_history_file_events
       (design_history_file_id,design_history_file_version_id,event_type,
        actor_user_id,actor_snapshot,reason,after_values,manifest_checksum,export_checksum)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9)`,
      [
        dhfId,
        versionId,
        verification.valid ? 'DHF_CHECKSUM_VERIFIED' : 'DHF_CHECKSUM_FAILURE',
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
        'Authenticated DHF checksum verification',
        JSON.stringify(verification),
        manifestChecksum,
        exportChecksum,
      ]
    );
  return verification;
}
export async function getDesignHistoryFileDownload(
  dhfId: string,
  versionId: string,
  actor?: DhfActor
) {
  const result = await getDesignHistoryFileVersion(dhfId, versionId);
  if (!result?.version.retained_export_path)
    throw new DesignHistoryFileError(
      'DHF_EXPORT_NOT_FOUND',
      'Retained DHF export not found',
      404
    );
  const bytes = await fs.readFile(
    path.resolve(result.version.retained_export_path)
  );
  if (sha256(bytes) !== result.version.export_checksum)
    throw new DesignHistoryFileError(
      'DHF_EXPORT_CHECKSUM_MISMATCH',
      'Retained DHF export failed checksum verification',
      409
    );
  if (actor)
    await pgPool.query(
      `INSERT INTO design_history_file_events
       (design_history_file_id,design_history_file_version_id,event_type,
        actor_user_id,actor_snapshot,reason,after_values,manifest_checksum,export_checksum)
       VALUES ($1,$2,'DHF_EXPORT_DOWNLOADED',$3,$4::jsonb,
        'Protected DHF export downloaded',$5::jsonb,$6,$7)`,
      [
        dhfId,
        versionId,
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
        JSON.stringify({ byteSize: bytes.length }),
        result.version.manifest_checksum,
        result.version.export_checksum,
      ]
    );
  return { version: result.version, bytes };
}
export async function getProjectDesignHistoryFile(projectId: string) {
  const result = await pgPool.query(
    `SELECT d.*,v.id version_id,v.version_number,v.release_revision,
            v.generation_status,v.manifest_checksum,v.export_checksum,v.item_count,
            v.generated_at,v.locked_at
       FROM design_history_files d
       LEFT JOIN design_history_file_versions v
         ON v.design_history_file_id=d.id AND v.version_number=d.current_version
      WHERE d.rd_project_id=$1`,
    [projectId]
  );
  return result.rows[0] ?? null;
}
