/**
 * CMMC 2.0 Level 2 — Evidence Mapping
 *
 * Links each NIST SP 800-171 practice to:
 *  - In-system evidence (audit tables, forensic rules, permission capabilities, schema tables)
 *  - An initial seeded status reflecting what this system currently implements
 *
 * Evidence types:
 *   audit_log      — satisfied by audit_events table / auditService
 *   forensic_rule  — satisfied by a DCAA forensic rule (by ruleId)
 *   permission     — satisfied by RBAC / permission capability in permissionService
 *   schema_table   — satisfied by existence of a specific DB table / column
 *   vault          — satisfied by the secure document vault
 *   policy_only    — requires a procedural/policy document from admin
 */

export type EvidenceType =
  | 'audit_log'
  | 'forensic_rule'
  | 'permission'
  | 'schema_table'
  | 'vault'
  | 'policy_only';

export type ControlStatus = 'implemented' | 'partial' | 'planned' | 'not_applicable';

export interface EvidenceLink {
  evidenceType: EvidenceType;
  evidenceRef: string;
  evidenceDescription: string;
}

export interface ControlMapping {
  practiceId: string;
  seedStatus: ControlStatus;
  evidenceLinks: EvidenceLink[];
  gapNote?: string;
}

/**
 * Seed mappings — one entry per practice.
 * Practices not listed here will default to 'planned' with no evidence.
 */
