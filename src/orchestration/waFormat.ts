/**
 * Normalize model output to WhatsApp's formatting conventions. WhatsApp has no
 * Markdown: links must be bare URLs, bold is *single* asterisks, and headings
 * do not exist. Models drift back to Markdown, so this is applied to every
 * outgoing text as a safety net regardless of what the prompt asked for.
 */
export function toWhatsAppText(input: string): string {
  if (!input) return input
  return input
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) =>
      label.trim() === url.trim() ? url : `${label}: ${url}`,
    )
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s*(.+)$/gm, '*$1*')
}

function normalizeUrl(u: string): string {
  return u.trim().replace(/[).,;!?]+$/, '').replace(/\/+$/, '').toLowerCase()
}

/**
 * Remove any URL the model emitted that is not on the allowlist. Models invent
 * plausible links (fake payment pages, guessed site paths); only verified
 * knowledge URLs and configured integration URLs may reach the customer. A
 * disallowed link is replaced with `fallback` (the site homepage) when given,
 * otherwise dropped. Tool-generated messages are trusted and skip this.
 */
export function enforceLinks(input: string, allowed: string[], fallback?: string): string {
  if (!input) return input
  const allow = new Set(allowed.filter(Boolean).map(normalizeUrl))
  const fb = fallback ? fallback.trim() : ''
  return input.replace(/https?:\/\/[^\s)]+/g, (match) => {
    if (allow.has(normalizeUrl(match))) return match
    return fb
  })
}
