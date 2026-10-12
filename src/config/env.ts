import 'dotenv/config'
import { hostname } from 'node:os'
import { z } from 'zod'

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === 'true' || value === '1')

const schema = z.object({
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DATABASE_SSL: boolish,
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  // Unique per process by default so the number-ownership lease can distinguish two
  // processes (e.g. a Cloud Run revision overlap, or a dev server) and never lets
  // both connect the same WhatsApp account. Set WORKER_ID explicitly to override.
  WORKER_ID: z.string().default(`worker-${hostname()}-${process.pid}`),
  MAX_SESSIONS_PER_WORKER: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
})

const parsed = schema.parse(process.env)

function resolveDatabaseUrl(): string {
  if (parsed.DATABASE_URL) return parsed.DATABASE_URL
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT } = parsed
  if (!DB_HOST || !DB_NAME || !DB_USER) {
    throw new Error('Set DATABASE_URL, or DB_HOST + DB_NAME + DB_USER')
  }
  const auth = DB_PASSWORD ? `${DB_USER}:${encodeURIComponent(DB_PASSWORD)}` : DB_USER
  return `postgres://${auth}@${DB_HOST}:${DB_PORT ?? 5432}/${DB_NAME}`
}

const databaseUrl = resolveDatabaseUrl()

export const env = {
  ...parsed,
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: parsed.DATABASE_SSL || /\.render\.com/.test(databaseUrl),
}

export type Env = typeof env
