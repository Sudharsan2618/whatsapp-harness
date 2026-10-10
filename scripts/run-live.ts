import qrcode from 'qrcode-terminal'
import { TenantRepository } from '../src/control/tenantRepository'
import { pool } from '../src/db/pool'
import { ModelAgent } from '../src/intelligence/modelAgent'
import { MessagePipeline } from '../src/orchestration/pipeline'
import { SafeSender } from '../src/orchestration/safeSender'
import { ConnectionManager } from '../src/transport/connectionManager'
import { logger } from '../src/utils/logger'
import { installProcessGuards } from '../src/utils/resilience'

// Provision one tenant+number, set its model, link it, and serve it live in a
// single process (one socket). For demos and live testing.
// Usage:
//   npx tsx scripts/run-live.ts --slug demo --phone 15551234567 \
//     --vertical clinic --provider openrouter --model openai/gpt-6-luna
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function run(): Promise<void> {
  installProcessGuards(logger)
  const phone = arg('phone')
  if (!phone) throw new Error('required: --phone <country code + number, digits only>')

  const slug = arg('slug') ?? 'demo'
  const vertical = arg('vertical') ?? 'clinic'
  const provider = arg('provider') ?? 'openrouter'
  const model = arg('model') ?? 'openai/gpt-6-luna'

  const tenants = new TenantRepository(pool)
  const { tenant, number } = await tenants.createTenantWithNumber({
    slug,
    businessName: arg('name') ?? slug,
    vertical,
    phoneE164: phone,
  })

  await pool.query(
    `update tenant_config
       set overrides = jsonb_set(overrides, '{model}', $2::jsonb, true), updated_at = now()
     where tenant_id = $1`,
    [tenant.id, JSON.stringify({ provider, model, temperature: 0.3 })],
  )

  const pipeline = new MessagePipeline({ pool, tenants, agent: new ModelAgent(pool), logger })
  const manager = new ConnectionManager({
    pool,
    logger,
    number,
    usePairingCode: !process.argv.includes('--qr'),
    onPairingCode: (code) =>
      logger.info(
        { pairingCode: code },
        'WhatsApp > Linked devices > Link with phone number — enter this code',
      ),
    onQr: (qr) => qrcode.generate(qr, { small: true }),
  })
  const sender = new SafeSender((jid, text) => manager.rawSend(jid, { text }), logger)
  manager.onInbound = (message) => pipeline.handle(number, message, sender)

  await manager.start()
  logger.info({ slug, phone, vertical, provider, model }, 'live: linking, then serving this number')
}

run().catch((error) => {
  logger.error({ error }, 'run-live failed')
  process.exitCode = 1
})
