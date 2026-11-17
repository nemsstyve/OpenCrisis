import test from "node:test";
import assert from "node:assert/strict";
import {
  planIncidentLifecycle,
  IncidentLifecycleError,
} from "../src/services/incidentLifecycle.ts";

const now = new Date("2026-11-17T10:00:00Z");
const resolved = new Date("2026-11-16T10:00:00Z");

test("fermer un incident actif definit resolvedAt", () => {
  const result = planIncidentLifecycle(
    { status: "ACTIVE", resolvedAt: null },
    { status: "CLOSED" },
    now
  );
  assert.equal(result.status, "CLOSED");
  assert.equal(result.resolvedAt, now);
});

test("contenir un incident ne definit pas de resolution", () => {
  const result = planIncidentLifecycle(
    { status: "ACTIVE", resolvedAt: null },
    { status: "CONTAINED" },
    now
  );
  assert.equal(result.status, "CONTAINED");
  assert.equal(result.resolvedAt, null);
});

test("reouvrir efface resolvedAt", () => {
  const result = planIncidentLifecycle(
    { status: "CLOSED", resolvedAt: resolved },
    { status: "ACTIVE" },
    now
  );
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.resolvedAt, null);
});

test("modifier un incident cloture est refuse", () => {
  assert.throws(
    () => planIncidentLifecycle(
      { status: "CLOSED", resolvedAt: resolved },
      { name: "Modification interdite" },
      now
    ),
    IncidentLifecycleError
  );
});

test("reouverture et modification simultanees refusees", () => {
  assert.throws(
    () => planIncidentLifecycle(
      { status: "CLOSED", resolvedAt: resolved },
      { status: "ACTIVE", severity: "HIGH" },
      now
    ),
    IncidentLifecycleError
  );
});

test("transition CLOSED vers CONTAINED refusee", () => {
  assert.throws(
    () => planIncidentLifecycle(
      { status: "CLOSED", resolvedAt: resolved },
      { status: "CONTAINED" },
      now
    ),
    IncidentLifecycleError
  );
});
