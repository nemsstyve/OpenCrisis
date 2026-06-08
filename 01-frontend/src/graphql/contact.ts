import { gql } from "@apollo/client";

export const CONTACTS_QUERY = gql`
  query Contacts {
    contacts {
      id
      firstName
      lastName
      role
      organization
      phone
      email
      site
      notes
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_CONTACT_MUTATION = gql`
  mutation CreateContact($input: CreateContactInput!) {
    createContact(input: $input) {
      id
      firstName
      lastName
      role
      organization
      phone
      email
      site
      notes
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
