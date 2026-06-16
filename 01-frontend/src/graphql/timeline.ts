import { gql } from "@apollo/client";

export const TIMELINE_EVENTS_QUERY = gql`
  query TimelineEvents($incidentId: ID!) {
    timelineEvents(incidentId: $incidentId) {
      id
      incidentId
      type
      title
      description
      occurredAt
      actor { id firstName lastName }
      ipAddress
      assetName
      affectedUser
      openctiEntityId
      openctiEntityType
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_TIMELINE_EVENT_MUTATION = gql`
  mutation CreateTimelineEvent($incidentId: ID!, $input: CreateTimelineEventInput!) {
    createTimelineEvent(incidentId: $incidentId, input: $input) {
      id
      incidentId
      type
      title
      description
      occurredAt
      actor { id firstName lastName }
      ipAddress
      assetName
      affectedUser
      openctiEntityId
      openctiEntityType
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_TIMELINE_EVENT_MUTATION = gql`
  mutation UpdateTimelineEvent($id: ID!, $input: UpdateTimelineEventInput!) {
    updateTimelineEvent(id: $id, input: $input) {
      id
      type
      title
      description
      occurredAt
      ipAddress
      assetName
      affectedUser
      updatedAt
    }
  }
`;

export const DELETE_TIMELINE_EVENT_MUTATION = gql`
  mutation DeleteTimelineEvent($id: ID!) {
    deleteTimelineEvent(id: $id)
  }
`;

export const TIMELINE_EVENT_ADDED_SUBSCRIPTION = gql`
  subscription TimelineEventAdded($incidentId: ID!) {
    timelineEventAdded(incidentId: $incidentId) {
      id
      incidentId
      type
      title
      description
      occurredAt
      actor { id firstName lastName }
      ipAddress
      assetName
      affectedUser
      openctiEntityId
      openctiEntityType
      createdAt
      updatedAt
    }
  }
`;

// ─── OpenCTI ──────────────────────────────────────────────────────────────────

export const SEARCH_OPENCTI_QUERY = gql`
  query SearchOpenCTI($query: String!) {
    searchOpenCTI(query: $query) {
      id
      name
      entity_type
      description
    }
  }
`;

export const OPENCTI_STATUS_QUERY = gql`
  query OpenCTIStatus {
    openctiStatus
  }
`;

export const LINK_OPENCTI_MUTATION = gql`
  mutation LinkTimelineEventToOpenCTI($eventId: ID!, $openctiEntityId: String!, $openctiEntityType: String!) {
    linkTimelineEventToOpenCTI(
      eventId: $eventId
      openctiEntityId: $openctiEntityId
      openctiEntityType: $openctiEntityType
    ) {
      id
      openctiEntityId
      openctiEntityType
    }
  }
`;

export const UNLINK_OPENCTI_MUTATION = gql`
  mutation UnlinkTimelineEventFromOpenCTI($eventId: ID!) {
    unlinkTimelineEventFromOpenCTI(eventId: $eventId) {
      id
      openctiEntityId
      openctiEntityType
    }
  }
`;


export const CREATE_OPENCTI_OBSERVABLE_MUTATION = gql`
  mutation CreateOpenCTIObservable($type: String!, $value: String!, $description: String) {
    createOpenCTIObservable(type: $type, value: $value, description: $description) {
      id
      name
      entity_type
    }
  }
`;
