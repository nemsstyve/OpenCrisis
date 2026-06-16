import { gql } from "@apollo/client";

export const INCIDENT_QUERY = gql`
  query Incident($id: ID!) {
    incident(id: $id) {
      id
      name
      description
      status
      severity
      startedAt
      resolvedAt
      createdBy { email }
    }
  }
`;

export const INCIDENTS_QUERY = gql`
  query Incidents {
    incidents {
      id
      name
      description
      status
      severity
      startedAt
      createdBy { email }
    }
  }
`;

export const CREATE_INCIDENT_MUTATION = gql`
  mutation CreateIncident($input: CreateIncidentInput!) {
    createIncident(input: $input) {
      id
      name
      status
      severity
      startedAt
    }
  }
`;

export const UPDATE_INCIDENT_MUTATION = gql`
  mutation UpdateIncident($id: ID!, $input: UpdateIncidentInput!) {
    updateIncident(id: $id, input: $input) {
      id
      name
      description
      status
      severity
    }
  }
`;

export const DELETE_INCIDENT_MUTATION = gql`
  mutation DeleteIncident($id: ID!) {
    deleteIncident(id: $id)
  }
`;

export const EXPORT_INCIDENT_TO_OPENCTI_MUTATION = gql`
  mutation ExportIncidentToOpenCTI($incidentId: ID!) {
    exportIncidentToOpenCTI(incidentId: $incidentId) {
      id
      name
      entity_type
    }
  }
`;
