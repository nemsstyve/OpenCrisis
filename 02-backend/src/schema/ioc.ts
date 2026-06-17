
export const iocTypeDefs = `#graphql
  enum IoCType {
    IPV4
    IPV6
    HASH_MD5
    HASH_SHA1
    HASH_SHA256
    DOMAIN
    URL
    EMAIL
    YARA
    OTHER
  }

  type IoC {
    id: ID!
    timelineEventId: ID!
    type: IoCType!
    value: String!
    description: String
    createdAt: String!
    createdBy: User
  }

  extend type Query {
    iocsByEvent(timelineEventId: ID!): [IoC!]!
  }

  extend type Mutation {
    addIoC(timelineEventId: ID!, type: IoCType!, value: String!, description: String): IoC!
    removeIoC(id: ID!): Boolean!
  }
`;