export const CMMC_EVIDENCE_MAPPING: ControlMapping[] = [
  // ── AC: Access Control ────────────────────────────────────────────────────
  {
    practiceId: '3.1.1',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'authenticateToken middleware', evidenceDescription: 'All API routes require a valid session token; unauthenticated requests are rejected with HTTP 401.' },
      { evidenceType: 'schema_table', evidenceRef: 'users table (server/schema.ts)', evidenceDescription: 'User accounts are stored in the users table with role-based access levels enforced at every route.' },
    ],
  },
  {
    practiceId: '3.1.2',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'requireAdminOrOwner / requireScopedCapability', evidenceDescription: 'Route-level middleware limits each endpoint to only the roles/capabilities authorized for that transaction type (RBAC via permissionService.ts).' },
    ],
  },
  {
    practiceId: '3.1.3',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'vault', evidenceRef: 'vault_documents.classification', evidenceDescription: 'CUI documents are classified (cui/itar) in the vault; access is gated by vault_access_grants. Flow enforcement outside the vault requires policy documentation.' },
    ],
    gapNote: 'CUI flow controls exist in the vault but are not enforced system-wide for all data paths. Policy document required.',
  },
  {
    practiceId: '3.1.4',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'forensic_rule', evidenceRef: 'TK-003', evidenceDescription: 'Forensic rule TK-003 detects and blocks self-approval of timesheets — enforces separation of duties for time approval workflows.' },
      { evidenceType: 'permission', evidenceRef: 'requireScopedCapability (work_orders.release)', evidenceDescription: 'Scoped capability grants prevent the same user from both creating and releasing work orders.' },
    ],
  },
  {
    practiceId: '3.1.5',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'permissionService — least-privilege scoped capabilities', evidenceDescription: 'Users are granted only the specific scoped capabilities needed for their role; all other routes return 403 Forbidden.' },
    ],
  },
  {
    practiceId: '3.1.6',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'users.role (ADMIN/OWNER/CSR/OPERATOR)', evidenceDescription: 'Role hierarchy exists; non-admin users are assigned lower-privilege roles.' },
    ],
    gapNote: 'System enforces role hierarchy but does not explicitly track when admins use privileged vs. non-privileged accounts. Policy document recommended.',
  },
  {
    practiceId: '3.1.7',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'audit_events (action=PRIVILEGED_ACTION)', evidenceDescription: 'Privileged operations (admin overrides, scrap authorization, permission grants) are written to the immutable audit_events log.' },
      { evidenceType: 'permission', evidenceRef: 'requireAdminOrOwner', evidenceDescription: 'Privileged functions are gated to ADMIN/OWNER roles; non-privileged users receive HTTP 403.' },
    ],
  },
  {
    practiceId: '3.1.8',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'users.loginAttempts / users.lockedUntil', evidenceDescription: 'Login attempt tracking fields exist in the users schema.' },
    ],
    gapNote: 'Account lockout policy logic is partially implemented. Verify lockout threshold is enforced and documented.',
  },
  {
    practiceId: '3.1.9',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'Privacy/security notices at login are not confirmed as implemented. Policy notice text and login banner must be documented.',
  },
  {
    practiceId: '3.1.10',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Session lock (screen saver / inactivity lock) is a client-side or OS-level control. Policy document and OS configuration baseline required.',
  },
  {
    practiceId: '3.1.11',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'audit_events (entityType=user_session, action=SESSION_EXPIRED)', evidenceDescription: 'Session termination events are logged in audit_events when JWT tokens expire or sessions are invalidated.' },
      { evidenceType: 'schema_table', evidenceRef: 'users.tokenExpiry / JWT expiration', evidenceDescription: 'JWT tokens carry an expiration claim; expired tokens are rejected by authenticateToken middleware.' },
    ],
  },
  {
    practiceId: '3.1.12',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'audit_events (entityType=user_session)', evidenceDescription: 'Session lifecycle events (login, logout, expiry) are captured in the audit log.' },
    ],
    gapNote: 'Remote access monitoring is partially implemented via session audit. Full remote access session recording and monitoring policy required.',
  },
  {
    practiceId: '3.1.13',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'TLS/HTTPS is enforced at the infrastructure level (Replit deployment). Document cryptographic mechanism and certificate management policy.',
  },
  {
    practiceId: '3.1.14',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Remote access routing via managed access control points — network architecture documentation and policy required.',
  },
  {
    practiceId: '3.1.15',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'requireAdminOrOwner for privileged remote endpoints', evidenceDescription: 'Privileged remote commands require ADMIN/OWNER role validation.' },
    ],
    gapNote: 'Document which privileged commands may be executed remotely and confirm operational need is documented.',
  },
  {
    practiceId: '3.1.16',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Wireless access authorization policy required (applies to facility WiFi, not application layer).',
  },
  {
    practiceId: '3.1.17',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Wireless access protection policy and network configuration documentation required.',
  },
  {
    practiceId: '3.1.18',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Mobile device management (MDM) policy required if employees access the system from mobile devices.',
  },
  {
    practiceId: '3.1.19',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'CUI encryption on mobile — policy and MDM configuration documentation required.',
  },
  {
    practiceId: '3.1.20',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'External system connections (integrations) are managed via the integrations layer. Formal external connection inventory and approval process documentation required.',
  },
  {
    practiceId: '3.1.21',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Portable storage control policy required.',
  },
  {
    practiceId: '3.1.22',
    seedStatus: 'not_applicable',
    evidenceLinks: [],
    gapNote: 'No CUI is posted on publicly accessible systems.',
  },

  // ── AT: Awareness and Training ───────────────────────────────────────────
  {
    practiceId: '3.2.1',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'employee_onboarding (server/schema.ts)', evidenceDescription: 'Employee onboarding sessions are tracked; training completion events flow through the audit service.' },
    ],
    gapNote: 'Security awareness training content and completion records must be documented. Upload training policy to vault.',
  },
  {
    practiceId: '3.2.2',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'employee_machine_qualifications (server/schema.ts)', evidenceDescription: 'Role-based operational qualifications are tracked per employee for machine classes and operations.' },
    ],
    gapNote: 'Role-based security training (not just operational training) needs to be documented and tracked.',
  },
  {
    practiceId: '3.2.3',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Insider threat awareness training program documentation required.',
  },

  // ── AU: Audit and Accountability ─────────────────────────────────────────
  {
    practiceId: '3.3.1',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'audit_events table (server/schema.ts)', evidenceDescription: 'Immutable audit event log captures all entity changes with actor, timestamp, fields changed, IP address, and user agent. AuditService.logEvent() throws on failure — no silent inserts.' },
      { evidenceType: 'forensic_rule', evidenceRef: 'TK-005', evidenceDescription: 'Forensic rule TK-005 verifies every punch edit has a corresponding audit trail entry; violations are flagged as findings.' },
    ],
  },
  {
    practiceId: '3.3.2',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'audit_events.actorId / actorName / actorRole', evidenceDescription: 'Every audit event captures the actor identity (user ID, display name, role) enabling full accountability tracing.' },
      { evidenceType: 'audit_log', evidenceRef: 'audit_events.ipAddress / userAgent', evidenceDescription: 'IP address and user agent are captured on every audit event for forensic attribution.' },
    ],
  },
  {
    practiceId: '3.3.3',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'audit_settings table — per-event-type enable/disable', evidenceDescription: 'Audit settings allow toggling non-critical event types; critical events cannot be disabled.' },
    ],
    gapNote: 'Formal event review schedule and process documentation required. Establish periodic review cadence policy.',
  },
  {
    practiceId: '3.3.4',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'AuditService.logEvent() throws on failure', evidenceDescription: 'The audit service throws (rather than silently failing) if an insert fails, propagating failure up the call stack.' },
    ],
    gapNote: 'Automated alerting on audit log failure (e.g., DB write errors) needs monitoring/alerting infrastructure documentation.',
  },
  {
    practiceId: '3.3.5',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'forensic_rule', evidenceRef: 'TK-001 through TK-009', evidenceDescription: 'DCAA forensic scan correlates audit records across punch edits, approvals, and charge codes to surface violations.' },
    ],
    gapNote: 'Cross-system audit correlation for security events (not just timekeeping) requires a SIEM or log aggregation policy.',
  },
  {
    practiceId: '3.3.6',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'GET /api/audit/events/:entityType/:entityId', evidenceDescription: 'Audit history is queryable by entity with filtering; report generation endpoint exists at /api/cmmc/export.' },
    ],
    gapNote: 'Formal audit report generation tool is provided via CMMC SSP export. Automated reduction tools may require additional configuration.',
  },
  {
    practiceId: '3.3.7',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'NTP/authoritative time source configuration at the server/OS level must be documented.',
  },
  {
    practiceId: '3.3.8',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'audit_events table — no DELETE or UPDATE permitted via application', evidenceDescription: 'The AuditService only inserts to audit_events; no update/delete route exists. Forensic immutability is enforced by application design.' },
      { evidenceType: 'permission', evidenceRef: 'requireAdminOrOwner for /api/audit/settings', evidenceDescription: 'Audit settings management is restricted to ADMIN/OWNER roles.' },
    ],
  },
  {
    practiceId: '3.3.9',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'requireAdminOrOwner for audit management endpoints', evidenceDescription: 'Management of audit logging (settings, event types) is restricted to ADMIN and OWNER roles only.' },
    ],
  },

  // ── CM: Configuration Management ─────────────────────────────────────────
  {
    practiceId: '3.4.1',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Baseline configuration inventory for hardware, software, and firmware requires a formal CMDB or asset register. Asset tracking exists but formal baseline documentation needed.',
  },
  {
    practiceId: '3.4.2',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Security configuration settings (CIS benchmarks, hardening guides) must be documented and enforced.',
  },
  {
    practiceId: '3.4.3',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'audit_events (action=CONFIGURATION_CHANGE)', evidenceDescription: 'System configuration changes flow through the audit service.' },
    ],
    gapNote: 'Formal change control board process and change tracking for production infrastructure required.',
  },
  {
    practiceId: '3.4.4',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Security impact analysis process for changes must be documented.',
  },
  {
    practiceId: '3.4.5',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'requireAdminOrOwner for schema migration endpoints', evidenceDescription: 'Schema changes and production deployments require privileged access.' },
    ],
    gapNote: 'Physical and logical access restriction policy for configuration changes must be documented.',
  },
  {
    practiceId: '3.4.6',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'Least functionality principle for the application server (disabled unused services, ports, protocols) must be documented.',
  },
  {
    practiceId: '3.4.7',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Nonessential function/port/service restriction policy and network configuration documentation required.',
  },
  {
    practiceId: '3.4.8',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Application execution policy (allowlist/denylist) for authorized software must be documented.',
  },
  {
    practiceId: '3.4.9',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'User-installed software control policy required.',
  },

  // ── IA: Identification and Authentication ─────────────────────────────────
  {
    practiceId: '3.5.1',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'users table — id, username, role', evidenceDescription: 'All system users are identified via unique user records in the users table; devices are tracked via session tokens.' },
    ],
  },
  {
    practiceId: '3.5.2',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'authenticateToken middleware (middleware/auth.ts)', evidenceDescription: 'JWT token authentication is enforced on all protected routes; unauthenticated requests are rejected.' },
      { evidenceType: 'schema_table', evidenceRef: 'users.passwordHash (bcrypt)', evidenceDescription: 'Passwords are stored as bcrypt hashes; plaintext passwords are never stored.' },
    ],
  },
  {
    practiceId: '3.5.3',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Multi-factor authentication is not currently implemented for privileged accounts. MFA implementation required.',
  },
  {
    practiceId: '3.5.4',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'JWT with exp claim and jti (token ID)', evidenceDescription: 'JWT tokens include expiration and are signed; replay protection relies on short token lifetimes.' },
    ],
    gapNote: 'Token replay protection (token revocation list or short-lived token policy) must be documented.',
  },
  {
    practiceId: '3.5.5',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'users.lastLoginAt', evidenceDescription: 'Last login timestamp is tracked per user.' },
    ],
    gapNote: 'Automatic identifier disabling after defined inactivity period must be implemented and documented.',
  },
  {
    practiceId: '3.5.6',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'users.isActive', evidenceDescription: 'User accounts have an isActive flag; inactive accounts can be disabled.' },
    ],
    gapNote: 'Automated disabling of identifiers after defined inactivity period must be enforced and documented.',
  },
  {
    practiceId: '3.5.7',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'Password complexity requirements must be enforced at the application layer and documented.',
  },
  {
    practiceId: '3.5.8',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Password reuse prohibition (N-generation history) must be implemented.',
  },
  {
    practiceId: '3.5.9',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Temporary password change-on-first-login enforcement must be implemented.',
  },
  {
    practiceId: '3.5.10',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'users.passwordHash (bcrypt)', evidenceDescription: 'All passwords are stored as bcrypt hashes; plaintext passwords are never persisted or transmitted.' },
    ],
  },
  {
    practiceId: '3.5.11',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'login endpoint — password field type=password', evidenceDescription: 'Authentication feedback (password field) uses password input type; server response does not echo credential data.' },
    ],
  },

  // ── IR: Incident Response ─────────────────────────────────────────────────
  {
    practiceId: '3.6.1',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'forensic_rule', evidenceRef: 'TK-001 through TK-009', evidenceDescription: 'DCAA forensic scan detects and surfaces compliance violations for investigation — serves as the detection component of incident handling.' },
      { evidenceType: 'audit_log', evidenceRef: 'audit_events — immutable incident record', evidenceDescription: 'The audit log provides the forensic record for incident analysis and response.' },
    ],
    gapNote: 'Formal incident response plan (preparation, containment, recovery procedures) must be documented.',
  },
  {
    practiceId: '3.6.2',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'dcaa_audit_findings — findings tracking', evidenceDescription: 'DCAA findings are tracked with status (open/acknowledged/resolved) providing an incident tracking ledger.' },
    ],
    gapNote: 'Formal incident reporting chain (internal escalation, DCSA/DIBNet reporting) must be documented.',
  },
  {
    practiceId: '3.6.3',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Incident response test/exercise program documentation required.',
  },

  // ── MA: Maintenance ───────────────────────────────────────────────────────
  {
    practiceId: '3.7.1',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Maintenance plan and schedule for information systems documentation required.',
  },
  {
    practiceId: '3.7.2',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Maintenance personnel controls (tools, personnel authorization) policy documentation required.',
  },
  {
    practiceId: '3.7.3',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Equipment sanitization procedures for off-site maintenance policy required.',
  },
  {
    practiceId: '3.7.4',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Media inspection procedures for maintenance diagnostic tools policy required.',
  },
  {
    practiceId: '3.7.5',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Remote maintenance MFA and session termination policy required.',
  },
  {
    practiceId: '3.7.6',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Maintenance personnel supervision policy required.',
  },

  // ── MP: Media Protection ──────────────────────────────────────────────────
  {
    practiceId: '3.8.1',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'vault', evidenceRef: 'vault_documents — classification-controlled document storage', evidenceDescription: 'Digital CUI is stored in the classification-controlled vault (cui/itar) with access grants.' },
    ],
    gapNote: 'Physical media protection policy for paper CUI and digital media at rest must be documented.',
  },
  {
    practiceId: '3.8.2',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'vault', evidenceRef: 'vault_access_grants table', evidenceDescription: 'Vault document access is limited by explicit access grants tied to user IDs.' },
    ],
    gapNote: 'Policy documenting authorized users for CUI media access required.',
  },
  {
    practiceId: '3.8.3',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Media sanitization and disposal procedures required.',
  },
  {
    practiceId: '3.8.4',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'vault', evidenceRef: 'vault_documents.classification field', evidenceDescription: 'Digital documents in the vault carry a classification label (public/internal/cui/itar).' },
    ],
    gapNote: 'Physical media marking procedures for paper CUI required.',
  },
  {
    practiceId: '3.8.5',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'object_access_log table (server/schema.ts)', evidenceDescription: 'CUI document access events are logged in the object_access_log for accountability during transport.' },
    ],
    gapNote: 'Physical media transport procedures and chain-of-custody documentation required.',
  },
  {
    practiceId: '3.8.6',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'Encryption in transit (TLS) covers digital transport. Physical media encryption policy for portable storage devices required.',
  },
  {
    practiceId: '3.8.7',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Removable media usage controls and policy required.',
  },
  {
    practiceId: '3.8.8',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Unidentified portable storage prohibition policy required.',
  },
  {
    practiceId: '3.8.9',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'Backup media CUI confidentiality — backup encryption policy and implementation documentation required.',
  },

  // ── PE: Physical Protection ───────────────────────────────────────────────
  {
    practiceId: '3.9.1',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Physical access control policy and facility access log required.',
  },
  {
    practiceId: '3.9.2',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Facility monitoring and infrastructure protection policy required.',
  },
  {
    practiceId: '3.9.3',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Visitor escort and monitoring procedures required.',
  },
  {
    practiceId: '3.9.4',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Physical access audit log policy and implementation required.',
  },
  {
    practiceId: '3.9.5',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Physical access device management (keycards, badges) policy required.',
  },
  {
    practiceId: '3.9.6',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Physical damage prevention and transmission medium protection policy required.',
  },

  // ── PS: Personnel Security ────────────────────────────────────────────────
  {
    practiceId: '3.10.1',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Pre-employment screening policy for individuals with CUI access required.',
  },
  {
    practiceId: '3.10.2',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'users.isActive — account deactivation on termination', evidenceDescription: 'User accounts can be deactivated via admin panel; disabling isActive blocks authentication.' },
      { evidenceType: 'audit_log', evidenceRef: 'audit_events (entityType=employee, action=EMPLOYEE_TERMINATED)', evidenceDescription: 'Employee termination events are tracked in the audit log.' },
    ],
    gapNote: 'Formal offboarding checklist (access revocation, CUI return, credential deprovisioning) policy documentation required.',
  },

  // ── RA: Risk Assessment ───────────────────────────────────────────────────
  {
    practiceId: '3.11.1',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'edri_score_snapshots / edriScoringService', evidenceDescription: 'EDRI (EPOCH DCAA Readiness Index) performs periodic risk scoring across DCAA compliance domains.' },
    ],
    gapNote: 'Formal risk assessment covering all CUI processing must be documented. EDRI covers timekeeping risk; broader information security risk assessment required.',
  },
  {
    practiceId: '3.11.2',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Vulnerability scanning program (tool selection, schedule, remediation SLA) documentation required.',
  },
  {
    practiceId: '3.11.3',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Vulnerability remediation process based on risk assessment documentation required.',
  },

  // ── SA: Security Assessment ───────────────────────────────────────────────
  {
    practiceId: '3.12.1',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'forensic_rule', evidenceRef: 'TK-001 through TK-009', evidenceDescription: 'DCAA forensic rules constitute a continuous automated control assessment for timekeeping controls.' },
      { evidenceType: 'schema_table', evidenceRef: 'edri_score_snapshots — periodic EDRI scoring', evidenceDescription: 'EDRI snapshots provide periodic assessment of DCAA compliance control effectiveness.' },
    ],
    gapNote: 'Formal security control assessment plan (scope, methodology, frequency) documentation required.',
  },
  {
    practiceId: '3.12.2',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'dcaa_audit_findings — open findings tracking', evidenceDescription: 'DCAA audit findings track deficiencies requiring remediation with status and resolution notes.' },
    ],
    gapNote: 'Formal Plan of Action & Milestones (POA&M) process documentation required (separate task).',
  },
  {
    practiceId: '3.12.3',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'dcaa_scan_history — nightly scan log', evidenceDescription: 'Nightly DCAA forensic scans are logged in dcaa_scan_history providing continuous monitoring evidence.' },
    ],
    gapNote: 'Continuous monitoring plan covering all controls (not just timekeeping) documentation required.',
  },
  {
    practiceId: '3.12.4',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'cmmc_control_status — this SSP data', evidenceDescription: 'The CMMC control status table constitutes the machine-readable SSP, capturing status, evidence references, and notes for all 110 practices.' },
    ],
    gapNote: 'This dashboard and export constitutes the SSP. Ensure the document is reviewed and approved annually.',
  },

  // ── SC: System and Communications Protection ──────────────────────────────
  {
    practiceId: '3.13.1',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'Boundary protection (firewall rules, network segmentation) documentation required.',
  },
  {
    practiceId: '3.13.2',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'Security engineering principles documentation (architecture documentation) required.',
  },
  {
    practiceId: '3.13.3',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'permission', evidenceRef: 'requireAdminOrOwner — admin functions are separated routes', evidenceDescription: 'System management functions (admin routes) are separated from user functions via role-based routing.' },
    ],
  },
  {
    practiceId: '3.13.4',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Shared system resource controls preventing unauthorized information transfer must be documented.',
  },
  {
    practiceId: '3.13.5',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Network segmentation for publicly accessible components must be documented.',
  },
  {
    practiceId: '3.13.6',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'Default deny network policy at the infrastructure/firewall level must be documented.',
  },
  {
    practiceId: '3.13.7',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Split tunneling prevention policy for remote access connections required.',
  },
  {
    practiceId: '3.13.8',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'TLS enforcement for all CUI transmission is infrastructure-level (Replit deployment). Document cryptographic protocol versions and configurations.',
  },
  {
    practiceId: '3.13.9',
    seedStatus: 'implemented',
    evidenceLinks: [
      { evidenceType: 'audit_log', evidenceRef: 'JWT expiration + session timeout', evidenceDescription: 'Network connections (sessions) are terminated on JWT expiration and inactivity timeout.' },
    ],
  },
  {
    practiceId: '3.13.10',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Cryptographic key management policy (generation, distribution, storage, rotation, destruction) required.',
  },
  {
    practiceId: '3.13.11',
    seedStatus: 'partial',
    evidenceLinks: [],
    gapNote: 'FIPS-validated cryptography use must be confirmed at the library/algorithm level and documented.',
  },
  {
    practiceId: '3.13.12',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Collaborative computing device (camera/microphone) policy and remote activation prohibition required.',
  },
  {
    practiceId: '3.13.13',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Mobile code usage controls and monitoring policy required.',
  },
  {
    practiceId: '3.13.14',
    seedStatus: 'not_applicable',
    evidenceLinks: [],
    gapNote: 'VoIP technologies are not used in this system.',
  },
  {
    practiceId: '3.13.15',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'JWT HMAC signing — session authenticity', evidenceDescription: 'JWT tokens are HMAC-signed; tampering invalidates the signature providing session authenticity.' },
    ],
    gapNote: 'Communications authenticity at the network layer (TLS mutual authentication) must be documented.',
  },
  {
    practiceId: '3.13.16',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'vault', evidenceRef: 'vault_documents — encrypted object storage', evidenceDescription: 'CUI documents at rest are stored in encrypted object storage via the vault integration.' },
    ],
    gapNote: 'Database-at-rest encryption and file system encryption must be confirmed and documented.',
  },

  // ── SI: System and Information Integrity ──────────────────────────────────
  {
    practiceId: '3.14.1',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'schema_table', evidenceRef: 'dcaa_audit_findings — flaw/deficiency tracking', evidenceDescription: 'System flaws detected by DCAA forensic scans are tracked as findings with remediation status.' },
    ],
    gapNote: 'Formal flaw remediation process (patch management SLA, vulnerability tracking) documentation required.',
  },
  {
    practiceId: '3.14.2',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Malicious code protection (antivirus/EDR) deployment and policy documentation required.',
  },
  {
    practiceId: '3.14.3',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Security alert monitoring (CISA alerts, vendor advisories) process documentation required.',
  },
  {
    practiceId: '3.14.4',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Malicious code protection update policy and automated update configuration required.',
  },
  {
    practiceId: '3.14.5',
    seedStatus: 'planned',
    evidenceLinks: [],
    gapNote: 'Periodic system scanning schedule and real-time file scanning configuration documentation required.',
  },
  {
    practiceId: '3.14.6',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'forensic_rule', evidenceRef: 'TK-001 through TK-009', evidenceDescription: 'DCAA forensic scan monitors for indicators of unauthorized activity in timekeeping and labor charging.' },
      { evidenceType: 'audit_log', evidenceRef: 'audit_events — continuous activity monitoring', evidenceDescription: 'All system actions are captured in the audit log enabling monitoring for unauthorized activity.' },
    ],
    gapNote: 'Network-level intrusion detection and monitoring documentation required.',
  },
  {
    practiceId: '3.14.7',
    seedStatus: 'partial',
    evidenceLinks: [
      { evidenceType: 'forensic_rule', evidenceRef: 'TK-009', evidenceDescription: 'Forensic rule TK-009 detects unauthorized project charging — labor recorded without valid authorization.' },
      { evidenceType: 'audit_log', evidenceRef: 'audit_events — anomaly detection via EDRI', evidenceDescription: 'EDRI scoring surfaces patterns indicative of unauthorized system use.' },
    ],
    gapNote: 'Comprehensive unauthorized use detection beyond timekeeping (network anomaly detection) must be documented.',
  },
];

/** Build a lookup map from practiceId → ControlMapping */
export const EVIDENCE_MAPPING_BY_ID: Record<string, ControlMapping> = Object.fromEntries(
  CMMC_EVIDENCE_MAPPING.map(m => [m.practiceId, m]),
);

/** Default mapping for unmapped practices */
export function getControlMapping(practiceId: string): ControlMapping {
  return EVIDENCE_MAPPING_BY_ID[practiceId] ?? {
    practiceId,
    seedStatus: 'planned',
    evidenceLinks: [],
  };
}
