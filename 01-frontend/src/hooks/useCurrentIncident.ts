import { useEffect } from "react";
import { useParams } from "react-router";
import { useQuery } from "@apollo/client";
import { useAppStore } from "../store/useAppStore";
import { INCIDENT_QUERY } from "../graphql/incident";
import type { GqlIncident } from "../types/api";

/**
 * Provides the current incident from the URL params.
 * If the Zustand store is empty (e.g. after a page refresh), queries the
 * backend and restores the store so the Sidebar displays the incident name.
 */
export function useCurrentIncident() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const { currentIncident, setCurrentIncident } = useAppStore();

  // Only fetch when store doesn't have the right incident (e.g. after page refresh)
  const needsFetch = !currentIncident || currentIncident.id !== incidentId;

  const { data, loading, error } = useQuery<{ incident: GqlIncident | null }>(
    INCIDENT_QUERY,
    {
      variables: { id: incidentId },
      skip: !incidentId || !needsFetch,
      fetchPolicy: "cache-first",
    }
  );

  useEffect(() => {
    if (data?.incident && needsFetch) {
      setCurrentIncident(data.incident);
    }
  }, [data, needsFetch, setCurrentIncident]);

  return {
    incidentId: incidentId as string,
    incident: (currentIncident?.id === incidentId ? currentIncident : null) ?? data?.incident ?? null,
    loading: needsFetch && loading,
    error,
  };
}
