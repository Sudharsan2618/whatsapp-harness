import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from '../config/env'
import type { ModelSpec } from '../config/schema'
import { createModel } from '../intelligence/models/factory'
import { discoverRelevantUrls, extractSocials } from './siteIntel'

export interface BusinessProfile {
  name: string
  about: string
  location: string
  contact: { email?: string; phone?: string; address?: string }
  hours: string
  services: string[]
  languages: string[]
  socials: Record<string, string>
}

function scrapeViaCli(url: string): string {
  const out = join(tmpdir(), `scrape-${Date.now()}.md`)
  execFileSync('firecrawl', ['scrape', url, '-o', out], { stdio: 'pipe', shell: true })
  return readFileSync(out, 'utf8')
}

export interface CrawledPage {
  url: string
  markdown: string
}

// Sitemaps, feeds, admin, and media files are not content pages.
const JUNK = /\.(xml|rss|json|png|jpe?g|gif|svg|webp|pdf|zip|mp4|ico)(\?|$)|\/wp-(sitemap|admin|json|content\/uploads)|\/feed\/?$|\/author\//i
// High-value commerce/offering pages the agent most needs to answer buyers.
const HIGH = /course-offered|\/courses?\b|online-course|premium-course|catalog|\/shop|\/product|\/service|pricing|\/price|\/fees?\b|admission|enroll|\/register|\/plans?\b/i
const MID = /\/about|\/contact|placement|\/faq|franchise|success/i

/** Rank a URL: real catalog/offering pages first, likely blog articles last. */
function scoreLink(link: string): number {
  let path = link
  try {
    path = new URL(link).pathname
  } catch {
    /* use raw */
  }
  let score = 0
  if (HIGH.test(link)) score += 10
  if (MID.test(link)) score += 4
  // A deep, heavily hyphenated last segment is usually a blog article title.
  const last = path.replace(/\/$/, '').split('/').pop() ?? ''
  const hyphens = (last.match(/-/g) ?? []).length
  if (hyphens >= 4 && !/course-offered/.test(link)) score -= 4
  return score
}

/** Discover the site's URLs via the Firecrawl map API. */
export async function mapSite(url: string): Promise<string[]> {
  const key = env.FIRECRAWL_API_KEY
  if (!key) return [url]
  const res = await fetch('https://api.firecrawl.dev/v2/map', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, limit: 300 }),
  })
  const data = (await res.json().catch(() => ({}))) as { links?: Array<string | { url: string }> }
  const links = data.links ?? []
  return links.map((l) => (typeof l === 'string' ? l : l.url)).filter(Boolean)
}

/** Scrape a known list of URLs to markdown, skipping any that fail. */
export async function crawlUrls(urls: string[]): Promise<CrawledPage[]> {
  const pages: CrawledPage[] = []
  for (const link of urls) {
    try {
      pages.push({ url: link, markdown: await scrapeUrl(link) })
    } catch {
      /* skip pages that fail */
    }
  }
  return pages
}

/**
 * Agentically select and scrape a site's useful pages. The model picks the
 * company/service/catalog/pricing pages and rejects blogs and system URLs; a
 * regex ranking is the fallback when no model is available or it returns nothing.
 */
export async function crawlSite(url: string, maxPages = 10, spec?: ModelSpec): Promise<CrawledPage[]> {
  let links: string[] = []
  try {
    links = await mapSite(url)
  } catch {
    links = []
  }

  let selected: string[]
  if (spec) {
    const discovery = await discoverRelevantUrls(url, links, spec, maxPages)
    selected = discovery.keep.map((k) => k.url)
  } else {
    selected = rankByHeuristic(url, links, maxPages)
  }
  return crawlUrls(selected)
}

/** Fallback page selection when no model is available: homepage first, then scored. */
function rankByHeuristic(url: string, links: string[], maxPages: number): string[] {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* ignore */
  }
  const sameHost = links.filter((l) => {
    try {
      return new URL(l).hostname === host && !JUNK.test(l)
    } catch {
      return false
    }
  })
  const ranked = [...new Set(sameHost)].sort((a, b) => scoreLink(b) - scoreLink(a))
  return [...new Set([url, ...ranked])].slice(0, maxPages)
}

/** Scrape a URL to markdown via the Firecrawl API (falls back to the CLI). */
export async function scrapeUrl(url: string): Promise<string> {
  const key = env.FIRECRAWL_API_KEY
  if (!key) return scrapeViaCli(url)
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
  })
  const data = (await res.json().catch(() => ({}))) as { data?: { markdown?: string }; error?: string }
  const markdown = data.data?.markdown
  if (!res.ok || !markdown) throw new Error(data.error || `firecrawl scrape failed (${res.status})`)
  return markdown
}

const EXTRACT_SYSTEM = [
  'Extract a business profile from the website content.',
  'Return ONLY a JSON object with keys:',
  '{"name","about","location","contact":{"email","phone","address"},"hours","services":[],"languages":[]}.',
  'Use "" or [] when unknown. "about" is 1-2 sentences. "services" lists the main offerings.',
  'Infer "languages" (ISO codes) from the site; default ["en"].',
].join(' ')

function parseProfile(text: string): BusinessProfile {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const obj = start >= 0 ? (JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>) : {}
  const contact = (obj.contact as BusinessProfile['contact']) ?? {}
  const services = Array.isArray(obj.services) ? (obj.services as string[]) : []
  const languages = Array.isArray(obj.languages) && obj.languages.length
    ? (obj.languages as string[])
    : ['en']
  return {
    name: String(obj.name ?? ''),
    about: String(obj.about ?? ''),
    location: String(obj.location ?? ''),
    contact,
    hours: String(obj.hours ?? ''),
    services,
    languages,
    socials: {},
  }
}

export async function extractProfile(markdown: string, spec: ModelSpec): Promise<BusinessProfile> {
  const model = createModel(spec)
  const result = await model.complete(
    [
      { role: 'system', content: EXTRACT_SYSTEM },
      { role: 'user', content: markdown.slice(0, 12000) },
    ],
    { temperature: 0 },
  )
  return parseProfile(result.text)
}

/** Short business context line injected into the agent's system prompt. */
export function profileSummary(profile: BusinessProfile): string {
  const parts: string[] = []
  if (profile.name) parts.push(`Business: ${profile.name}.`)
  if (profile.about) parts.push(profile.about)
  if (profile.location) parts.push(`Location: ${profile.location}.`)
  if (profile.services.length) parts.push(`Services: ${profile.services.join(', ')}.`)
  if (profile.hours) parts.push(`Hours: ${profile.hours}.`)
  const contact = [profile.contact.phone, profile.contact.email].filter(Boolean).join(' / ')
  if (contact) parts.push(`Contact: ${contact}.`)
  const socials = Object.entries(profile.socials ?? {})
  if (socials.length) parts.push(`Social links: ${socials.map(([k, v]) => `${k}: ${v}`).join(', ')}.`)
  return parts.join(' ')
}

/** Scrape the homepage, extract the profile, and enrich it with socials from the site. */
export async function buildProfile(url: string, spec: ModelSpec): Promise<{ profile: BusinessProfile; markdown: string }> {
  const markdown = await scrapeUrl(url)
  const profile = await extractProfile(markdown, spec)
  profile.socials = extractSocials(markdown)
  return { profile, markdown }
}
