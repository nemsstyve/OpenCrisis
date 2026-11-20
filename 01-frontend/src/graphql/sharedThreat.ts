import { gql } from "@apollo/client";

export const PUBLISHED_THREATS_QUERY = gql`
  query PublishedThreats {
    publishedThreats {
      id
      indicatorType
      indicatorValue
      title
      mitigation
      publishedAt
    }
  }
`;

export const MY_THREAT_SUBMISSIONS_QUERY = gql`
  query MyThreatSubmissions {
    myThreatSubmissions {
      id
      indicatorType
      indicatorValue
      title
      status
      createdAt
    }
  }
`;

export const PENDING_THREAT_SUBMISSIONS_QUERY = gql`
  query PendingThreatSubmissions {
    pendingThreatSubmissions {
      id
      indicatorType
      indicatorValue
      title
      mitigation
      status
      createdAt
    }
  }
`;

export const PROPOSE_THREAT_MUTATION = gql`
  mutation ProposeThreatFromIoC(
    $iocId: ID!
    $title: String!
    $mitigation: String!
  ) {
    proposeThreatFromIoC(
      iocId: $iocId
      title: $title
      mitigation: $mitigation
    ) {
      id
      status
    }
  }
`;

export const DECIDE_THREAT_MUTATION = gql`
  mutation DecideThreatSubmission(
    $submissionId: ID!
    $approve: Boolean!
    $reason: String
  ) {
    decideThreatSubmission(
      submissionId: $submissionId
      approve: $approve
      reason: $reason
    ) {
      id
      status
    }
  }
`;

export const LINK_THREAT_MUTATION = gql`
  mutation LinkPublishedThreatToIncident(
    $incidentId: ID!
    $threatId: ID!
  ) {
    linkPublishedThreatToIncident(
      incidentId: $incidentId
      threatId: $threatId
    )
  }
`;
