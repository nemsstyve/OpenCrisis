import { gql } from "@apollo/client";

export const CONTACTS_QUERY = gql`
  query Contacts($incidentId: ID) {
    contacts(incidentId: $incidentId) {
      id
      firstName
      lastName
      role
      organization
      phone
      email
      site
      notes
      isGlobal
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_CONTACT_MUTATION = gql`
  mutation CreateContact($input: CreateContactInput!, $incidentId: ID) {
    createContact(input: $input, incidentId: $incidentId) {
      id
      firstName
      lastName
      role
      organization
      phone
      email
      site
      notes
      isGlobal
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_CONTACT_MUTATION = gql`
  mutation UpdateContact($id: ID!, $input: UpdateContactInput!) {
    updateContact(id: $id, input: $input) {
      id
      firstName
      lastName
      role
      organization
      phone
      email
      site
      notes
      updatedAt
    }
  }
`;

export const DELETE_CONTACT_MUTATION = gql`
  mutation DeleteContact($id: ID!) {
    deleteContact(id: $id)
  }
`;

export const LINK_CONTACT_MUTATION = gql`
  mutation LinkContactToIncident($contactId: ID!, $incidentId: ID!) {
    linkContactToIncident(contactId: $contactId, incidentId: $incidentId)
  }
`;
