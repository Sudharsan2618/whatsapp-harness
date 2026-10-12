import type { Pool } from 'pg'
import { env } from '../config/env'
import { resolveTenantConfig } from '../config/resolver'
import type { ResolvedTenantConfig } from '../config/schema'
import type { NumberAuthStatus, Tenant, TenantNumber } from '../domain/types'

interface NumberRow {
  id: string
  tenant_id: string
  phone_e164: string
  display_name: string | null
  auth_status: NumberAuthStatus
}

function toNumber(row: NumberRow): TenantNumber {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    phoneE164: row.phone_e164,
    displayName: row.display_name,
    authStatus: row.auth_status,
  }
}

export class TenantRepository {
  constructor(private readonly pool: Pool) {}

  async findByNumber(
    phoneE164: string,
  ): Promise<{ tenant: Tenant; number: TenantNumber } | null> {
    const { rows } = await this.pool.query(
      `select
         t.id, t.slug, t.business_name, t.vertical, t.status,
         n.id as number_id, n.display_name, n.auth_status
       from tenant_numbers n
       join tenants t on t.id = n.tenant_id
       where n.phone_e164 = $1`,
      [phoneE164],
    )
    const row = rows[0]
    if (!row) return null
    return {
      tenant: {
        id: row.id,
        slug: row.slug,
        businessName: row.business_name,
        vertical: row.vertical,
        status: row.status,
      },
      number: {
        id: row.number_id,
        tenantId: row.id,
        phoneE164,
        displayName: row.display_name,
        authStatus: row.auth_status,
      },
    }
  }

  async getResolvedConfig(tenantId: string): Promise<ResolvedTenantConfig> {
    const { rows } = await this.pool.query(
      `select
         coalesce(pd.config, '{}'::jsonb)    as platform,
         coalesce(vp.config, '{}'::jsonb)    as pack,
         coalesce(tc.overrides, '{}'::jsonb) as overrides
       from tenants t
       left join platform_defaults pd on true
       left join vertical_packs vp on vp.key = t.vertical
       left join tenant_config tc on tc.tenant_id = t.id
       where t.id = $1`,
      [tenantId],
    )
    const row = rows[0]
    if (!row) throw new Error(`tenant not found: ${tenantId}`)
    return resolveTenantConfig([row.platform, row.pack, row.overrides])
  }

  async createTenant(input: {
    slug: string
    businessName: string
    vertical: string | null
  }): Promise<Tenant> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const result = await client.query(
        `insert into tenants (slug, business_name, vertical, status)
         values ($1, $2, $3, 'active')
         on conflict (slug) do update set business_name = excluded.business_name, updated_at = now()
         returning id, slug, business_name, vertical, status`,
        [input.slug, input.businessName, input.vertical],
      )
      const row = result.rows[0]
      await client.query('insert into tenant_config (tenant_id) values ($1) on conflict do nothing', [
        row.id,
      ])
      await client.query('commit')
      return {
        id: row.id,
        slug: row.slug,
        businessName: row.business_name,
        vertical: row.vertical,
        status: row.status,
      }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async setProfile(tenantId: string, profile: unknown): Promise<void> {
    await this.pool.query('update tenants set profile = $2, updated_at = now() where id = $1', [
      tenantId,
      JSON.stringify(profile),
    ])
  }

  async getProfile(tenantId: string): Promise<Record<string, unknown>> {
    const { rows } = await this.pool.query<{ profile: Record<string, unknown> }>(
      'select profile from tenants where id = $1',
      [tenantId],
    )
    return rows[0]?.profile ?? {}
  }

  async setOverrides(tenantId: string, overrides: unknown): Promise<void> {
    await this.pool.query(
      `insert into tenant_config (tenant_id, overrides, updated_at)
       values ($1, $2, now())
       on conflict (tenant_id) do update set overrides = excluded.overrides, updated_at = now()`,
      [tenantId, JSON.stringify(overrides)],
    )
  }

  async addNumber(tenantId: string, phoneE164: string): Promise<TenantNumber> {
    // Reset to 'linking' and claim ownership for this worker so a re-link always
    // starts a fresh pairing and no other worker races to connect the same number.
    const { rows } = await this.pool.query<NumberRow>(
      `insert into tenant_numbers (tenant_id, phone_e164, auth_status, worker_id, lease_expires_at)
       values ($1, $2, 'linking', $3, now() + interval '5 minutes')
       on conflict (phone_e164) do update
         set tenant_id = excluded.tenant_id, auth_status = 'linking',
             worker_id = $3, lease_expires_at = now() + interval '5 minutes', updated_at = now()
       returning id, tenant_id, phone_e164, display_name, auth_status`,
      [tenantId, phoneE164, env.WORKER_ID],
    )
    return toNumber(rows[0]!)
  }

