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
