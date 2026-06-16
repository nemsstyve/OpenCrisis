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

    # Exporter un incident en Case STIX dans OpenCTI
    exportIncidentToOpenCTI(incidentId: ID!): OpenCTIEntity!

    # Creer un observable dans OpenCTI
    createOpenCTIObservable(type: String!, value: String!, description: String): OpenCTIEntity!

    # Créer un observable dans OpenCTI
    createOpenCTIObservable(type: String!, value: String!, description: String): OpenCTIEntity!
  }
`;