  async findNumberById(id: string): Promise<TenantNumber | null> {
    const { rows } = await this.pool.query<NumberRow>(
      'select id, tenant_id, phone_e164, display_name, auth_status from tenant_numbers where id = $1',
      [id],
    )
    return rows[0] ? toNumber(rows[0]) : null
  }

  async listLinkedNumbers(): Promise<TenantNumber[]> {
    const { rows } = await this.pool.query<NumberRow>(
      `select id, tenant_id, phone_e164, display_name, auth_status
       from tenant_numbers where auth_status = 'linked'`,
    )
    return rows.map(toNumber)
  }

  async listTenants(): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `select t.id, t.slug, t.business_name, t.vertical, t.status,
              n.id as number_id, n.phone_e164, n.auth_status,
              (select count(*) from messages m where m.tenant_id = t.id) as messages,
              (select count(*) from handoffs h where h.tenant_id = t.id and h.status = 'open') as open_handoffs
       from tenants t
       left join tenant_numbers n on n.tenant_id = t.id
       order by t.created_at desc`,
    )
    return rows
  }

  async numbersForTenant(tenantId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      'select id from tenant_numbers where tenant_id = $1',
      [tenantId],
    )
    return rows.map((r) => r.id)
  }

  async deleteNumber(numberId: string): Promise<void> {
    await this.pool.query('delete from tenant_numbers where id = $1', [numberId])
  }

  async setNumberAuthStatus(numberId: string, status: NumberAuthStatus): Promise<void> {
    await this.pool.query(
      'update tenant_numbers set auth_status = $1, updated_at = now() where id = $2',
      [status, numberId],
    )
  }

  /**
   * Claim up to `max` linked numbers for this worker, renewing the lease on each.
   * Only one worker holds a number at a time, so two processes never open a
   * socket for the same account (which WhatsApp rejects with conflict/replaced).
   * 'linking' numbers are owned in-process by whoever is pairing them, so they
   * are left out here.
   */
  async claimNumbers(workerId: string, max: number): Promise<TenantNumber[]> {
    const { rows } = await this.pool.query<NumberRow>(
      `with claimed as (
         select id from tenant_numbers
         where auth_status = 'linked'
           and (worker_id is null or worker_id = $1 or lease_expires_at is null or lease_expires_at < now())
         order by created_at
         limit $2
         for update skip locked
       )
       update tenant_numbers n
       set worker_id = $1, lease_expires_at = now() + interval '5 minutes', updated_at = now()
       from claimed
       where n.id = claimed.id
       returning n.id, n.tenant_id, n.phone_e164, n.display_name, n.auth_status`,
      [workerId, max],
    )
    return rows.map(toNumber)
  }

  /** Release this worker's leases so another process can claim immediately (on shutdown). */
  async releaseNumbers(workerId: string): Promise<void> {
    await this.pool.query(
      'update tenant_numbers set worker_id = null, lease_expires_at = null where worker_id = $1',
      [workerId],
    )
  }

  async createTenantWithNumber(input: {
    slug: string
    businessName: string
    vertical: string | null
    phoneE164: string
  }): Promise<{ tenant: Tenant; number: TenantNumber }> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const tenantResult = await client.query(
        `insert into tenants (slug, business_name, vertical, status)
         values ($1, $2, $3, 'active')
         on conflict (slug) do update set business_name = excluded.business_name, updated_at = now()
         returning id, slug, business_name, vertical, status`,
        [input.slug, input.businessName, input.vertical],
      )
      const tenantRow = tenantResult.rows[0]
      await client.query(
        'insert into tenant_config (tenant_id) values ($1) on conflict do nothing',
        [tenantRow.id],
      )
      const numberResult = await client.query<NumberRow>(
        `insert into tenant_numbers (tenant_id, phone_e164, auth_status)
         values ($1, $2, 'linking')
         on conflict (phone_e164)
         do update set tenant_id = excluded.tenant_id, updated_at = now()
         returning id, tenant_id, phone_e164, display_name, auth_status`,
        [tenantRow.id, input.phoneE164],
      )
      await client.query('commit')
      return {
        tenant: {
          id: tenantRow.id,
          slug: tenantRow.slug,
          businessName: tenantRow.business_name,
          vertical: tenantRow.vertical,
          status: tenantRow.status,
        },
        number: toNumber(numberResult.rows[0]!),
      }
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
}
