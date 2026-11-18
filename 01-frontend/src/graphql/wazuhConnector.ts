import { gql } from "@apollo/client";

export const ADMIN_WAZUH_CONNECTORS_QUERY = gql`
  query AdminWazuhConnectors($limit: Int = 50) {
    adminWazuhConnectors(limit: $limit) {
      id
      name
      sourceId
      isActive
      revokedAt
      lastUsedAt
      createdAt
      updatedAt
    }
  }
`;

export const ADMIN_CREATE_WAZUH_CONNECTOR_MUTATION = gql`
  mutation AdminCreateWazuhConnector(
    $input: AdminCreateWazuhConnectorInput!
  ) {
    adminCreateWazuhConnector(input: $input) {
      connectorId
      sourceId
      secret
    }
  }
`;

export const ADMIN_ROTATE_WAZUH_CONNECTOR_MUTATION = gql`
  mutation AdminRotateWazuhConnectorSecret($id: ID!) {
    adminRotateWazuhConnectorSecret(id: $id) {
      connectorId
      sourceId
      secret
    }
  }
`;

export const ADMIN_REVOKE_WAZUH_CONNECTOR_MUTATION = gql`
  mutation AdminRevokeWazuhConnector($id: ID!) {
    adminRevokeWazuhConnector(id: $id) {
      connectorId
      revoked
    }
  }
`;
