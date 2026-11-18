import { gql } from "@apollo/client";

export const INCIDENT_PROPOSALS_QUERY = gql`
  query IncidentProposals(
    $status: IncidentProposalStatus
    $limit: Int = 50
  ) {
    incidentProposals(status: $status, limit: $limit) {
      id
      sourceType
      sourceId
      externalEventId
      title
      description
      severity
      status
      reviewedById
      reviewedAt
      incidentId
      receivedAt
      createdAt
    }
  }
`;

export const INCIDENT_PROPOSAL_QUERY = gql`
  query IncidentProposal($id: ID!) {
    incidentProposal(id: $id) {
      id
      sourceType
      sourceId
      externalEventId
      title
      description
      severity
      status
      reviewedById
      reviewedAt
      incidentId
      receivedAt
      createdAt
    }
  }
`;

export const APPROVE_INCIDENT_PROPOSAL_MUTATION = gql`
  mutation ApproveIncidentProposal($id: ID!) {
    approveIncidentProposal(id: $id) {
      proposalId
      incidentId
    }
  }
`;

export const REJECT_INCIDENT_PROPOSAL_MUTATION = gql`
  mutation RejectIncidentProposal(
    $id: ID!
    $reason: String!
  ) {
    rejectIncidentProposal(id: $id, reason: $reason) {
      proposalId
      status
    }
  }
`;
