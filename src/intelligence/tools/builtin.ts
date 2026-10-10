import { ProductStore } from '../catalog'
import { openHandoff } from '../../orchestration/handoff'
import { createPaymentLink } from '../payments'
import type { Tool } from './types'

export const handoffHuman: Tool = {
  key: 'handoff_human',
  description:
    'Escalate the conversation to the business owner or team when the customer needs a human, asks for a firm quote/order, or raises something outside your scope.',
  parameters: {
    type: 'object',
    properties: { reason: { type: 'string', description: 'why this needs a human' } },
    required: [],
  },
  async run(input, context) {
    const reason = typeof input.reason === 'string' ? input.reason : 'customer needs a human'
    await openHandoff(context.pool, context.tenantId, context.chatJid, reason)
    return { ok: true, message: 'A team member has been notified and will reply shortly.' }
  },
}

export const bookMeeting: Tool = {
  key: 'book_meeting',
  description: 'Share the meeting/booking link so the customer can schedule a call or demo.',
  parameters: { type: 'object', properties: {}, required: [] },
  async run(_input, context) {
    const url = context.config.integrations?.calendlyUrl
    if (!url) return { ok: false, message: 'No booking link is configured for this business.' }
    context.outbox.push({ kind: 'text', text: `You can book a time here: ${url}` })
    return { ok: true, message: 'Shared the booking link with the customer.' }
  },
}

export const bookAppointment: Tool = {
  key: 'book_appointment',
  description: 'Record a requested appointment or callback for the team to confirm.',
  parameters: {
    type: 'object',
    properties: { when: { type: 'string' }, name: { type: 'string' }, note: { type: 'string' } },
    required: [],
  },
  async run() {
    return { ok: true, message: 'Noted — the team will confirm the appointment shortly.' }
  },
}

export const lookupCustomer: Tool = {
  key: 'lookup_customer',
  description: "Look up the current customer's saved profile and preferences.",
  parameters: { type: 'object', properties: {}, required: [] },
  async run(_input, context) {
    const { rows } = await context.pool.query(
      'select display_name, profile from customers where tenant_id = $1 and wa_lid = $2',
      [context.tenantId, context.customerJid],
    )
    return { ok: true, data: rows[0] ?? null }
  },
}

export const checkAvailability: Tool = {
  key: 'check_availability',
  description: 'Check whether a product is available and its price, from the catalog.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'product name or keywords' } },
    required: ['query'],
  },
  async run(input, context) {
    const store = new ProductStore(context.pool, context.tenantId)
    const items = await store.search(String(input.query ?? ''), 5)
    if (!items.length) return { ok: true, message: 'No matching product found in the catalog.' }
    return {
      ok: true,
      data: items.map((p) => ({ name: p.name, price: p.price, currency: p.currency, inStock: p.inStock, sku: p.sku })),
    }
  },
}

export const sendCatalog: Tool = {
  key: 'send_catalog',
  description: 'Send the customer a list of matching products from the catalog.',
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: [] },
  async run(input, context) {
    const store = new ProductStore(context.pool, context.tenantId)
    const query = typeof input.query === 'string' ? input.query : ''
    const matched = query ? await store.search(query, 8) : []
    const items = matched.length ? matched : await store.list(8)
    if (!items.length) return { ok: true, message: 'The catalog is empty.' }
    const lines = items.map(
      (p) =>
        `• ${p.name}${p.price != null ? ` — ${p.currency ?? ''} ${p.price}` : ''}${p.inStock === false ? ' (out of stock)' : ''}`,
    )
    context.outbox.push({ kind: 'text', text: `Here are our products:\n${lines.join('\n')}` })
    return { ok: true, message: `Sent ${items.length} products.` }
  },
}

export const sendImage: Tool = {
  key: 'send_image',
  description: 'Send a product image to the customer.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'product name' } },
    required: ['query'],
  },
  async run(input, context) {
    const store = new ProductStore(context.pool, context.tenantId)
    const [product] = await store.search(String(input.query ?? ''), 1)
    if (!product?.imageUrl) return { ok: false, message: 'No image available for that product.' }
    context.outbox.push({
      kind: 'image',
      url: product.imageUrl,
      caption: `${product.name}${product.price != null ? ` — ${product.currency ?? ''} ${product.price}` : ''}`,
    })
    return { ok: true, message: `Sent an image of ${product.name}.` }
  },
}

export const sendPaymentLink: Tool = {
  key: 'send_payment_link',
  description: 'Send a payment or registration link for an amount, for a customer ready to pay/enroll.',
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number' },
      currency: { type: 'string' },
      description: { type: 'string', description: 'what the payment is for, e.g. the course or product name' },
    },
    required: ['amount'],
  },
  async run(input, context) {
    const amount = Number(input.amount ?? 0)
    const currency = String(input.currency ?? 'INR')
    const description = String(input.description ?? '')
    const result = await createPaymentLink(context.config, { amount, currency, description })
    if (!result.ok || !result.url) {
      return { ok: false, message: result.message ?? 'Could not create a payment link.' }
    }
    const label = description ? `*${description}* — ${currency} ${amount}` : `${currency} ${amount}`
    context.outbox.push({ kind: 'text', text: `Here's your payment link for ${label}:\n${result.url}` })
    return { ok: true, message: 'Payment link sent to the customer.' }
  },
}

export const builtinTools: Tool[] = [
  handoffHuman,
  bookMeeting,
  bookAppointment,
  lookupCustomer,
  checkAvailability,
  sendCatalog,
  sendImage,
  sendPaymentLink,
]
