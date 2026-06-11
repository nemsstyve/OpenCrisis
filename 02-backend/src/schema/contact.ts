export const contactTypeDefs = `#graphql
  type Contact {
    id: ID!
    firstName: String!
    lastName: String!
    role: String!
    organization: String
    phone: String
    email: String
    site: String
    notes: String
    createdAt: String!
    updatedAt: String!
  }

  input CreateContactInput {
    firstName: String!
    lastName: String!
    role: String!
    organization: String
    phone: String
    email: String
    site: String
    notes: String
  }

  input UpdateContactInput {
    firstName: String
    lastName: String
    role: String
    organization: String
    phone: String
    email: String
    site: String
    notes: String
  }

  extend type Query {
    contacts: [Contact!]!
    contact(id: ID!): Contact
  }

  extend type Mutation {
    createContact(input: CreateContactInput!): Contact!
    updateContact(id: ID!, input: UpdateContactInput!): Contact!
    deleteContact(id: ID!): Boolean!
  }
`;
