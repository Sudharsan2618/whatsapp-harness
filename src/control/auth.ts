import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Pool } from 'pg'
import type { Request, Response } from 'express'

const COOKIE = 'ac_session'
const SESSION_DAYS = 30

export interface AuthUser {
  id: string
  email: string
  name: string | null
  tenantId: string | null
  role: 'owner' | 'admin'
}

// ── Passwords (scrypt; no external deps) ──
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored || !stored.includes(':')) return false
  const [saltHex, hashHex] = stored.split(':')
  const hash = scryptSync(password, Buffer.from(saltHex!, 'hex'), 64)
  const expected = Buffer.from(hashHex!, 'hex')
  return hash.length === expected.length && timingSafeEqual(hash, expected)
}

// ── Sessions (provider-agnostic: password today, SSO/Auth0 can call createSession too) ──
export async function createSession(pool: Pool, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await pool.query(
    `insert into sessions (token, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)`,
    [token, userId, String(SESSION_DAYS)],
  )
  return token
}
export async function destroySession(pool: Pool, token: string): Promise<void> {
  await pool.query('delete from sessions where token = $1', [token])
}
export async function getSessionUser(pool: Pool, req: Request): Promise<AuthUser | null> {
  const token = parseCookies(req)[COOKIE]
  if (!token) return null
  const { rows } = await pool.query(
    `select u.id, u.email, u.name, u.tenant_id, u.role
     from sessions s join users u on u.id = s.user_id
     where s.token = $1 and s.expires_at > now()`,
    [token],
  )
  const r = rows[0]
  return r ? { id: r.id, email: r.email, name: r.name, tenantId: r.tenant_id, role: r.role } : null
}

// ── Users ──
export async function createUser(pool: Pool, input: { email: string; name?: string; password: string }): Promise<AuthUser> {
  const id = randomUUID()
  const { rows } = await pool.query(
    `insert into users (id, email, name, password_hash) values ($1, lower($2), $3, $4)
     returning id, email, name, tenant_id, role`,
    [id, input.email, input.name ?? null, hashPassword(input.password)],
  )
  const r = rows[0]
  return { id: r.id, email: r.email, name: r.name, tenantId: r.tenant_id, role: r.role }
}
export async function findUserByEmail(pool: Pool, email: string): Promise<(AuthUser & { passwordHash: string | null }) | null> {
  const { rows } = await pool.query(
    'select id, email, name, tenant_id, role, password_hash from users where email = lower($1)',
    [email],
  )
  const r = rows[0]
  return r ? { id: r.id, email: r.email, name: r.name, tenantId: r.tenant_id, role: r.role, passwordHash: r.password_hash } : null
}
export async function setUserTenant(pool: Pool, userId: string, tenantId: string): Promise<void> {
  await pool.query('update users set tenant_id = $2, updated_at = now() where id = $1', [userId, tenantId])
}

// ── Cookies ──
export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
export function setSessionCookie(req: Request, res: Response, token: string): void {
  const secure = (req.headers['x-forwarded-proto'] ?? '').toString().includes('https')
  const parts = [`${COOKIE}=${token}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`]
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}
export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`)
}
