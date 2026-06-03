import { gql } from "@apollo/client";

export const DOCUMENTS_QUERY = gql`
  query Documents($incidentId: ID, $category: DocumentCategory) {
    documents(incidentId: $incidentId, category: $category) {
      id
      incidentId
      name
      mimeType
      sizeBytes
      category
      createdAt
      uploadedBy { id firstName lastName email }
    }
  }
`;

export const DELETE_DOCUMENT_MUTATION = gql`
  mutation DeleteDocument($id: ID!) {
    deleteDocument(id: $id)
  }
`;

export const DOCUMENT_UPLOADED_SUBSCRIPTION = gql`
  subscription DocumentUploaded($incidentId: ID!) {
    documentUploaded(incidentId: $incidentId) {
      id
      incidentId
      name
      mimeType
      sizeBytes
      category
      createdAt
      uploadedBy { id firstName lastName email }
    }
  }
`;
