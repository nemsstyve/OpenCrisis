export const logEntryTypeDefs = `#graphql
  enum Cell { DIRECTIONAL OPERATIONAL SHARED }

  type LogEntry {
    id: ID!
    incidentId: ID!
    cell: Cell!
    content: String!
    author: User!
    isEdited: Boolean!
    editedAt: String
    createdAt: String!
    updatedAt: String!
    tags: [Tag!]!
  }

  extend type Query {
    logEntries(incidentId: ID!, cell: Cell): [LogEntry!]!
  }

  extend type Mutation {
    createLogEntry(incidentId: ID!, cell: Cell!, content: String!): LogEntry!
    editLogEntry(id: ID!, content: String!): LogEntry!
    deleteLogEntry(id: ID!): Boolean!
    addTagToLogEntry(logEntryId: ID!, tagId: ID!): LogEntry!
    removeTagFromLogEntry(logEntryId: ID!, tagId: ID!): LogEntry!
  }

  extend type Subscription {
    logEntryAdded(incidentId: ID!, cell: Cell): LogEntry!
    logEntryUpdated(incidentId: ID!, cell: Cell): LogEntry!
  }
`;
