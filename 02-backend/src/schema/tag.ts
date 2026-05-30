export const tagTypeDefs = `#graphql
  type Tag {
    id: ID!
    name: String!
    color: String!
  }

  extend type Query {
    tags: [Tag!]!
  }

  extend type Mutation {
    createTag(name: String!, color: String): Tag!
    deleteTag(id: ID!): Boolean!
  }
`;
