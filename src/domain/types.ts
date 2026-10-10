export type TenantStatus = 'onboarding' | 'active' | 'paused' | 'suspended'
export type NumberAuthStatus = 'unlinked' | 'linking' | 'linked' | 'logged_out'

export interface Tenant {
  id: string
  slug: string
  businessName: string
  vertical: string | null
  status: TenantStatus
}

export interface TenantNumber {
  id: string
  tenantId: string
  phoneE164: string
  displayName: string | null
  authStatus: NumberAuthStatus
}
