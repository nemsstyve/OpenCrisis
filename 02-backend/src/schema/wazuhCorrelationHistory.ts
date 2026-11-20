export const wazuhCorrelationHistoryTypeDefs = `#graphql
  type WazuhCorrelationMatch {
    threatId: ID!
    indicatorType: String!
    indicatorValue: String!
    score: Int!
    rationale: String!
    mitigation: String!
  }

  type WazuhCorrelationRecord {
    id: ID!
    sourceId: String!
    externalEventId: String!
    matched: Boolean!
    confidence: Int!
    matches: [WazuhCorrelationMatch!]!
    correlatedAt: String!
    analystReviewRequired: Boolean!
    incidentAutomaticallyCreated: Boolean!
  }

  extend type Query {
    wazuhCorrelations(limit: Int = 50): [WazuhCorrelationRecord!]!
  }
`;
