export const timelineTypeDefs = `#graphql
  enum TimelineEventType {
    DETECTION
    ACTION
    DECISION
    COMMUNICATION
    ESCALATION
    RESOLUTION
  }

  type TimelineEvent {
    id: ID!
    incidentId: ID!
    type: TimelineEventType!
    title: String!
    description: String
    occurredAt: String!
    isFirstDetection: Boolean!
    actor: User
    ipAddress: String
    assetName: String
    affectedUser: String
    ioc: String
    openctiEntityId: String
    openctiEntityType: String
    createdAt: String!
    updatedAt: String!
  }

  input CreateTimelineEventInput {
    type: TimelineEventType!
    title: String!
    description: String
    occurredAt: String!
    isFirstDetection: Boolean
    actorId: ID
    ipAddress: String
    assetName: String
    affectedUser: String
    ioc: String
  }

  input UpdateTimelineEventInput {
    type: TimelineEventType
    title: String
    description: String
    occurredAt: String
    isFirstDetection: Boolean
    ipAddress: String
    assetName: String
    affectedUser: String
    ioc: String
  }

  extend type Query {
    timelineEvents(incidentId: ID!): [TimelineEvent!]!
    timelineEvent(id: ID!): TimelineEvent
  }

  extend type Mutation {
    createTimelineEvent(incidentId: ID!, input: CreateTimelineEventInput!): TimelineEvent!
    updateTimelineEvent(id: ID!, input: UpdateTimelineEventInput!): TimelineEvent!
    deleteTimelineEvent(id: ID!): Boolean!
  }

  extend type Subscription {
    timelineEventAdded(incidentId: ID!): TimelineEvent!
  }
`;
