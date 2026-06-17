export const openctiTypeDefs = `#graphql
  type OpenCTIEntity {
    id: ID!
    name: String!
    entity_type: String!
    description: String
  }

  extend type Query {
    searchOpenCTI(query: String!): [OpenCTIEntity!]!
    openctiStatus: Boolean!
  }

  extend type Mutation {
    linkTimelineEventToOpenCTI(
      eventId: ID!
      openctiEntityId: String!
      openctiEntityType: String!
    ): TimelineEvent!

    unlinkTimelineEventFromOpenCTI(eventId: ID!): TimelineEvent!

    exportIncidentToOpenCTI(incidentId: ID!): OpenCTIEntity!

    createOpenCTIObservable(type: String!, value: String!, description: String): OpenCTIEntity!
  }
`;
