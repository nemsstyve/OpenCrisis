import { gql } from "@apollo/client";

// ── Queries ───────────────────────────────────────────────────────────────────

export const ADMIN_USERS_QUERY = gql`
  query AdminUsers {
    adminUsers {
      id email firstName lastName phone company site isActive createdAt
      roles { id name isSystem }
    }
  }
`;

export const ADMIN_ROLES_QUERY = gql`
  query AdminRoles {
    adminRoles {
      id name description isSystem
      permissions { id resource action }
    }
  }
`;

export const ADMIN_PERMISSIONS_QUERY = gql`
  query AdminPermissions {
    adminPermissions { id resource action }
  }
`;

export const ADMIN_AUDIT_LOGS_QUERY = gql`
  query AdminAuditLogs($incidentId: ID, $limit: Int, $offset: Int) {
    adminAuditLogs(incidentId: $incidentId, limit: $limit, offset: $offset) {
      total
      items {
        id action resource resourceId incidentId metadata ipAddress createdAt
        user { id firstName lastName email }
      }
    }
  }
`;

// ── User mutations ────────────────────────────────────────────────────────────

export const ADMIN_CREATE_USER_MUTATION = gql`
  mutation AdminCreateUser($input: AdminCreateUserInput!, $roleIds: [ID!]) {
    adminCreateUser(input: $input, roleIds: $roleIds) {
      id email firstName lastName isActive createdAt
      roles { id name isSystem }
    }
  }
`;

export const ADMIN_UPDATE_USER_MUTATION = gql`
  mutation AdminUpdateUser($id: ID!, $input: AdminUpdateUserInput!) {
    adminUpdateUser(id: $id, input: $input) {
      id email firstName lastName phone company site isActive
      roles { id name isSystem }
    }
  }
`;

export const ADMIN_DELETE_USER_MUTATION = gql`
  mutation AdminDeleteUser($id: ID!) {
    adminDeleteUser(id: $id)
  }
`;

export const ADMIN_ASSIGN_ROLE_MUTATION = gql`
  mutation AdminAssignRole($userId: ID!, $roleId: ID!) {
    adminAssignRole(userId: $userId, roleId: $roleId)
  }
`;

export const ADMIN_REMOVE_ROLE_MUTATION = gql`
  mutation AdminRemoveRole($userId: ID!, $roleId: ID!) {
    adminRemoveRole(userId: $userId, roleId: $roleId)
  }
`;

export const ADMIN_RESET_PASSWORD_MUTATION = gql`
  mutation AdminResetPassword($userId: ID!, $newPassword: String!) {
    adminResetPassword(userId: $userId, newPassword: $newPassword)
  }
`;

// ── Role mutations ────────────────────────────────────────────────────────────

export const ADMIN_CREATE_ROLE_MUTATION = gql`
  mutation AdminCreateRole($input: AdminCreateRoleInput!) {
    adminCreateRole(input: $input) {
      id name description isSystem
      permissions { id resource action }
    }
  }
`;

export const ADMIN_DELETE_ROLE_MUTATION = gql`
  mutation AdminDeleteRole($id: ID!) {
    adminDeleteRole(id: $id)
  }
`;

export const ADMIN_UPDATE_ROLE_PERMISSIONS_MUTATION = gql`
  mutation AdminUpdateRolePermissions($roleId: ID!, $permissionIds: [ID!]!) {
    adminUpdateRolePermissions(roleId: $roleId, permissionIds: $permissionIds) {
      id name description isSystem
      permissions { id resource action }
    }
  }
`;
