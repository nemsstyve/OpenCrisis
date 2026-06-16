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
      isFirstDetection
      actor { id firstName lastName }
      ipAddress
      assetName
      affectedUser
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
      isFirstDetection
      actor { id firstName lastName }
      ipAddress
      assetName
      affectedUser
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
      isFirstDetection
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
      isFirstDetection
      actor { id firstName lastName }
      ipAddress
      assetName
      affectedUser
      createdAt
      updatedAt
    }
  }
`;
