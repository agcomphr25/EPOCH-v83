/**
 * CMMC 2.0 Level 2 / NIST SP 800-171 Rev 2 — Complete Practice Taxonomy
 *
 * 110 practices across 14 control families.
 * Authoritative source: NIST SP 800-171 Rev 2 (June 2015, updated Jan 2020).
 */

export type CmmcFamily =
  | 'AC' | 'AT' | 'AU' | 'CM' | 'IA' | 'IR'
  | 'MA' | 'MP' | 'PE' | 'PS' | 'RA' | 'SA' | 'SC' | 'SI';

export const FAMILY_LABELS: Record<CmmcFamily, string> = {
  AC: 'Access Control',
  AT: 'Awareness and Training',
  AU: 'Audit and Accountability',
  CM: 'Configuration Management',
  IA: 'Identification and Authentication',
  IR: 'Incident Response',
  MA: 'Maintenance',
  MP: 'Media Protection',
  PE: 'Physical Protection',
  PS: 'Personnel Security',
  RA: 'Risk Assessment',
  SA: 'Security Assessment',
  SC: 'System and Communications Protection',
  SI: 'System and Information Integrity',
};

export interface CmmcPractice {
  practiceId: string;   // e.g. "3.1.1"
  family: CmmcFamily;
  title: string;
  description: string;
  /** True when the practice is met primarily through documented policy/procedure rather than technical controls */
  policyOnly?: boolean;
}

