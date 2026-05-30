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
    createdAt: String!
    roles: [Role!]!
    permissions: [UserPermission!]!
  }

  type AuthPayload {
    accessToken: String!
    user: User!
  }

  extend type Query {
    me: User
  }

  extend type Mutation {
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
    refreshToken: AuthPayload!
  }
`;
