import { gql } from "@apollo/client";

export const WAZUH_CORRELATIONS_QUERY = gql`
  query WazuhCorrelations($limit: Int = 50) {
    wazuhCorrelations(limit: $limit) {
      id
      sourceId
      externalEventId
      matched
      confidence
      correlatedAt
      analystReviewRequired
      incidentAutomaticallyCreated
      matches {
        threatId
        indicatorType
        indicatorValue
        score
        rationale
        mitigation
      }
    }
  }
`;
