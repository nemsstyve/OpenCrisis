import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const retryStrategy = (times: number) => Math.min(times * 50, 2000);

export const pubsub = new RedisPubSub({
  publisher: new Redis(redisUrl, { retryStrategy }),
  subscriber: new Redis(redisUrl, { retryStrategy }),
});

// ─── Topics ───────────────────────────────────────────────────────────────────

export const TOPICS = {
  INCIDENT_CREATED: 'INCIDENT_CREATED',
  INCIDENT_STATUS_CHANGED: (id: string) => `INCIDENT_STATUS_CHANGED_${id}`,
  LOG_ENTRY_ADDED: (incidentId: string, cell: string) => `LOG_ENTRY_ADDED_${incidentId}_${cell}`,
  LOG_ENTRY_UPDATED: (incidentId: string, cell: string) => `LOG_ENTRY_UPDATED_${incidentId}_${cell}`,
  TIMELINE_EVENT_ADDED: (incidentId: string) => `TIMELINE_EVENT_ADDED_${incidentId}`,
  DOCUMENT_UPLOADED: (incidentId: string) => `DOCUMENT_UPLOADED_${incidentId}`,
} as const;
