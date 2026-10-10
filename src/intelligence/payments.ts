import type { ResolvedTenantConfig } from '../config/schema'

export interface PaymentRequest {
  amount: number
  currency: string
  description: string
}

export interface PaymentResult {
  ok: boolean
  url?: string
  message?: string
}

/**
 * Create a real payment link for a tenant. Providers:
 * - `razorpay`: calls Razorpay's Payment Links API with the tenant's keys and
 *   returns the real short URL.
 * - `link`: the tenant has its own hosted checkout/registration page; share it as-is.
 * - unset / `none`: no payment is configured — return a clear failure so the agent
 *   shares the official page or hands off, instead of inventing a link.
 */
export async function createPaymentLink(
  config: ResolvedTenantConfig,
  req: PaymentRequest,
): Promise<PaymentResult> {
  const payment = config.integrations?.payment
  const provider = payment?.provider ?? 'none'

  if (provider === 'link' && payment?.pageUrl) {
    return { ok: true, url: payment.pageUrl }
  }

  if (provider === 'razorpay' && payment?.keyId && payment?.keySecret) {
    return createRazorpayLink(payment.keyId, payment.keySecret, req)
  }

  return {
    ok: false,
    message:
      'No payment provider is configured for this business. Share the official registration/course page from the verified links, or hand off to the team to collect payment.',
  }
}

async function createRazorpayLink(
  keyId: string,
  keySecret: string,
  req: PaymentRequest,
): Promise<PaymentResult> {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  const res = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Basic ${auth}` },
    body: JSON.stringify({
      amount: Math.round(req.amount * 100),
      currency: req.currency || 'INR',
      description: req.description || 'Payment',
      accept_partial: false,
      reminder_enable: true,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { short_url?: string; error?: { description?: string } }
  if (!res.ok || !data.short_url) {
    return { ok: false, message: data.error?.description || `payment provider error (${res.status})` }
  }
  return { ok: true, url: data.short_url }
}
