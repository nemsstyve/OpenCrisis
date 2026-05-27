import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const retryStrategy = (times: number) => Math.min(times * 50, 2000);

export const pubsub = new RedisPubSub({
  publisher: new Redis(redisUrl, { retryStrategy }),
  subscriber: new Redis(redisUrl, { retryStrategy }),
});
