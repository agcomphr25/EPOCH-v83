import { File } from "@google-cloud/storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

// The type of the access group.
//
// Can be flexibly defined according to the use case.
//
// - USER_LIST: the users from a user list stored in vault_access_grants for a document;
// - PROJECT: the users who are members of a specific project;
// - DEPARTMENT: the users who belong to a specific department.
export enum ObjectAccessGroupType {
  USER_LIST = "USER_LIST",
  PROJECT = "PROJECT",
  DEPARTMENT = "DEPARTMENT",
}

// The logic user group that can access the object.
export interface ObjectAccessGroup {
  // The type of the access group.
  type: ObjectAccessGroupType;
  // The logic id that is enough to identify the qualified group members.
  //
  // It may have different format for different types. For example:
  // - for USER_LIST, the id could be the user list db entity id, and the
  //   user list db entity could contain a bunch of user ids. User needs
  //   to be a member of the user list to be able to access the object.
  // - for EMAIL_DOMAIN, the id could be the email domain, and the user needs
  //   to have an email with the domain to be able to access the object.
  // - for GROUP_MEMBER, the id could be the group db entity id, and the
  //   group db entity could contain a bunch of user ids. User needs to be
  //   a member of the group to be able to access the object.
  // - for SUBSCRIBER, the id could be the subscriber db entity id, and the
  //   subscriber db entity could contain a bunch of user ids. User needs to
  //   be a subscriber to be able to access the object.
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// The ACL policy of the object.
// This would be set as part of the object custom metadata:
// - key: "custom:aclPolicy"
// - value: JSON string of the ObjectAclPolicy object.
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

// Check if the requested permission is allowed based on the granted permission.
function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  // Users granted with read or write permissions can read the object.
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }

  // Only users granted with write permissions can write the object.
  return granted === ObjectPermission.WRITE;
}

// The base class for all access groups.
//
// Different types of access groups can be implemented according to the use case.
abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  // Check if the user is a member of the group.
  public abstract hasMember(userId: string): Promise<boolean>;
}

// USER_LIST group: checks vault_access_grants for the given document id.
// The group id is the vault document id (as a string).
class UserListAccessGroup extends BaseObjectAccessGroup {
  constructor(id: string) {
    super(ObjectAccessGroupType.USER_LIST, id);
  }

  public async hasMember(userId: string): Promise<boolean> {
    try {
      const { pool } = await import('../../db');
      const rows = await pool.query(
        `SELECT 1 FROM vault_access_grants WHERE document_id = $1 AND granted_to_user_id = $2 LIMIT 1`,
        [parseInt(this.id), parseInt(userId)]
      ) as any[];
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}

// PROJECT group: checks if a user belongs to a project.
// The group id is the project id (uuid string).
class ProjectAccessGroup extends BaseObjectAccessGroup {
  constructor(id: string) {
    super(ObjectAccessGroupType.PROJECT, id);
  }

  public async hasMember(userId: string): Promise<boolean> {
    try {
      const { pool } = await import('../../db');
      const rows = await pool.query(
        `SELECT 1 FROM perm_user_capability_scopes
         WHERE user_id = $1 AND scope_type = 'PROJECT' AND project_id = $2 LIMIT 1`,
        [parseInt(userId), this.id]
      ) as any[];
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}

// DEPARTMENT group: checks if a user belongs to a department via scoped grants.
// The group id is the department name.
class DepartmentAccessGroup extends BaseObjectAccessGroup {
  constructor(id: string) {
    super(ObjectAccessGroupType.DEPARTMENT, id);
  }

  public async hasMember(userId: string): Promise<boolean> {
    try {
      const { pool } = await import('../../db');
      const rows = await pool.query(
        `SELECT 1 FROM perm_user_capability_scopes
         WHERE user_id = $1 AND scope_type = 'DEPARTMENT' AND department = $2 LIMIT 1`,
        [parseInt(userId), this.id]
      ) as any[];
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    case ObjectAccessGroupType.USER_LIST:
      return new UserListAccessGroup(group.id);
    case ObjectAccessGroupType.PROJECT:
      return new ProjectAccessGroup(group.id);
    case ObjectAccessGroupType.DEPARTMENT:
      return new DepartmentAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

/**
 * Build the serialized ACL policy metadata entry without writing it.
 * Use this when you need to merge ACL policy with other custom metadata
 * in a single consolidated setMetadata call to avoid GCS patch overwriting.
 */
export function buildAclPolicyMetadata(aclPolicy: ObjectAclPolicy): Record<string, string> {
  return { [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy) };
}

// Sets the ACL policy to the object metadata.
export async function setObjectAclPolicy(
  objectFile: File,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }

  await objectFile.setMetadata({
    metadata: buildAclPolicyMetadata(aclPolicy),
  });
}

// Gets the ACL policy from the object metadata.
export async function getObjectAclPolicy(
  objectFile: File,
): Promise<ObjectAclPolicy | null> {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy as string);
}

// Checks if the user can access the object.
export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: File;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  // When this function is called, the acl policy is required.
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  // Public objects are always accessible for read.
  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  // Access control requires the user id.
  if (!userId) {
    return false;
  }

  // The owner of the object can always access it.
  if (aclPolicy.owner === userId) {
    return true;
  }

  // Go through the ACL rules to check if the user has the required permission.
  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}

