import qrcode from 'qrcode-terminal'
import { TenantRepository } from '../src/control/tenantRepository'
import { pool } from '../src/db/pool'
import { ConnectionManager } from '../src/transport/connectionManager'
import { logger } from '../src/utils/logger'

// Provision a tenant + number and link it. Stays running after linking.
// Usage:
//   npm run link -- --slug acme --name "Acme Clinic" --vertical clinic --phone 15551234567
//   add --qr to link by QR code instead of a pairing code
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function run(): Promise<void> {
  const slug = arg('slug')
  const phone = arg('phone')
  if (!slug || !phone) throw new Error('required: --slug and --phone')

  const tenants = new TenantRepository(pool)
  const { number } = await tenants.createTenantWithNumber({
    slug,
    businessName: arg('name') ?? slug,
    vertical: arg('vertical') ?? null,
    phoneE164: phone,
  })

  const manager = new ConnectionManager({
    pool,
    logger,
    number,
    usePairingCode: !process.argv.includes('--qr'),
    onPairingCode: (code) =>
      logger.info({ code }, 'open WhatsApp > Linked devices > Link with phone number, and enter this code'),
    onQr: (qr) => qrcode.generate(qr, { small: true }),
  })

  await manager.start()
  logger.info({ slug, phone }, 'linking started; waiting for connection')
}

run().catch((error) => {
  logger.error({ error }, 'link failed')
  process.exitCode = 1
})
