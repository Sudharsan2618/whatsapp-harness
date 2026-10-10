import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys'
import type { Pool } from 'pg'

// Store auth state as text serialized with Baileys' BufferJSON, exactly as
// useMultiFileAuthState does — Buffers survive the round-trip and no JSON engine
// in the database ever parses the values.
const serialize = (value: unknown): string => JSON.stringify(value, BufferJSON.replacer)
const deserialize = <T>(text: string): T => JSON.parse(text, BufferJSON.reviver) as T

/**
 * Database-backed replacement for useMultiFileAuthState. Persists credentials
 * and Signal keys per linked number. saveCreds must be wired to creds.update.
 */
export async function useDbAuthState(
  pool: Pool,
  numberId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const existing = await pool.query('select creds from wa_auth_creds where number_id = $1', [
    numberId,
  ])
  const creds: AuthenticationCreds = existing.rows[0]
    ? deserialize<AuthenticationCreds>(existing.rows[0].creds)
    : initAuthCreds()

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const { rows } = await pool.query(
          `select item_id, value from wa_signal_keys
           where number_id = $1 and category = $2 and item_id = any($3)`,
          [numberId, type, ids],
        )
        const result: { [id: string]: SignalDataTypeMap[typeof type] } = {}
        for (const row of rows) {
          let value = deserialize<SignalDataTypeMap[typeof type]>(row.value)
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value as object,
            ) as unknown as SignalDataTypeMap[typeof type]
          }
          result[row.item_id] = value
        }
        return result
      },
      set: async (data) => {
        const writes: Array<Promise<unknown>> = []
        for (const category of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
          const entries = data[category]
          if (!entries) continue
          for (const [itemId, value] of Object.entries(entries)) {
            if (value) {
              writes.push(
                pool.query(
                  `insert into wa_signal_keys (number_id, category, item_id, value, updated_at)
                   values ($1, $2, $3, $4, now())
                   on conflict (number_id, category, item_id)
                   do update set value = excluded.value, updated_at = now()`,
                  [numberId, category, itemId, serialize(value)],
                ),
              )
            } else {
              writes.push(
                pool.query(
                  `delete from wa_signal_keys
                   where number_id = $1 and category = $2 and item_id = $3`,
                  [numberId, category, itemId],
                ),
              )
            }
          }
        }
        await Promise.all(writes)
      },
    },
  }

  const saveCreds = async () => {
    await pool.query(
      `insert into wa_auth_creds (number_id, creds, updated_at)
       values ($1, $2, now())
       on conflict (number_id)
       do update set creds = excluded.creds, updated_at = now()`,
      [numberId, serialize(state.creds)],
    )
  }

  return { state, saveCreds }
}
