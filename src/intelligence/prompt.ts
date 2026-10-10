import type { ResolvedTenantConfig } from '../config/schema'
import type { Tool } from './tools/types'

/** Build the system prompt from persona, guardrails, enabled tools, and retrieved knowledge. */
export function buildSystemPrompt(
  config: ResolvedTenantConfig,
  tools: Tool[],
  knowledge: string[] = [],
  links: string[] = [],
): string {
  const { persona, guardrails } = config
  const lines: string[] = [
    `You are ${persona.botName}, a WhatsApp assistant for this business.`,
    `Tone: ${persona.tone}. Reply in the customer's language (supported: ${persona.languages.join(', ')}).`,
  ]
  if (persona.businessHours) lines.push(`Business hours: ${persona.businessHours}.`)
  if (guardrails.mustRefuse.length) {
    lines.push(`Never do the following: ${guardrails.mustRefuse.join('; ')}.`)
  }
  if (guardrails.disclaimers.length) {
    lines.push(`Include these disclaimers when relevant: ${guardrails.disclaimers.join(' ')}`)
  }
  if (guardrails.escalateWhen.length) {
    lines.push(`Hand off to a human when: ${guardrails.escalateWhen.join('; ')}.`)
  }
  if (tools.length) {
    lines.push(
      `Available actions: ${tools.map((t) => `${t.key} (${t.description})`).join('; ')}.`,
      'Call an action instead of describing it. When a customer wants to pay or register, book a slot, see a product image, or get the catalog, invoke the matching action rather than pasting a plain answer. Actions deliver their own message to the customer, so do not repeat their content in your reply.',
    )
  }
  if (persona.systemPromptExtra) lines.push(persona.systemPromptExtra)

  lines.push(
    '',
    'Formatting (this is WhatsApp, not a web page):',
    '- Bold with *single asterisks*, italics with _underscores_. No Markdown headings (#) or Markdown links.',
    '- Never write links as [text](url). Put the bare URL on its own, e.g. https://example.com/page.',
    '- Use short lines and "- " for bullets. Keep replies brief and skimmable on a phone.',
  )

  lines.push(
    '',
    'Grounding rules (important):',
    '- Use only the business information below. Never invent prices, dates, course names, or any detail that is not stated there. If you are unsure, say you will check with the team and offer to connect them.',
    '- Only share links (URLs) that appear verbatim in the business information or the verified links list. Never guess, shorten, or construct a URL. If you do not have the exact page link, share the main website or offer to connect the customer with the team — do not make up a link.',
  )

  if (links.length) {
    lines.push(
      '',
      'Verified links you may share (use these exactly, do not alter them). When the customer asks about offerings, a catalog, a specific course or product, share the most relevant link from this list rather than handing off:',
      ...links.map((l) => `- ${l}`),
    )
  }

  if (knowledge.length) {
    lines.push('', 'Business information:', ...knowledge.map((chunk) => `- ${chunk}`))
  } else {
    lines.push(
      '',
      'You have no specific business information retrieved for this question. Do not guess — offer the main website or to connect the customer with the team.',
    )
  }

  return lines.join('\n')
}
