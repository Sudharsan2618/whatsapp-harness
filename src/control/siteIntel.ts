import type { ModelSpec } from '../config/schema'
import { createModel } from '../intelligence/models/factory'

// Sitemaps, feeds, admin, media, and auth/cart flows are never content worth reading.
const JUNK = /\.(xml|rss|json|png|jpe?g|gif|svg|webp|pdf|zip|mp4|ico)(\?|$)|\/wp-(sitemap|admin|json|content\/uploads)|\/feed\/?$|\/author\/|\/tag\/|\/category\/|\/(cart|checkout|login|account|my-account|wp-login)\b/i

const SOCIAL_PATTERNS: Array<{ platform: string; re: RegExp }> = [
  { platform: 'facebook', re: /https?:\/\/(?:www\.)?(?:facebook|fb)\.com\/[^\s)"']+/i },
  { platform: 'instagram', re: /https?:\/\/(?:www\.)?instagram\.com\/[^\s)"']+/i },
  { platform: 'linkedin', re: /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)"']+/i },
  { platform: 'twitter', re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^\s)"']+/i },
  { platform: 'youtube', re: /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s)"']+/i },
  { platform: 'telegram', re: /https?:\/\/(?:www\.)?t\.me\/[^\s)"']+/i },
  { platform: 'whatsapp', re: /https?:\/\/(?:wa\.me|chat\.whatsapp\.com)\/[^\s)"']+/i },
  { platform: 'pinterest', re: /https?:\/\/(?:www\.)?pinterest\.[a-z.]+\/[^\s)"']+/i },
]

export interface UrlSelection {
  url: string
  category: string
}

export interface SiteDiscovery {
  keep: UrlSelection[]
  rejectedCount: number
  totalCount: number
}

function sameHost(links: string[], base: string): string[] {
  let host = ''
  try {
    host = new URL(base).hostname
  } catch {
    return links
  }
  return links.filter((l) => {
    try {
      return new URL(l).hostname === host && !JUNK.test(l)
    } catch {
      return false
    }
  })
}

const CLASSIFY_SYSTEM = [
  'You select which pages of a business website are worth reading to build a WhatsApp sales/support assistant for that business.',
  'KEEP pages that describe the business or what it sells: home, about, services, courses, products, catalog, pricing, fees, plans, contact, locations, FAQ, admissions, how-it-works, shipping/returns policy.',
  'REJECT blog posts, news, press, articles, opinion pieces, events, galleries/photos, testimonials feeds, author/tag/category/date archives, careers, and login/cart/checkout pages.',
  'Return ONLY JSON: {"keep":[{"url":"<exact url>","category":"home|about|services|catalog|pricing|contact|faq|other"}],"reject":["<url>"]}.',
  'Keep the most informative pages only. Always keep the homepage. Do not invent URLs; use only those given.',
].join(' ')

function parseSelection(text: string): { keep: UrlSelection[]; reject: string[] } {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < 0) return { keep: [], reject: [] }
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as {
      keep?: Array<{ url?: string; category?: string }>
      reject?: string[]
    }
    const keep = (obj.keep ?? [])
      .filter((k) => typeof k.url === 'string')
      .map((k) => ({ url: k.url as string, category: String(k.category ?? 'other') }))
    return { keep, reject: Array.isArray(obj.reject) ? obj.reject : [] }
  } catch {
    return { keep: [], reject: [] }
  }
}

/**
 * Agentically choose which of a site's pages to read: map the site, drop obvious
 * junk, then let the model keep the pages relevant to the business and reject
 * blogs and system pages. Falls back to a plain homepage-first list if the model
 * returns nothing usable.
 */
export async function discoverRelevantUrls(
  url: string,
  candidates: string[],
  spec: ModelSpec,
  max = 14,
): Promise<SiteDiscovery> {
  const pages = [...new Set(sameHost(candidates, url))]
  const total = pages.length
  if (!pages.length) return { keep: [{ url, category: 'home' }], rejectedCount: 0, totalCount: 0 }

  const model = createModel(spec)
  const list = pages.slice(0, 200).join('\n')
  let keep: UrlSelection[] = []
  try {
    const result = await model.complete(
      [
        { role: 'system', content: CLASSIFY_SYSTEM },
        { role: 'user', content: `Business homepage: ${url}\nCandidate URLs:\n${list}` },
      ],
      { temperature: 0 },
    )
    keep = parseSelection(result.text).keep.filter((k) => pages.includes(k.url) || k.url === url)
  } catch {
    keep = []
  }

  if (!keep.length) {
    keep = [{ url, category: 'home' }, ...pages.filter((p) => p !== url).map((p) => ({ url: p, category: 'other' }))]
  }
  if (!keep.some((k) => k.url === url)) keep.unshift({ url, category: 'home' })

  const deduped = [...new Map(keep.map((k) => [k.url, k])).values()].slice(0, max)
  return { keep: deduped, rejectedCount: Math.max(0, total - deduped.length), totalCount: total }
}

/** Pull social-media profile links out of page markdown. */
export function extractSocials(markdown: string): Record<string, string> {
  const socials: Record<string, string> = {}
  for (const { platform, re } of SOCIAL_PATTERNS) {
    const match = markdown.match(re)
    if (!match) continue
    const link = match[0].replace(/[).,;"']+$/, '')
    // Skip bare share widgets (e.g. facebook.com/sharer) in favour of real profiles.
    if (/\/(sharer|share|intent|dialog)\b/i.test(link)) continue
    socials[platform] = link
  }
  return socials
}
