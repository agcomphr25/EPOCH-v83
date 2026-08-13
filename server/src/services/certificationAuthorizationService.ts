import { pool } from '../../db';

export type AuthorizationType =
  | 'WORK'
  | 'QC_INSPECTION'
  | 'ROUTING_RELEASE'
  | 'FINAL_QC'
  | 'FINAL_PRODUCT_RELEASE'
  | 'COC_APPROVAL';

export function prospectiveAuthorizationEnforcementEnabled() {
  return process.env.CERTIFICATION_AUTHORIZATION_ENFORCEMENT === 'true';
}

export async function requireApplicableAuthorization(input: {
  employeeId: number;
  userId?: number | null;
  type: AuthorizationType;
  program: string;
  partNumber?: string | null;
  productFamily?: string | null;
  department?: string | null;
  operation?: string | null;
  actionType:
    | 'TRAVELER_START'
    | 'QC_ACCEPTANCE'
    | 'ROUTING_RELEASE'
    | 'FINAL_PRODUCT_RELEASE'
    | 'COC_APPROVAL';
  evidence?: Record<string, unknown>;
}) {
  if (!prospectiveAuthorizationEnforcementEnabled()) return null;
  const result = await pool.query(
    `SELECT a.*
       FROM certification_authorizations a
      WHERE a.employee_id=$1 AND a.authorization_type=$2 AND a.program=$3
        AND a.status='ACTIVE' AND a.effective_date <= now()
        AND (a.expiration_date IS NULL OR a.expiration_date > now())
        AND (a.part_number IS NULL OR a.part_number=$4)
        AND (a.product_family IS NULL OR a.product_family=$5)
        AND (a.department IS NULL OR lower(a.department)=lower($6))
        AND (a.operation_scope IS NULL OR lower(a.operation_scope)=lower($7))
      ORDER BY a.part_number NULLS LAST, a.operation_scope NULLS LAST
      LIMIT 1`,
    [
      input.employeeId,
      input.type,
      input.program,
      input.partNumber ?? null,
      input.productFamily ?? null,
      input.department ?? null,
      input.operation ?? null,
    ]
  );
  const authorization = (result as any[])[0];
  if (!authorization) {
    const error: any = new Error(
      `Active ${input.type} authorization is required for this employee and exact scope.`
    );
    error.code = 'CERTIFICATION_AUTHORIZATION_REQUIRED';
    error.status = 403;
    throw error;
  }
  await pool.query(
    `INSERT INTO certification_authorization_use_snapshots
      (authorization_id,authorization_revision,action_type,employee_id,user_id,part_number,product_family,
       qualification_status,effective_date,expiration_date,approver_user_id,evidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$9,$10,$11::jsonb)`,
    [
      authorization.id,
      authorization.revision,
      input.actionType,
      input.employeeId,
      input.userId ?? null,
      input.partNumber ?? null,
      input.productFamily ?? null,
      authorization.effective_date,
      authorization.expiration_date,
      authorization.approved_by_user_id,
      JSON.stringify(input.evidence ?? {}),
    ]
  );
  return authorization;
}
