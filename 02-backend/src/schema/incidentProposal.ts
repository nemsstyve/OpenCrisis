export const incidentProposalTypeDefs = `#graphql
  enum IncidentProposalStatus {
    PENDING
    APPROVED
    REJECTED
    CONVERTED
  }

  type IncidentProposal {
    id: ID!
    sourceType: String!
    sourceId: String!
    externalEventId: String!
    title: String!
    description: String
    severity: Severity!
    status: IncidentProposalStatus!
    reviewedById: ID
    reviewedAt: String
    incidentId: ID
    receivedAt: String!
    createdAt: String!
    updatedAt: String!
  }

  type IncidentProposalApprovalResult {
    proposalId: ID!
    incidentId: ID!
  }

  type IncidentProposalRejectionResult {
    proposalId: ID!
    status: IncidentProposalStatus!
  }

  extend type Query {
    incidentProposals(
      status: IncidentProposalStatus
      limit: Int = 50
    ): [IncidentProposal!]!

    incidentProposal(id: ID!): IncidentProposal
  }

  extend type Mutation {
    approveIncidentProposal(
      id: ID!
    ): IncidentProposalApprovalResult!

    rejectIncidentProposal(
      id: ID!
      reason: String!
    ): IncidentProposalRejectionResult!
  }
`;
