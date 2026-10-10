import type { Pool } from 'pg'
import type { ModelSpec } from '../config/schema'
import { createModel } from './models/factory'

export interface Product {
  sku?: string
  name: string
  description?: string
  price?: number | null
  currency?: string
  inStock?: boolean | null
  url?: string
  imageUrl?: string
}

const CATALOG_SYSTEM = [
  'Extract the products from the page content.',
  'Return ONLY a JSON array of objects with keys:',
  '{"sku","name","description","price","currency","inStock","url","imageUrl"}.',
  'price is a number or null; inStock is a boolean or null; use "" when unknown.',
  'Return at most 50 products.',
].join(' ')

function parseProducts(text: string): Product[] {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < 0) return []
  const raw = JSON.parse(cleaned.slice(start, end + 1)) as Array<Record<string, unknown>>
  return raw
    .filter((p) => typeof p.name === 'string' && p.name)
    .map((p) => ({
      sku: p.sku ? String(p.sku) : undefined,
      name: String(p.name),
      description: p.description ? String(p.description) : undefined,
      price: typeof p.price === 'number' ? p.price : null,
      currency: p.currency ? String(p.currency) : undefined,
      inStock: typeof p.inStock === 'boolean' ? p.inStock : null,
      url: p.url ? String(p.url) : undefined,
      imageUrl: p.imageUrl ? String(p.imageUrl) : undefined,
    }))
}

export async function extractCatalog(markdown: string, spec: ModelSpec): Promise<Product[]> {
  const model = createModel(spec)
  const result = await model.complete(
    [
      { role: 'system', content: CATALOG_SYSTEM },
      { role: 'user', content: markdown.slice(0, 16000) },
    ],
    { temperature: 0 },
  )
  return parseProducts(result.text)
}

interface ProductRow {
  sku: string | null
  name: string
  description: string | null
  price: string | null
  currency: string | null
  in_stock: boolean | null
  url: string | null
  image_url: string | null
}

function toProduct(row: ProductRow): Product {
  return {
    sku: row.sku ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    price: row.price === null ? null : Number(row.price),
    currency: row.currency ?? undefined,
    inStock: row.in_stock,
    url: row.url ?? undefined,
    imageUrl: row.image_url ?? undefined,
  }
}

export class ProductStore {
  constructor(
    private readonly pool: Pool,
    private readonly tenantId: string,
  ) {}

  /** Replace the tenant's whole catalog in one transaction. Returns the count. */
  async replaceAll(products: Product[]): Promise<number> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      await client.query('delete from products where tenant_id = $1', [this.tenantId])
      for (const p of products) {
        await client.query(
          `insert into products (tenant_id, sku, name, description, price, currency, in_stock, url, image_url)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [this.tenantId, p.sku ?? null, p.name, p.description ?? null, p.price ?? null, p.currency ?? null, p.inStock ?? null, p.url ?? null, p.imageUrl ?? null],
        )
      }
      await client.query('commit')
      return products.length
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async search(query: string, limit: number): Promise<Product[]> {
    if (!query.trim()) return []
    const { rows } = await this.pool.query<ProductRow>(
      `with q as (select replace(plainto_tsquery('english', $2)::text, ' & ', ' | ')::tsquery as tsq)
       select sku, name, description, price, currency, in_stock, url, image_url
       from products cross join q
       where tenant_id = $1 and q.tsq <> ''::tsquery and content_tsv @@ q.tsq
       order by ts_rank(content_tsv, q.tsq) desc
       limit $3`,
      [this.tenantId, query, limit],
    )
    return rows.map(toProduct)
  }

  async list(limit: number): Promise<Product[]> {
    const { rows } = await this.pool.query<ProductRow>(
      `select sku, name, description, price, currency, in_stock, url, image_url
       from products where tenant_id = $1 order by name limit $2`,
      [this.tenantId, limit],
    )
    return rows.map(toProduct)
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      'select count(*)::int as count from products where tenant_id = $1',
      [this.tenantId],
    )
    return Number(rows[0]?.count ?? 0)
  }
}
