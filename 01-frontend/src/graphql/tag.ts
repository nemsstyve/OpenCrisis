import { gql } from "@apollo/client";

export const TAGS_QUERY = gql`
  query Tags {
    tags {
      id
      name
      color
    }
  }
`;

export const CREATE_TAG_MUTATION = gql`
  mutation CreateTag($name: String!, $color: String) {
    createTag(name: $name, color: $color) {
      id
      name
      color
    }
  }
`;

export const DELETE_TAG_MUTATION = gql`
  mutation DeleteTag($id: ID!) {
    deleteTag(id: $id)
  }
`;
