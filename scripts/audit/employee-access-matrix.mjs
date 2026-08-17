import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTROLLED_ACTIONS = [
  ['QC Inspection', 'quality.inspection.perform', 'QC_INSPECTION'],
  ['Routing Release', 'routing.release', 'ROUTING_RELEASE'],
  ['Final QC', 'quality.final_qc.perform', 'FINAL_QC'],
  [
    'Final Product Release',
    'quality.product_release.approve',
    'FINAL_PRODUCT_RELEASE',
  ],
  [
    'Certificate of Conformance approval',
    'quality.coc.approve',
    'COC_APPROVAL',
  ],
  ['Design Review approval', 'design.review.approve', 'DESIGN_REVIEW'],
  [
    'Verification approval',
    'design.verification.approve',
    'DESIGN_VERIFICATION',
  ],
  ['Validation approval', 'design.validation.approve', 'DESIGN_VALIDATION'],
  ['Design Authority action', 'design.authority.act', 'DESIGN_AUTHORITY'],
  ['Engineering Release', 'engineering.release.create', 'ENGINEERING_RELEASE'],
  [
    'Engineering Change Request approval',
    'engineering.ecr.approve',
    'ECR_APPROVAL',
  ],
  [
    'Engineering Change Notice approval',
    'engineering.ecn.approve',
    'ECN_APPROVAL',
  ],
  [
    'Production-change approval',
    'production.change.approve',
    'PRODUCTION_CHANGE',
  ],
  ['Supplier approval', 'purchasing.supplier.approve', 'SUPPLIER_APPROVAL'],
  [
    'Controlled-document approval or release',
    'documents.control.approve',
    'DOCUMENT_RELEASE',
  ],
  [
    'Calibration approval',
    'quality.calibration.approve',
    'CALIBRATION_APPROVAL',
  ],
  ['NCR disposition', 'quality.ncr.disposition', 'NCR_DISPOSITION'],
  ['Corrective-action approval', 'quality.capa.approve', 'CAPA_APPROVAL'],
  ['Formal product hold', 'quality.hold.place', 'PRODUCT_HOLD'],
  ['Formal hold release', 'quality.hold.release', 'HOLD_RELEASE'],
  [
    'Shipping release or shipment confirmation',
    'shipping.confirm',
    'SHIPPING_CONFIRMATION',
  ],
];

const activeAuthorization = (records, type, asOf) =>
  records.find(
    (a) =>
      a.authorizationType === type &&
      a.status === 'ACTIVE' &&
      (!a.effectiveDate || a.effectiveDate <= asOf) &&
      (!a.expirationDate || a.expirationDate > asOf)
  );

