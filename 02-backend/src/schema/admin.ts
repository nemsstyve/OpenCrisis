export const adminTypeDefs = `#graphql
  # ── Types spécifiques à l'administration ──────────────────────────────────────

  # User léger pour les logs d'audit (sans roles/permissions pour éviter N+1)
  type AuditLogUser {
    id: ID!
    firstName: String!
    lastName: String!
    email: String!
  }

  type AuditLogEntry {
    id: ID!
    user: AuditLogUser
    action: String!
    resource: String!
    resourceId: String
    incidentId: String
    metadata: String
    ipAddress: String
    createdAt: String!
  }

  type AuditLogPage {
    items: [AuditLogEntry!]!
    total: Int!
  }

  # Rôle enrichi de ses permissions (pour l'admin uniquement)
  type RoleDetail {
    id: ID!
    name: String!
    description: String
    isSystem: Boolean!
    permissions: [Permission!]!
  }

  # Permission (resource + action)
  type Permission {
    id: ID!
    resource: String!
    action: String!
  }

  # ── Inputs ────────────────────────────────────────────────────────────────────

  input AdminCreateUserInput {
    email: String!
    password: String!
    firstName: String!
    lastName: String!
    phone: String
    company: String
    site: String
  }

  input AdminUpdateUserInput {
    firstName: String
    lastName: String
    phone: String
    company: String
    site: String
    isActive: Boolean
  }

  input AdminCreateRoleInput {
    name: String!
    description: String
    permissionIds: [ID!]!
  }

  # ── Queries ───────────────────────────────────────────────────────────────────

  extend type Query {
    adminUsers: [User!]!
    adminRoles: [RoleDetail!]!
    adminPermissions: [Permission!]!
    adminAuditLogs(incidentId: ID, limit: Int, offset: Int): AuditLogPage!
  }

  # ── Mutations ─────────────────────────────────────────────────────────────────

  extend type Mutation {
    adminCreateUser(input: AdminCreateUserInput!, roleIds: [ID!]): User!
    adminUpdateUser(id: ID!, input: AdminUpdateUserInput!): User!
    adminDeleteUser(id: ID!): Boolean!
    adminAssignRole(userId: ID!, roleId: ID!): Boolean!
    adminRemoveRole(userId: ID!, roleId: ID!): Boolean!
    adminCreateRole(input: AdminCreateRoleInput!): RoleDetail!
    adminDeleteRole(id: ID!): Boolean!
    adminUpdateRolePermissions(roleId: ID!, permissionIds: [ID!]!): RoleDetail!
    adminResetPassword(userId: ID!, newPassword: String!): Boolean!
  }
`;
