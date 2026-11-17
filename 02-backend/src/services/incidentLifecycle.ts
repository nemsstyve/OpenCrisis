/**
 * Regles de transition des incidents OpenCrisis V0.2.
 * Module pur, independant de Prisma et de GraphQL.
 */

export type LifecycleStatus = 'ACTIVE' | 'CONTAINED' | 'CLOSED';

export interface IncidentLifecycleState {
  status: LifecycleStatus;
  resolvedAt: Date | null;
}

export interface IncidentLifecyclePatch {
  status?: LifecycleStatus | null;
  name?: string | null;
  description?: string | null;
  severity?: string | null;
}

export class IncidentLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncidentLifecycleError';
  }
}

export function planIncidentLifecycle(
  existing: IncidentLifecycleState,
  input: IncidentLifecyclePatch,
  now: Date,
): IncidentLifecycleState {
  if (existing.status === 'CLOSED') {
    const otherChanges = Object.entries(input).some(
      ([key, value]) => key !== 'status' && value !== undefined
    );

    if (input.status !== 'ACTIVE' || otherChanges) {
      throw new IncidentLifecycleError(
        'Incident cloture : seule une reouverture explicite est autorisee'
      );
    }

    return { status: 'ACTIVE', resolvedAt: null };
  }

  if (input.status === 'CLOSED') {
    return { status: 'CLOSED', resolvedAt: now };
  }

  if (input.status === 'ACTIVE' || input.status === 'CONTAINED') {
    return { status: input.status, resolvedAt: null };
  }

  return {
    status: existing.status,
    resolvedAt: existing.resolvedAt,
  };
}
