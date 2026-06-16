export const openctiTypeDefs = `#graphql

  type OpenCTIEntity {
    id: ID!
    name: String!
    entity_type: String!
    description: String
  }

  extend type Query {
    # Recherche d'entités dans OpenCTI (IP, domaines, malwares, IOC...)
    searchOpenCTI(query: String!): [OpenCTIEntity!]!
    # Vérifie si l'intégration OpenCTI est activée
    openctiStatus: Boolean!
  }

  extend type Mutation {
    # Lier un événement Timeline à une entité OpenCTI
    linkTimelineEventToOpenCTI(
      eventId: ID!
      openctiEntityId: String!
      openctiEntityType: String!
    ): TimelineEvent!

    # Délier un événement Timeline d'OpenCTI
    unlinkTimelineEventFromOpenCTI(eventId: ID!): TimelineEvent!
  }
`;
