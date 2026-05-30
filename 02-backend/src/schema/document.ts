export const documentTypeDefs = `#graphql
  enum DocumentCategory { ARTIFACT FICHE_REFLEXE RAPPORT PROCEDURE OTHER }

  type Document {
    id: ID!
    incidentId: ID
    timelineEventId: ID
    name: String!
    mimeType: String!
    sizeBytes: Int!
    category: DocumentCategory!
    uploadedBy: User!
    createdAt: String!
  }

  extend type Query {
    documents(incidentId: ID, category: DocumentCategory): [Document!]!
    document(id: ID!): Document
  }

  extend type Mutation {
    deleteDocument(id: ID!): Boolean!
  }

  extend type Subscription {
    documentUploaded(incidentId: ID!): Document!
  }
`;
