import { gql } from "@apollo/client";

export const LOG_ENTRIES_QUERY = gql`
  query LogEntries($incidentId: ID!, $cell: Cell) {
    logEntries(incidentId: $incidentId, cell: $cell) {
      id incidentId cell content
      author { id firstName lastName email }
      isEdited editedAt createdAt updatedAt
      tags { id name color }
    }
  }
`;

export const CREATE_LOG_ENTRY_MUTATION = gql`
  mutation CreateLogEntry($incidentId: ID!, $cell: Cell!, $content: String!) {
    createLogEntry(incidentId: $incidentId, cell: $cell, content: $content) {
      id incidentId cell content
      author { id firstName lastName email }
      isEdited editedAt createdAt updatedAt
      tags { id name color }
    }
  }
`;

export const EDIT_LOG_ENTRY_MUTATION = gql`
  mutation EditLogEntry($id: ID!, $content: String!) {
    editLogEntry(id: $id, content: $content) {
      id content isEdited editedAt updatedAt
    }
  }
`;

export const DELETE_LOG_ENTRY_MUTATION = gql`
  mutation DeleteLogEntry($id: ID!) {
    deleteLogEntry(id: $id)
  }
`;

export const ADD_TAG_TO_LOG_ENTRY_MUTATION = gql`
  mutation AddTagToLogEntry($logEntryId: ID!, $tagId: ID!) {
    addTagToLogEntry(logEntryId: $logEntryId, tagId: $tagId) {
      id tags { id name color }
    }
  }
`;

export const REMOVE_TAG_FROM_LOG_ENTRY_MUTATION = gql`
  mutation RemoveTagFromLogEntry($logEntryId: ID!, $tagId: ID!) {
    removeTagFromLogEntry(logEntryId: $logEntryId, tagId: $tagId) {
      id tags { id name color }
    }
  }
`;

export const LOG_ENTRY_ADDED_SUBSCRIPTION = gql`
  subscription LogEntryAdded($incidentId: ID!, $cell: Cell) {
    logEntryAdded(incidentId: $incidentId, cell: $cell) {
      id incidentId cell content
      author { id firstName lastName email }
      isEdited editedAt createdAt updatedAt
      tags { id name color }
    }
  }
`;

export const LOG_ENTRY_UPDATED_SUBSCRIPTION = gql`
  subscription LogEntryUpdated($incidentId: ID!, $cell: Cell) {
    logEntryUpdated(incidentId: $incidentId, cell: $cell) {
      id incidentId cell content
      author { id firstName lastName email }
      isEdited editedAt createdAt updatedAt
      tags { id name color }
    }
  }
`;
