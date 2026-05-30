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
    isGlobal: Boolean!
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
    isGlobal: Boolean
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
    contacts(incidentId: ID): [Contact!]!
    contact(id: ID!): Contact
  }

  extend type Mutation {
    createContact(input: CreateContactInput!, incidentId: ID): Contact!
    updateContact(id: ID!, input: UpdateContactInput!): Contact!
    deleteContact(id: ID!): Boolean!
    linkContactToIncident(contactId: ID!, incidentId: ID!): Boolean!
    unlinkContactFromIncident(contactId: ID!, incidentId: ID!): Boolean!
  }
`;