export const CMMC_PRACTICES: CmmcPractice[] = [
  // ─── Access Control (AC) ─────────────────────────────────────────────────
  { practiceId: '3.1.1',  family: 'AC', title: 'Authorized Access Control',            description: 'Limit information system access to authorized users, processes acting on behalf of authorized users, and devices (including other information systems).' },
  { practiceId: '3.1.2',  family: 'AC', title: 'Transaction and Function Control',      description: 'Limit information system access to the types of transactions and functions that authorized users are permitted to execute.' },
  { practiceId: '3.1.3',  family: 'AC', title: 'Control CUI Flow',                      description: 'Control the flow of CUI in accordance with approved authorizations.' },
  { practiceId: '3.1.4',  family: 'AC', title: 'Separation of Duties',                  description: 'Separate the duties of individuals to reduce the risk of malevolent activity without collusion.' },
  { practiceId: '3.1.5',  family: 'AC', title: 'Least Privilege',                       description: 'Employ the principle of least privilege, including for specific security functions and privileged accounts.' },
  { practiceId: '3.1.6',  family: 'AC', title: 'Non-Privileged Account Use',            description: 'Use non-privileged accounts or roles when accessing non-security functions.' },
  { practiceId: '3.1.7',  family: 'AC', title: 'Privileged Functions',                  description: 'Prevent non-privileged users from executing privileged functions and capture the execution in audit logs.' },
  { practiceId: '3.1.8',  family: 'AC', title: 'Unsuccessful Logon Attempts',           description: 'Limit unsuccessful logon attempts.' },
  { practiceId: '3.1.9',  family: 'AC', title: 'Privacy and Security Notices',          description: 'Provide privacy and security notices consistent with CUI rules.' },
  { practiceId: '3.1.10', family: 'AC', title: 'Session Lock',                          description: 'Use session lock with pattern-hiding displays after a period of inactivity.' },
  { practiceId: '3.1.11', family: 'AC', title: 'Session Termination',                   description: 'Terminate (automatically) a user session after a defined condition.' },
  { practiceId: '3.1.12', family: 'AC', title: 'Control Remote Access',                 description: 'Monitor and control remote access sessions.' },
  { practiceId: '3.1.13', family: 'AC', title: 'Remote Access Confidentiality',         description: 'Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.' },
  { practiceId: '3.1.14', family: 'AC', title: 'Remote Access Routing',                 description: 'Route remote access via managed access control points.' },
  { practiceId: '3.1.15', family: 'AC', title: 'Privileged Remote Access',              description: 'Authorize remote execution of privileged commands and access to security-relevant information via remote access only for documented operational needs.' },
  { practiceId: '3.1.16', family: 'AC', title: 'Wireless Access Authorization',         description: 'Authorize wireless access prior to allowing such connections.' },
  { practiceId: '3.1.17', family: 'AC', title: 'Wireless Access Protection',            description: 'Protect wireless access using authentication and encryption.' },
  { practiceId: '3.1.18', family: 'AC', title: 'Mobile Device Connection',              description: 'Control connection of mobile devices.' },
  { practiceId: '3.1.19', family: 'AC', title: 'Encrypt CUI on Mobile',                 description: 'Encrypt CUI on mobile devices and mobile computing platforms.' },
  { practiceId: '3.1.20', family: 'AC', title: 'External System Connections',           description: 'Verify and control all connections to external systems.' },
  { practiceId: '3.1.21', family: 'AC', title: 'Portable Storage Use',                  description: 'Limit use of portable storage devices on external systems.' },
  { practiceId: '3.1.22', family: 'AC', title: 'Control CUI Posted Publicly',           description: 'Control CUI posted or processed on publicly accessible information systems.' },

  // ─── Awareness and Training (AT) ─────────────────────────────────────────
  { practiceId: '3.2.1',  family: 'AT', title: 'Literacy Training and Awareness',       description: 'Ensure that personnel are aware of the security risks associated with their activities and of the applicable policies, standards, and procedures.' },
  { practiceId: '3.2.2',  family: 'AT', title: 'Role-Based Training',                   description: 'Ensure that organizational personnel are adequately trained to carry out their assigned information security responsibilities.' },
  { practiceId: '3.2.3',  family: 'AT', title: 'Insider Threat Awareness',              description: 'Provide security awareness training on recognizing and reporting potential indicators of insider threat.' },

  // ─── Audit and Accountability (AU) ───────────────────────────────────────
  { practiceId: '3.3.1',  family: 'AU', title: 'System Auditing',                       description: 'Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.' },
  { practiceId: '3.3.2',  family: 'AU', title: 'User Accountability',                   description: 'Ensure that the actions of individual system users can be traced to those users so they can be held accountable for their actions.' },
  { practiceId: '3.3.3',  family: 'AU', title: 'Event Review',                          description: 'Review and update logged events.' },
  { practiceId: '3.3.4',  family: 'AU', title: 'Audit Failure Alerting',                description: 'Alert in the event of an audit logging process failure.' },
  { practiceId: '3.3.5',  family: 'AU', title: 'Audit Correlation',                     description: 'Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.' },
  { practiceId: '3.3.6',  family: 'AU', title: 'Reduction and Reporting',               description: 'Provide audit record reduction and report generation to support on-demand analysis and reporting.' },
  { practiceId: '3.3.7',  family: 'AU', title: 'Authoritative Time Source',             description: 'Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.' },
  { practiceId: '3.3.8',  family: 'AU', title: 'Audit Log Protection',                  description: 'Protect audit information and audit tools from unauthorized access, modification, and deletion.' },
  { practiceId: '3.3.9',  family: 'AU', title: 'Audit Management',                      description: 'Limit management of audit logging to a subset of privileged users.' },

  // ─── Configuration Management (CM) ───────────────────────────────────────
  { practiceId: '3.4.1',  family: 'CM', title: 'System Baselining',                     description: 'Establish and maintain baseline configurations and inventories of organizational information systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles.' },
  { practiceId: '3.4.2',  family: 'CM', title: 'Security Configuration',                description: 'Establish and enforce security configuration settings for information technology products employed in organizational information systems.' },
  { practiceId: '3.4.3',  family: 'CM', title: 'Configuration Change Control',          description: 'Track, review, approve, and log changes to organizational information systems.' },
  { practiceId: '3.4.4',  family: 'CM', title: 'Impact Analysis',                       description: 'Analyze the security impact of changes prior to implementation.' },
  { practiceId: '3.4.5',  family: 'CM', title: 'Access Restrictions for Change',        description: 'Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational information systems.' },
  { practiceId: '3.4.6',  family: 'CM', title: 'Least Functionality',                   description: 'Employ the principle of least functionality by configuring organizational information systems to provide only essential capabilities.' },
  { practiceId: '3.4.7',  family: 'CM', title: 'Nonessential Functionality',            description: 'Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services.' },
  { practiceId: '3.4.8',  family: 'CM', title: 'Application Execution Policy',          description: 'Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software.' },
  { practiceId: '3.4.9',  family: 'CM', title: 'User-Installed Software',               description: 'Control and monitor user-installed software.' },

  // ─── Identification and Authentication (IA) ───────────────────────────────
  { practiceId: '3.5.1',  family: 'IA', title: 'Identify System Users',                 description: 'Identify information system users, processes acting on behalf of users, and devices.' },
  { practiceId: '3.5.2',  family: 'IA', title: 'Authenticate Users and Devices',        description: 'Authenticate (or verify) the identities of those users, processes, or devices as a prerequisite to allowing access.' },
  { practiceId: '3.5.3',  family: 'IA', title: 'Multifactor Authentication',             description: 'Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.' },
  { practiceId: '3.5.4',  family: 'IA', title: 'Replay-Resistant Authentication',       description: 'Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts.' },
  { practiceId: '3.5.5',  family: 'IA', title: 'Identifier Reuse',                      description: 'Employ the following controls to protect against identifier reuse: disable identifiers after a defined period of inactivity.' },
  { practiceId: '3.5.6',  family: 'IA', title: 'Identifier Handling',                   description: 'Disable identifiers after a defined inactivity period.' },
  { practiceId: '3.5.7',  family: 'IA', title: 'Password Complexity',                   description: 'Enforce a minimum password complexity and change of characters when new passwords are created.' },
  { practiceId: '3.5.8',  family: 'IA', title: 'Password Reuse',                        description: 'Prohibit password reuse for a specified number of generations.' },
  { practiceId: '3.5.9',  family: 'IA', title: 'Temporary Passwords',                   description: 'Allow temporary password use for system logons with an immediate change to a permanent password.' },
  { practiceId: '3.5.10', family: 'IA', title: 'Cryptographically-Protected Passwords', description: 'Store and transmit only cryptographically-protected passwords.' },
  { practiceId: '3.5.11', family: 'IA', title: 'Obscure Authentication Feedback',       description: 'Obscure feedback of authentication information.' },

  // ─── Incident Response (IR) ───────────────────────────────────────────────
  { practiceId: '3.6.1',  family: 'IR', title: 'Incident Handling',                     description: 'Establish an operational incident-handling capability for organizational information systems that includes preparation, detection, analysis, containment, recovery, and user response activities.' },
  { practiceId: '3.6.2',  family: 'IR', title: 'Incident Reporting',                    description: 'Track, document, and report incidents to designated officials and/or authorities both internal and external to the organization.' },
  { practiceId: '3.6.3',  family: 'IR', title: 'Incident Response Testing',             description: 'Test the organizational incident response capability.' },

  // ─── Maintenance (MA) ─────────────────────────────────────────────────────
  { practiceId: '3.7.1',  family: 'MA', title: 'Perform Maintenance',                   description: 'Perform maintenance on organizational information systems.' },
  { practiceId: '3.7.2',  family: 'MA', title: 'System Maintenance Controls',           description: 'Provide controls on the tools, techniques, mechanisms, and personnel that perform information system maintenance.' },
  { practiceId: '3.7.3',  family: 'MA', title: 'Equipment Sanitization',                description: 'Ensure equipment removed for off-site maintenance is sanitized of any CUI.' },
  { practiceId: '3.7.4',  family: 'MA', title: 'Media Inspection',                      description: 'Check media containing diagnostic and test programs for malicious code before the media are used in organizational information systems.' },
  { practiceId: '3.7.5',  family: 'MA', title: 'Maintenance Without Physical Access',   description: 'Require MFA for remote maintenance sessions; terminate sessions when maintenance is complete.' },
  { practiceId: '3.7.6',  family: 'MA', title: 'Maintenance Personnel',                 description: 'Supervise the maintenance activities of maintenance personnel without required access authorization.' },

  // ─── Media Protection (MP) ────────────────────────────────────────────────
  { practiceId: '3.8.1',  family: 'MP', title: 'Media Protection Policy',               description: 'Protect (physically and logically) system media containing CUI, both paper and digital.' },
  { practiceId: '3.8.2',  family: 'MP', title: 'Media Access',                          description: 'Limit access to CUI on system media to authorized users.' },
  { practiceId: '3.8.3',  family: 'MP', title: 'Media Sanitization',                    description: 'Sanitize or destroy information system media before disposal or reuse.' },
  { practiceId: '3.8.4',  family: 'MP', title: 'Media Markings',                        description: 'Mark media with necessary CUI markings and distribution limitations.' },
  { practiceId: '3.8.5',  family: 'MP', title: 'Media Accountability',                  description: 'Control access to media containing CUI and maintain accountability for media during transport.' },
  { practiceId: '3.8.6',  family: 'MP', title: 'Portable Storage Encryption',           description: 'Implement cryptographic mechanisms to protect the confidentiality of CUI during transport unless otherwise protected by alternative physical safeguards.' },
  { practiceId: '3.8.7',  family: 'MP', title: 'Removable Media Control',               description: 'Control the use of removable media on system components.' },
  { practiceId: '3.8.8',  family: 'MP', title: 'Shared Media',                          description: 'Prohibit the use of portable storage devices when such devices have no identifiable owner.' },
  { practiceId: '3.8.9',  family: 'MP', title: 'Protect CUI at Backup Storage',         description: 'Protect the confidentiality of backup CUI at storage locations.' },

  // ─── Physical Protection (PE) ─────────────────────────────────────────────
  { practiceId: '3.9.1',  family: 'PE', title: 'Limit Physical Access',                 description: 'Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals.' },
  { practiceId: '3.9.2',  family: 'PE', title: 'Protect and Monitor Physical Facility', description: 'Protect and monitor the physical facility and support infrastructure for organizational information systems.' },
  { practiceId: '3.9.3',  family: 'PE', title: 'Escort Visitors',                       description: 'Escort visitors and monitor visitor activity.' },
  { practiceId: '3.9.4',  family: 'PE', title: 'Audit Physical Access',                 description: 'Maintain audit logs of physical access.' },
  { practiceId: '3.9.5',  family: 'PE', title: 'Manage Physical Access Devices',        description: 'Control and manage physical access devices.' },
  { practiceId: '3.9.6',  family: 'PE', title: 'Enforce Access for Transmission',       description: 'Protect and prevent physical damage to organizational information systems by controlling physical access to output from information systems.' },

  // ─── Personnel Security (PS) ──────────────────────────────────────────────
  { practiceId: '3.10.1', family: 'PS', title: 'Screen Individuals',                    description: 'Screen individuals prior to authorizing access to organizational information systems containing CUI.' },
  { practiceId: '3.10.2', family: 'PS', title: 'Terminate and Transfer',                description: 'Ensure that CUI and information systems containing CUI are protected during and after personnel actions such as terminations and transfers.' },

  // ─── Risk Assessment (RA) ─────────────────────────────────────────────────
  { practiceId: '3.11.1', family: 'RA', title: 'Risk Assessments',                      description: 'Periodically assess the risk to organizational operations, organizational assets, and individuals, resulting from the operation of organizational information systems and the associated processing, storage, or transmission of CUI.' },
  { practiceId: '3.11.2', family: 'RA', title: 'Vulnerability Scanning',                description: 'Scan for vulnerabilities in organizational information systems and applications periodically and when new vulnerabilities affecting those systems are identified.' },
  { practiceId: '3.11.3', family: 'RA', title: 'Vulnerability Remediation',             description: 'Remediate vulnerabilities in accordance with risk assessments.' },

  // ─── Security Assessment (SA / 3.12) ──────────────────────────────────────
  { practiceId: '3.12.1', family: 'SA', title: 'Security Control Assessment',           description: 'Periodically assess the security controls in organizational information systems to determine if the controls are effective in their application.' },
  { practiceId: '3.12.2', family: 'SA', title: 'Plan of Action',                        description: 'Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational information systems.' },
  { practiceId: '3.12.3', family: 'SA', title: 'Monitor Security Controls',             description: 'Monitor information system security controls on an ongoing basis to ensure the continued effectiveness of the controls.' },
  { practiceId: '3.12.4', family: 'SA', title: 'System Security Plan',                  description: 'Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems.' },

  // ─── System and Communications Protection (SC) ────────────────────────────
  { practiceId: '3.13.1',  family: 'SC', title: 'Boundary Protection',                  description: 'Monitor, control, and protect organizational communications at the external boundaries and key internal boundaries of the information systems.' },
  { practiceId: '3.13.2',  family: 'SC', title: 'Security Engineering',                 description: 'Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security within organizational information systems.' },
  { practiceId: '3.13.3',  family: 'SC', title: 'Separation of System Components',      description: 'Separate user functionality from information system management functionality.' },
  { practiceId: '3.13.4',  family: 'SC', title: 'Shared Resource Control',              description: 'Prevent unauthorized and unintended information transfer via shared system resources.' },
  { practiceId: '3.13.5',  family: 'SC', title: 'Public-Access System Separation',      description: 'Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.' },
  { practiceId: '3.13.6',  family: 'SC', title: 'Network Communication Denial',         description: 'Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception).' },
  { practiceId: '3.13.7',  family: 'SC', title: 'Split Tunneling',                      description: 'Prevent remote devices from simultaneously establishing non-remote connections with the system and communicating via some other connection to resources in external networks (i.e., split tunneling).' },
  { practiceId: '3.13.8',  family: 'SC', title: 'Transmission Confidentiality',         description: 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards.' },
  { practiceId: '3.13.9',  family: 'SC', title: 'Network Disconnect',                   description: 'Terminate network connections after a defined period of inactivity or at the end of a session.' },
  { practiceId: '3.13.10', family: 'SC', title: 'Key Management',                       description: 'Establish and manage cryptographic keys for required cryptography employed in organizational information systems.' },
  { practiceId: '3.13.11', family: 'SC', title: 'FIPS-Validated Cryptography',          description: 'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.' },
  { practiceId: '3.13.12', family: 'SC', title: 'Collaborative Computing Devices',      description: 'Prohibit remote activation of collaborative computing devices and provide indication of use to present users.' },
  { practiceId: '3.13.13', family: 'SC', title: 'Mobile Code',                          description: 'Control and monitor the use of mobile code.' },
  { practiceId: '3.13.14', family: 'SC', title: 'VoIP Technologies',                    description: 'Control and monitor the use of VoIP technologies.' },
  { practiceId: '3.13.15', family: 'SC', title: 'Communications Authenticity',          description: 'Protect the authenticity of communications sessions.' },
  { practiceId: '3.13.16', family: 'SC', title: 'Data-at-Rest',                         description: 'Protect the confidentiality of CUI at rest.' },

  // ─── System and Information Integrity (SI) ────────────────────────────────
  { practiceId: '3.14.1', family: 'SI', title: 'Flaw Remediation',                      description: 'Identify, report, and correct information and information system flaws in a timely manner.' },
  { practiceId: '3.14.2', family: 'SI', title: 'Malicious Code Protection',             description: 'Provide protection from malicious code at appropriate locations within organizational information systems.' },
  { practiceId: '3.14.3', family: 'SI', title: 'Security Alerts',                       description: 'Monitor information system security alerts and advisories and take appropriate actions in response.' },
  { practiceId: '3.14.4', family: 'SI', title: 'Update Malicious Code Protection',      description: 'Update malicious code protection mechanisms when new releases are available.' },
  { practiceId: '3.14.5', family: 'SI', title: 'System and File Scanning',              description: 'Perform periodic scans of the information system and real-time scans of files from external sources as files are downloaded, opened, or executed.' },
  { practiceId: '3.14.6', family: 'SI', title: 'Security Monitoring',                   description: 'Monitor the information system to detect attacks and indicators of potential attacks and unauthorized local, network, and remote connections.' },
  { practiceId: '3.14.7', family: 'SI', title: 'Identify Unauthorized Use',             description: 'Identify unauthorized use of organizational information systems.' },
];

/** Get all practices for a given family */
export function getPracticesByFamily(family: CmmcFamily): CmmcPractice[] {
  return CMMC_PRACTICES.filter(p => p.family === family);
}

/** Get a single practice by ID */
export function getPracticeById(practiceId: string): CmmcPractice | undefined {
  return CMMC_PRACTICES.find(p => p.practiceId === practiceId);
}

/** All 14 families in order */
export const CMMC_FAMILIES: CmmcFamily[] = [
  'AC', 'AT', 'AU', 'CM', 'IA', 'IR', 'MA', 'MP', 'PE', 'PS', 'RA', 'SA', 'SC', 'SI',
];
