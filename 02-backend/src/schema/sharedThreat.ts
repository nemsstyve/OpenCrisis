export const sharedThreatTypeDefs = `#graphql
  type SharedThreat {
    id: ID!
    indicatorType: String!
    indicatorValue: String!
    title: String!
    mitigation: String!
    publishedAt: String!
  }

  type ThreatSubmission {
    id: ID!
    indicatorType: String!
    indicatorValue: String!
    title: String!
    mitigation: String!
    status: String!
    publishedThreatId: ID
    reviewedAt: String
    createdAt: String!
  }

  type IncidentThreatAssociation {
    id: ID!
    incidentId: ID!
    threat: SharedThreat!
    createdAt: String!
  }

  extend type Query {
    publishedThreats: [SharedThreat!]!
    myThreatSubmissions: [ThreatSubmission!]!
    pendingThreatSubmissions: [ThreatSubmission!]!
    incidentThreatAssociations(incidentId: ID!): [IncidentThreatAssociation!]!
  }

  extend type Mutation {
    proposeThreatFromIoC(iocId: ID!, title: String!, mitigation: String!): ThreatSubmission!
    decideThreatSubmission(submissionId: ID!, approve: Boolean!, reason: String): ThreatSubmission!
    linkPublishedThreatToIncident(incidentId: ID!, threatId: ID!): Boolean!
    unlinkPublishedThreatFromIncident(incidentId: ID!, threatId: ID!): Boolean!
  }
`;
