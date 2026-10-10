import { Redis } from 'ioredis'
import { env } from '../config/env'

// maxRetriesPerRequest must be null for BullMQ-compatible connections.
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
