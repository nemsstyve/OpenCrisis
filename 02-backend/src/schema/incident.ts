export const incidentTypeDefs = `#graphql
  enum IncidentStatus { ACTIVE CONTAINED CLOSED }
  enum Severity { LOW MEDIUM HIGH CRITICAL }

  type Incident {
    id: ID!
    name: String!
    description: String
    status: IncidentStatus!
    severity: Severity!
    startedAt: String!
    resolvedAt: String
    createdBy: User!
    openctiCaseId: String
    createdAt: String!
    updatedAt: String!
  }

  input CreateIncidentInput {
    name: String!
    description: String
    severity: Severity
  }

  input UpdateIncidentInput {
    name: String
    description: String
    status: IncidentStatus
    severity: Severity
  }

  extend type Query {
    incidents: [Incident!]!
    incident(id: ID!): Incident
  }

  extend type Mutation {
    createIncident(input: CreateIncidentInput!): Incident!
    updateIncident(id: ID!, input: UpdateIncidentInput!): Incident!
    deleteIncident(id: ID!): Boolean!
  }

  type Subscription {
    incidentCreated: Incident!
    incidentStatusChanged(incidentId: ID!): Incident!
  }
`;
