export const authTypeDefs = `#graphql
  type UserPermission {
    resource: String!
    action: String!
  }

  type Role {
    id: ID!
    name: String!
    description: String
    isSystem: Boolean!
  }

  type User {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    phone: String
    company: String
    site: String
    isActive: Boolean!
    mustChangePassword: Boolean!
    createdAt: String!
    roles: [Role!]!
    permissions: [UserPermission!]!
  }

  type AuthPayload {
    accessToken: String!
    user: User!
  }

  type TotpEnrollment {
    secret: String!
    provisioningUri: String!
  }

  extend type Query {
    me: User
  }

  extend type Mutation {
    login(email: String!, password: String!, totpCode: String): AuthPayload!
    beginTotpEnrollment(password: String!): TotpEnrollment!
    enableTotp(code: String!): [String!]!
    disableTotp(password: String!, code: String!): Boolean!
    logout: Boolean!
    refreshToken: AuthPayload!
    changePassword(currentPassword: String!, newPassword: String!): Boolean!
  }
`;
