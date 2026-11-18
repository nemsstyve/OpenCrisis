export const wazuhConnectorTypeDefs = `#graphql
  type WazuhConnector {
    id: ID!
    name: String!
    sourceId: String!
    isActive: Boolean!
    revokedAt: String
    lastUsedAt: String
    createdAt: String!
    updatedAt: String!
  }

  input AdminCreateWazuhConnectorInput {
    name: String!
    sourceId: String!
  }

  type WazuhConnectorCredentialResult {
    connectorId: ID!
    sourceId: String!
    secret: String!
  }

  type WazuhConnectorRevocationResult {
    connectorId: ID!
    revoked: Boolean!
  }

  extend type Query {
    adminWazuhConnectors(
      limit: Int = 50
    ): [WazuhConnector!]!
  }

  extend type Mutation {
    adminCreateWazuhConnector(
      input: AdminCreateWazuhConnectorInput!
    ): WazuhConnectorCredentialResult!

    adminRotateWazuhConnectorSecret(
      id: ID!
    ): WazuhConnectorCredentialResult!

    adminRevokeWazuhConnector(
      id: ID!
    ): WazuhConnectorRevocationResult!
  }
`;
