import { gql } from "@apollo/client";

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