export function buildEmployeeAccessMatrix(input) {
  const asOf = input.asOf ?? new Date().toISOString();
  const roleCaps = new Map(Object.entries(input.roleCapabilities ?? {}));
  const rows = [];
  for (const employee of input.employees ?? []) {
    const user =
      (input.users ?? []).find((u) => u.employeeId === employee.id) ?? null;
    const base = new Set(user ? (roleCaps.get(user.role) ?? []) : []);
    const overrides = (input.overrides ?? []).filter(
      (o) => o.userId === user?.id
    );
    for (const override of overrides) {
      if (override.effect === 'allow') base.add(override.capability);
      if (override.effect === 'deny') base.delete(override.capability);
    }
    const authorizations = (input.authorizations ?? []).filter(
      (a) => a.employeeId === employee.id
    );
    const scopedGrants = (input.scopedGrants ?? []).filter(
      (g) => g.userId === user?.id
    );
    const projectAssignments = (input.projectAssignments ?? []).filter(
      (a) => a.employeeId === employee.id || a.userId === user?.id
    );
    const designAssignments = (input.designProjectAssignments ?? []).filter(
      (a) => a.employeeId === employee.id || a.userId === user?.id
    );
    const trainingRecords = (input.trainingRecords ?? []).filter(
      (t) => t.employeeId === employee.id
    );
    const certifications = (input.certifications ?? []).filter(
      (c) => c.employeeId === employee.id
    );
    const legacyRecords = (input.legacyP2Certifications ?? []).filter(
      (c) => c.employeeId === employee.id
    );
    for (const [action, capability, authorizationType] of CONTROLLED_ACTIONS) {
      const hasPermission = base.has(capability);
      const authorization = activeAuthorization(
        authorizations,
        authorizationType,
        asOf
      );
      const legacy = legacyRecords.length > 0;
      const categories = [];
      if (!user) categories.push('UNLINKED_EMPLOYEE_OR_USER');
      if (hasPermission && !authorization)
        categories.push('PERMISSION_WITHOUT_DOCUMENTED_AUTHORITY');
      if (!hasPermission && authorization)
        categories.push('AUTHORITY_WITHOUT_REQUIRED_PERMISSION');
      if (legacy && !authorization)
        categories.push('CURRENT_ACCESS_LEGACY_COMPATIBILITY');
      if (hasPermission && authorization)
        categories.push('CURRENT_ACCESS_DOCUMENTED');
      if (!hasPermission && !authorization && !legacy && user)
        categories.push('NO_CHANGE_RECOMMENDED');
      const allowedNow = Boolean(
        user?.isActive && employee.isActive && hasPermission
      );
      rows.push({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber ?? '',
        employeeName: employee.name,
        employmentStatus: employee.employmentStatus,
        department: employee.department ?? '',
        jobTitle: employee.jobTitle ?? '',
        userId: user?.id ?? '',
        username: user?.username ?? '',
        userStatus: user
          ? user.isActive
            ? (user.accessStatus ?? 'ACTIVE')
            : 'INACTIVE'
          : 'UNLINKED',
        legacyRole: user?.role ?? '',
        roleBasedCapabilities: [...(roleCaps.get(user?.role) ?? [])]
          .sort()
          .join('|'),
        allowOverrides: overrides
          .filter((o) => o.effect === 'allow')
          .map((o) => o.capability)
          .sort()
          .join('|'),
        denyOverrides: overrides
          .filter((o) => o.effect === 'deny')
          .map((o) => o.capability)
          .sort()
          .join('|'),
        scopedGrants: scopedGrants
          .map(
            (g) =>
              `${g.capability}:${g.scopeType}:${g.department ?? g.projectId ?? ''}`
          )
          .sort()
          .join('|'),
        projectAssignments: projectAssignments
          .map((a) => `${a.projectId}:${a.projectRole ?? ''}`)
          .sort()
          .join('|'),
        designProjectAssignments: designAssignments
          .map((a) => `${a.projectId}:${a.approvalKey ?? a.projectRole ?? ''}`)
          .sort()
          .join('|'),
        trainingRecords: trainingRecords
          .map((t) => `${t.trainingId ?? t.name}:${t.status ?? ''}`)
          .sort()
          .join('|'),
        certifications: certifications
          .map((c) => `${c.certificationId ?? c.name}:${c.status ?? ''}`)
          .sort()
          .join('|'),
        legacyP2Certifications: legacyRecords
          .map((c) => `${c.partNumber ?? ''}:${c.department ?? ''}`)
          .sort()
          .join('|'),
        action,
        capability,
        hasPermission,
        activeAuthorizationId: authorization?.id ?? '',
        authorizationType,
        authorizationStatus: authorization?.status ?? '',
        scope: authorization?.scope ?? '',
        effectiveDate: authorization?.effectiveDate ?? '',
        expirationDate: authorization?.expirationDate ?? '',
        qualificationMethod: authorization?.qualificationMethod ?? '',
        evidenceReference: authorization?.evidenceReference ?? '',
        approver: authorization?.approver ?? '',
        limitations: authorization?.limitations ?? '',
        allowedNow,
        currentReason: allowedNow
          ? `Resolved capability ${capability} under current compatibility behavior; this audit generator does not activate prospective enforcement`
          : 'No resolved capability or inactive/unlinked identity',
        categories: [...new Set(categories)].join('|'),
      });
    }
  }
  return rows;
}

const csv = (rows) => {
  const headers = Object.keys(rows[0] ?? {});
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    headers.map(quote).join(','),
    ...rows.map((row) => headers.map((h) => quote(row[h])).join(',')),
  ].join('\n');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error(
      'Usage: node employee-access-matrix.mjs <input.json> <output.csv|output.json>'
    );
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  if (
    data.dataClassification !== 'SYNTHETIC' &&
    process.env.ALLOW_READ_ONLY_PRODUCTION_AUDIT !== 'true'
  ) {
    throw new Error(
      'Refusing non-synthetic input without ALLOW_READ_ONLY_PRODUCTION_AUDIT=true'
    );
  }
  const rows = buildEmployeeAccessMatrix(data);
  const body = outputPath.endsWith('.json')
    ? JSON.stringify(
        { dataClassification: data.dataClassification, rows },
        null,
        2
      )
    : csv(rows);
  fs.writeFileSync(path.resolve(outputPath), body + '\n', { flag: 'wx' });
  console.log(`Wrote ${rows.length} employee/action rows to ${outputPath}`);
}
