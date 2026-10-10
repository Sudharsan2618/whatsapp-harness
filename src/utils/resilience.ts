import type { Logger } from 'pino'

/**
 * Keep a long-running process alive through transient faults. A single tenant's
 * network blip or stray rejection must not take down the whole worker; the
 * connection manager reconnects on its own.
 */
export function installProcessGuards(logger: Logger): void {
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled rejection')
  })
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'uncaught exception')
  })
}
