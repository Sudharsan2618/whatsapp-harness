const view = document.getElementById('view')
const navEl = document.getElementById('nav')
const titleEl = document.getElementById('pagehead-title')
const headActions = document.getElementById('pagehead-actions')
const backEl = document.getElementById('pagehead-back')
backEl.onclick = () => { location.hash = '#/tenants' }

const ICON = {
  dashboard: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.8L9 2.5L15.5 7.8V15.5H11.5V11H6.5V15.5H2.5V7.8Z"/></svg>',
  onboard: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6.5"/><line x1="9" y1="6" x2="9" y2="12"/><line x1="6" y1="9" x2="12" y2="9"/></svg>',
  tenants: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="6.5" r="2.8"/><path d="M3 15.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/></svg>',
}
const NAV = [
  { route: 'dashboard', label: 'Dashboard', svg: ICON.dashboard },
  { route: 'tenants', label: 'Tenants', svg: ICON.tenants },
]
const PROVIDERS = ['openrouter', 'openai', 'gemini', 'anthropic', 'echo']

const api = {
  async get(p) { return handle(await fetch('/api' + p)) },
  async post(p, b) { return handle(await fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) })) },
  async patch(p, b) { return handle(await fetch('/api' + p, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) })) },
}
async function handle(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'; t.textContent = msg; document.body.appendChild(t)
  setTimeout(() => t.remove(), 2600)
}
function setHead(title, actions = '', back = false) {
  titleEl.textContent = title
  headActions.innerHTML = actions
  backEl.style.display = back ? 'inline-flex' : 'none'
}

function renderNav(active) {
  navEl.innerHTML = NAV.map((n) =>
    `<button class="nav-item ${n.route === active ? 'active' : ''}" onclick="location.hash='#/${n.route}'"><span class="ico">${n.svg}</span>${n.label}</button>`,
  ).join('')
}

function statusBadge(s) {
  const map = { linked: 'badge-green', linking: 'badge-amber', unlinked: 'badge-gray', logged_out: 'badge-red' }
  return `<span class="badge ${map[s] || 'badge-gray'}">${s || 'no number'}</span>`
}

async function route() {
  const hash = location.hash || '#/dashboard'
  const [, path, id] = hash.split('/')
  renderNav(path)
  try {
    if (path === 'onboard') return await onboardView()
    if (path === 'tenants') return await tenantsView()
    if (path === 'tenant') return await tenantDetail(id)
    return await dashboardView()
  } catch (e) { view.innerHTML = `<div class="empty">${esc(e.message)}</div>` }
}
window.addEventListener('hashchange', route)

// ── Dashboard ──
async function dashboardView() {
  setHead('Dashboard', `<button class="btn btn-primary btn-sm" onclick="window._newAgent()">＋ New agent</button>`)
  view.innerHTML = '<div class="empty"><span class="spinner"></span></div>'
  const { tenants } = await api.get('/tenants')
  const linked = tenants.filter((t) => t.auth_status === 'linked').length
  const openHandoffs = tenants.reduce((a, t) => a + Number(t.open_handoffs || 0), 0)
  const messages = tenants.reduce((a, t) => a + Number(t.messages || 0), 0)
  view.innerHTML = `
    <p class="page-sub">Onboard a business, connect its number, and it answers on WhatsApp — grounded in its own data.</p>
    <div class="grid grid-4">
      ${stat('Tenants', tenants.length)}${stat('Linked numbers', linked)}${stat('Open handoffs', openHandoffs)}${stat('Messages', messages)}
    </div>
    <div class="card mt">
      <div class="card-head"><div><div class="card-title">Tenants</div><div class="card-sub">All onboarded businesses</div></div></div>
      <div class="card-body" style="padding:0">${tenantsTable(tenants)}</div>
    </div>`
}
const stat = (label, value) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`

function tenantsTable(tenants) {
  if (!tenants.length) return '<div class="empty">No tenants yet. Onboard your first business.</div>'
  return `<table class="table"><thead><tr><th>Business</th><th>Number</th><th>Status</th><th>Messages</th><th>Handoffs</th></tr></thead><tbody>
    ${tenants.map((t) => `<tr class="clickable" onclick="location.hash='#/tenant/${t.id}'">
      <td><b>${esc(t.business_name)}</b><div class="muted mono" style="font-size:11px">${esc(t.slug)}</div></td>
      <td class="mono">${t.phone_e164 ? '+' + esc(t.phone_e164) : '—'}</td>
      <td>${statusBadge(t.auth_status)}</td>
      <td>${t.messages || 0}</td>
      <td>${Number(t.open_handoffs) ? `<span class="badge badge-amber">${t.open_handoffs} open</span>` : '—'}</td>
    </tr>`).join('')}
  </tbody></table>`
}

async function tenantsView() {
  setHead('Tenants', `<button class="btn btn-primary btn-sm" onclick="window._newAgent()">＋ New agent</button>`)
  view.innerHTML = '<div class="empty"><span class="spinner"></span></div>'
  const { tenants } = await api.get('/tenants')
  view.innerHTML = `<p class="page-sub">Click a tenant to manage its agent, connection and knowledge.</p>
    <div class="card"><div class="card-body" style="padding:0">${tenantsTable(tenants)}</div></div>`
}

// ── Onboarding wizard ──
const wizard = { step: 1, url: '', businessName: '', slug: '', profile: null, markdown: '', archetype: 'company_info', tools: [], provider: 'openrouter', model: 'openai/gpt-6-luna', calendlyUrl: '', createdTenantId: null }
window._newAgent = () => {
  Object.assign(wizard, { step: 1, url: '', businessName: '', slug: '', profile: null, markdown: '', archetype: 'company_info', tools: [], provider: 'openrouter', model: 'openai/gpt-6-luna', calendlyUrl: '', createdTenantId: null })
  location.hash = '#/onboard'
}

async function onboardView() {
  setHead('Onboard')
  const steps = ['Website', 'Profile', 'Agent', 'Connect']
  const stepsHtml = `<div class="steps">${steps.map((s, i) => {
    const n = i + 1
    const cls = wizard.step === n ? 'active' : wizard.step > n ? 'done' : ''
    return `<div class="step ${cls}"><span class="num">${wizard.step > n ? '✓' : n}</span>${s}</div>`
  }).join('')}</div>`
  view.innerHTML = `<div class="narrow"><p class="page-sub">We scrape the website, learn the business, and set up its WhatsApp agent.</p>${stepsHtml}<div id="wizard-body"></div></div>`
  const body = document.getElementById('wizard-body')
  if (wizard.step === 1) stepWebsite(body)
  else if (wizard.step === 2) stepProfile(body)
  else if (wizard.step === 3) await stepAgent(body)
  else stepConnect(body)
}

function stepConnect(body) {
  const id = wizard.createdTenantId
  body.innerHTML = `<div class="card"><div class="card-head"><div><div class="card-title">Connect WhatsApp</div><div class="card-sub">Link the agent to a number by pairing code. The agent is already set up — this puts it live.</div></div></div>
    <div class="card-body">
      <div class="field"><label class="label">Phone (country code + number, digits only)</label><input class="input" id="oc_phone" placeholder="911234567890" /><div class="hint">Use a dedicated/secondary number — unofficial WhatsApp carries ban risk.</div></div>
      <div class="flex between"><button class="btn btn-secondary" onclick="location.hash='#/tenant/${id}'">Open agent dashboard →</button><button class="btn btn-primary" id="oc_link">Generate pairing code</button></div>
      <div id="oc_pair" class="mt"></div>
    </div></div>`
  document.getElementById('oc_link').onclick = async () => {
    const phone = val('oc_phone').replace(/\D/g, ''); if (!phone) return toast('Enter a phone number')
    const btn = document.getElementById('oc_link'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Starting…'
    try { const { numberId } = await api.post(`/tenants/${id}/link`, { phone }); pollPairing(numberId, 'oc_pair', () => { location.hash = '#/tenant/' + id }) }
    catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Generate pairing code' }
  }
}

function stepWebsite(body) {
  body.innerHTML = `<div class="card"><div class="card-body">
    <div class="field"><label class="label">Business name</label><input class="input" id="bn" value="${esc(wizard.businessName)}" placeholder="Koko Exports" /></div>
    <div class="field"><label class="label">Slug</label><input class="input" id="sl" value="${esc(wizard.slug)}" placeholder="koko-exports" /><div class="hint">Lowercase id, unique per tenant.</div></div>
    <div class="field"><label class="label">Website URL</label><input class="input" id="url" value="${esc(wizard.url)}" placeholder="https://example.com" /><div class="hint">We extract the profile and knowledge from this site via Firecrawl.</div></div>
    <div class="flex between"><span class="hint">Scraping can take ~10–20s.</span><button class="btn btn-primary" id="go">Scrape & extract →</button></div>
  </div></div>`
  document.getElementById('go').onclick = async () => {
    wizard.businessName = document.getElementById('bn').value.trim()
    wizard.slug = document.getElementById('sl').value.trim() || wizard.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    wizard.url = document.getElementById('url').value.trim()
    if (!wizard.businessName || !wizard.url) return toast('Business name and URL are required')
    const btn = document.getElementById('go'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Scraping…'
    try {
      const { profile, markdown, selected } = await api.post('/onboard/scrape', { url: wizard.url })
      wizard.profile = profile; wizard.markdown = markdown; wizard.selected = selected || []
      wizard.step = 2; onboardView()
    } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Scrape & extract →' }
  }
}

function stepProfile(body) {
  const p = wizard.profile || { contact: {}, services: [], languages: ['en'] }
  body.innerHTML = `<div class="card"><div class="card-head"><div><div class="card-title">Extracted profile</div><div class="card-sub">Review and edit what we learned from the site.</div></div></div>
    <div class="card-body">
      <div class="row"><div class="field"><label class="label">Name</label><input class="input" id="p_name" value="${esc(p.name)}" /></div>
        <div class="field"><label class="label">Location</label><input class="input" id="p_loc" value="${esc(p.location)}" /></div></div>
      <div class="field"><label class="label">About</label><textarea class="textarea" id="p_about">${esc(p.about)}</textarea></div>
      <div class="row"><div class="field"><label class="label">Phone</label><input class="input" id="p_phone" value="${esc(p.contact?.phone)}" /></div>
        <div class="field"><label class="label">Email</label><input class="input" id="p_email" value="${esc(p.contact?.email)}" /></div></div>
      <div class="field"><label class="label">Hours</label><input class="input" id="p_hours" value="${esc(p.hours)}" /></div>
      <div class="field"><label class="label">Services (comma separated)</label><input class="input" id="p_services" value="${esc((p.services || []).join(', '))}" /></div>
      <div class="field"><label class="label">Languages (comma separated)</label><input class="input" id="p_langs" value="${esc((p.languages || ['en']).join(', '))}" /></div>
      <div class="flex between"><button class="btn btn-secondary" onclick="window._wizBack(1)">← Back</button><button class="btn btn-primary" id="next2">Continue →</button></div>
    </div></div>`
  document.getElementById('next2').onclick = () => {
    wizard.profile = {
      name: val('p_name'), location: val('p_loc'), about: val('p_about'), hours: val('p_hours'),
      contact: { phone: val('p_phone'), email: val('p_email') },
      services: splitList('p_services'), languages: splitList('p_langs'),
    }
    wizard.step = 3; onboardView()
  }
}

async function stepAgent(body) {
  const { archetypes } = await api.get('/archetypes')
  const { tools } = await api.get('/tools')
  if (!wizard.tools.length) wizard.tools = (archetypes.find((a) => a.key === wizard.archetype) || {}).tools || []
  body.innerHTML = `<div class="card"><div class="card-head"><div><div class="card-title">Choose the agent type</div><div class="card-sub">Sets the default behavior and tools.</div></div></div>
    <div class="card-body">
      <div class="option-grid" id="arch">${archetypes.map((a) => `<div class="option ${a.key === wizard.archetype ? 'selected' : ''}" data-k="${a.key}"><b>${esc(a.name)}</b><small>${esc(a.description)}</small></div>`).join('')}</div>
      <label class="label mt">Tools</label>
      <div class="option-grid">${tools.map((t) => `<label class="check ${wizard.tools.includes(t.key) ? 'on' : ''}" data-tool="${t.key}"><input type="checkbox" ${wizard.tools.includes(t.key) ? 'checked' : ''}/> <span><b>${esc(t.name)}</b></span></label>`).join('')}</div>
      <label class="label mt">Integrations</label>
      <div class="field"><input class="input" id="calendly" value="${esc(wizard.calendlyUrl)}" placeholder="Booking link (e.g. https://calendly.com/your-name)" /><div class="hint">If set, the agent can share this link so customers book meetings/demos (enables the booking tool).</div></div>
      <div class="row mt"><div class="field"><label class="label">Model provider</label><select class="select" id="prov">${PROVIDERS.map((p) => `<option ${p === wizard.provider ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="field"><label class="label">Model</label><input class="input" id="model" value="${esc(wizard.model)}" /></div></div>
      <div class="flex between"><button class="btn btn-secondary" onclick="window._wizBack(2)">← Back</button><button class="btn btn-primary" id="create">Create agent →</button></div>
    </div></div>`
  body.querySelectorAll('#arch .option').forEach((el) => el.onclick = () => {
    wizard.archetype = el.dataset.k
    const a = archetypes.find((x) => x.key === wizard.archetype)
    wizard.tools = a ? [...a.tools] : []
    stepAgent(body)
  })
  body.querySelectorAll('.check').forEach((el) => el.querySelector('input').onchange = (e) => {
    const k = el.dataset.tool
    wizard.tools = e.target.checked ? [...new Set([...wizard.tools, k])] : wizard.tools.filter((x) => x !== k)
    el.classList.toggle('on', e.target.checked)
  })
  document.getElementById('create').onclick = async () => {
    wizard.provider = val('prov'); wizard.model = val('model'); wizard.calendlyUrl = val('calendly')
    if (wizard.calendlyUrl && !wizard.tools.includes('book_meeting')) wizard.tools.push('book_meeting')
    const btn = document.getElementById('create'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating & learning the site…'
    try {
      const { tenant } = await api.post('/tenants', {
        slug: wizard.slug, businessName: wizard.businessName, archetype: wizard.archetype,
        tools: wizard.tools, model: { provider: wizard.provider, model: wizard.model, temperature: 0.3 },
        profile: wizard.profile, markdown: wizard.markdown, url: wizard.url || undefined, calendlyUrl: wizard.calendlyUrl || undefined,
        selected: wizard.selected || undefined,
      })
      toast('Agent created & site learned')
      wizard.createdTenantId = tenant.id; wizard.step = 4; onboardView()
    } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Create agent →' }
  }
}
window._wizBack = (s) => { wizard.step = s; onboardView() }

// ── Tenant detail ──
async function tenantDetail(id) {
  setHead('Tenant', '', true)
  view.innerHTML = '<div class="empty"><span class="spinner"></span></div>'
  const data = await api.get('/tenants/' + id)
  const n = data.number || {}
  const cfg = data.config
  setHead(n.business_name || cfg.persona.botName, '', true)
  view.innerHTML = `
    <p class="page-sub">${esc(n.slug || '')} · ${n.phone_e164 ? '+' + esc(n.phone_e164) : 'no number'} ${statusBadge(n.auth_status)}</p>
    <div class="grid grid-2">
      <div>
        <div class="card" id="profile-card"></div>
        <div class="card" id="connect-card"></div>
        <div class="card" id="config-card"></div>
      </div>
      <div>
        <div class="card"><div class="card-head"><div><div class="card-title">Sandbox</div><div class="card-sub">Test the agent without WhatsApp</div></div></div>
          <div class="card-body"><div class="chat" id="chat"></div>
            <div class="flex mt"><input class="input" id="chat-in" placeholder="Ask the agent…" /><button class="btn btn-primary" id="chat-send">Send</button></div></div></div>
        <div class="card"><div class="card-head"><div><div class="card-title">Knowledge</div><div class="card-sub">What the agent learned from the site</div></div></div>
          <div class="card-body"><div id="kn-list"><div class="empty"><span class="spinner"></span></div></div>
            <div class="flex mt"><input class="input" id="ing-url" placeholder="https://… page or whole site" /><button class="btn btn-secondary" id="ing-go">Ingest page</button><button class="btn btn-secondary" id="crawl-go">Crawl site</button></div></div></div>
        <div class="card"><div class="card-head"><div><div class="card-title">Catalog</div><div class="card-sub">Products the agent can look up</div></div></div>
          <div class="card-body"><div id="cat-list"><div class="empty"><span class="spinner"></span></div></div>
            <div class="flex mt"><input class="input" id="cat-url" placeholder="https://… products page" /><button class="btn btn-secondary" id="cat-go">Extract catalog</button></div></div></div>
        <div class="card"><div class="card-head"><div class="card-title">Activity</div></div>
          <div class="card-body" style="padding:0">${activityTable(data, id)}</div></div>
      </div>
    </div>`
  renderProfile(id, data.profile || {})
  renderConnect(id, n)
  renderConfig(id, cfg)
  wireSandbox(id)
  loadKnowledge(id)
  loadProducts(id)
  document.getElementById('ing-go').onclick = async () => {
    const url = val('ing-url'); if (!url) return
    const btn = document.getElementById('ing-go'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'
    try { const r = await api.post(`/tenants/${id}/ingest`, { url }); toast(`Ingested ${r.chunks} chunks`); loadKnowledge(id) } catch (e) { toast(e.message) }
    btn.disabled = false; btn.textContent = 'Ingest page'
  }
  document.getElementById('crawl-go').onclick = async () => {
    const url = val('ing-url'); if (!url) return toast('Enter the site URL to crawl')
    const btn = document.getElementById('crawl-go'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Crawling…'
    try { const r = await api.post(`/tenants/${id}/crawl`, { url }); toast(`Crawled ${r.pages} pages`); loadKnowledge(id) } catch (e) { toast(e.message) }
    btn.disabled = false; btn.textContent = 'Crawl site'
  }
  document.getElementById('cat-go').onclick = async () => {
    const url = val('cat-url'); if (!url) return
    const btn = document.getElementById('cat-go'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Extracting…'
    try { const r = await api.post(`/tenants/${id}/catalog`, { url }); toast(`Extracted ${r.count} products`); loadProducts(id) } catch (e) { toast(e.message) }
    btn.disabled = false; btn.textContent = 'Extract catalog'
  }
}

async function loadKnowledge(id) {
  const el = document.getElementById('kn-list'); if (!el) return
  try {
    const { documents } = await api.get(`/tenants/${id}/knowledge`)
    if (!documents.length) { el.innerHTML = '<div class="empty">No knowledge yet. Ingest a page or crawl the site.</div>'; return }
    el.innerHTML = documents.map((d) => `<div class="doc-row"><span class="t">${esc(shortUrl(d.title))}</span><span class="chip">${d.chunks} chunk${d.chunks === 1 ? '' : 's'}</span></div>`).join('')
  } catch { el.innerHTML = '' }
}
const shortUrl = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 48)

async function loadProducts(id) {
  const el = document.getElementById('cat-list'); if (!el) return
  try {
    const { products } = await api.get(`/tenants/${id}/products`)
    if (!products.length) { el.innerHTML = '<div class="empty">No catalog. Extract one from a products URL (for shops).</div>'; return }
    el.innerHTML = `<table class="table"><tbody>${products.slice(0, 12).map((p) => `<tr><td><b>${esc(p.name)}</b></td><td class="mono">${p.price != null ? esc(p.currency || '') + ' ' + esc(p.price) : '—'}</td><td>${p.inStock === false ? '<span class="badge badge-red">out</span>' : p.inStock ? '<span class="badge badge-green">in stock</span>' : ''}</td></tr>`).join('')}</tbody></table>`
  } catch { el.innerHTML = '' }
}

function renderProfile(id, p, editing = false) {
  const el = document.getElementById('profile-card')
  const c = p.contact || {}
  if (editing) {
    el.innerHTML = `<div class="card-head"><div><div class="card-title">Business profile</div><div class="card-sub">Edit the details the agent relies on.</div></div></div>
      <div class="card-body">
        <div class="row"><div class="field"><label class="label">Name</label><input class="input" id="pf_name" value="${esc(p.name)}" /></div>
          <div class="field"><label class="label">Location</label><input class="input" id="pf_loc" value="${esc(p.location)}" /></div></div>
        <div class="field"><label class="label">About</label><textarea class="textarea" id="pf_about">${esc(p.about)}</textarea></div>
        <div class="row"><div class="field"><label class="label">Phone</label><input class="input" id="pf_phone" value="${esc(c.phone)}" /></div>
          <div class="field"><label class="label">Email</label><input class="input" id="pf_email" value="${esc(c.email)}" /></div></div>
        <div class="field"><label class="label">Hours</label><input class="input" id="pf_hours" value="${esc(p.hours)}" /></div>
        <div class="field"><label class="label">Services (comma separated)</label><input class="input" id="pf_services" value="${esc((p.services || []).join(', '))}" /></div>
        <div class="card-actions"><button class="btn btn-primary" id="pf_save">Save</button><button class="btn btn-secondary" id="pf_cancel">Cancel</button></div>
      </div>`
    document.getElementById('pf_cancel').onclick = () => renderProfile(id, p, false)
    document.getElementById('pf_save').onclick = async () => {
      const profile = {
        name: val('pf_name'), location: val('pf_loc'), about: val('pf_about'), hours: val('pf_hours'),
        contact: { phone: val('pf_phone'), email: val('pf_email') },
        services: splitList('pf_services'), languages: p.languages || ['en'],
      }
      const btn = document.getElementById('pf_save'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…'
      try { await api.patch(`/tenants/${id}/profile`, { profile }); toast('Profile saved'); renderProfile(id, profile, false) }
      catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Save' }
    }
    return
  }
  const dd = (v) => v ? esc(v) : '<span class="empty">—</span>'
  el.innerHTML = `<div class="card-head"><div><div class="card-title">Business profile</div><div class="card-sub">Learned from the website</div></div>
      <button class="btn btn-secondary btn-sm" id="pf_edit">Edit</button></div>
    <div class="card-body">
      <div class="readblock">
        <h4>${dd(p.name)}</h4>
        ${p.about ? `<p class="lead">${esc(p.about)}</p>` : ''}
        <dl class="dl">
          <dt>Location</dt><dd class="${p.location ? '' : 'empty'}">${dd(p.location)}</dd>
          <dt>Phone</dt><dd class="${c.phone ? '' : 'empty'}">${dd(c.phone)}</dd>
          <dt>Email</dt><dd class="${c.email ? '' : 'empty'}">${dd(c.email)}</dd>
          <dt>Hours</dt><dd class="${p.hours ? '' : 'empty'}">${dd(p.hours)}</dd>
          <dt>Services</dt><dd>${(p.services || []).length ? `<div class="chips">${p.services.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : '<span class="empty">—</span>'}</dd>
          <dt>Social</dt><dd>${Object.keys(p.socials || {}).length ? `<div class="chips">${Object.entries(p.socials).map(([k, v]) => `<a class="chip" href="${esc(v)}" target="_blank" rel="noopener">${esc(k)}</a>`).join('')}</div>` : '<span class="empty">—</span>'}</dd>
        </dl>
      </div>
    </div>`
  document.getElementById('pf_edit').onclick = () => renderProfile(id, p, true)
}

function renderConnect(id, n) {
  const card = document.getElementById('connect-card')
  if (n.auth_status === 'linked') {
    card.innerHTML = `<div class="card-head"><div><div class="card-title">Connection</div><div class="card-sub">WhatsApp number</div></div>${statusBadge('linked')}</div>
      <div class="card-body"><div class="flex between"><div class="flex"><b class="mono">+${esc(n.phone_e164)}</b> <span class="badge badge-green">live</span></div>
        <button class="btn btn-secondary btn-sm" id="disconnect">Disconnect</button></div>
        <div class="hint mt">The agent is answering on this number. Disconnecting logs it out of WhatsApp and frees it.</div></div>`
    document.getElementById('disconnect').onclick = async () => {
      if (!confirm('Disconnect this number? It will be logged out of WhatsApp and removed from this agent.')) return
      const btn = document.getElementById('disconnect'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Disconnecting…'
      try { await api.post(`/tenants/${id}/disconnect`, {}); toast('Disconnected'); route() } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Disconnect' }
    }
    return
  }
  card.innerHTML = `<div class="card-head"><div><div class="card-title">Connect WhatsApp</div><div class="card-sub">Link a number by pairing code</div></div></div>
    <div class="card-body">
      <div class="field"><label class="label">Phone (country code + number, digits only)</label><input class="input" id="phone" value="${esc(n.phone_e164 || '')}" placeholder="911234567890" /></div>
      <button class="btn btn-primary" id="link">Generate pairing code</button>
      <div id="pair"></div>
    </div>`
  document.getElementById('link').onclick = async () => {
    const phone = val('phone').replace(/\D/g, ''); if (!phone) return toast('Enter a phone number')
    const btn = document.getElementById('link'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Starting…'
    try { const { numberId } = await api.post(`/tenants/${id}/link`, { phone }); pollPairing(numberId) }
    catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Generate pairing code' }
  }
}

let _pollCtx = null
async function pollPairing(numberId, elId = 'pair', onLinked = route) {
  _pollCtx = { numberId, elId, onLinked }
  const pair = document.getElementById(elId)
  if (!pair) return
  // ~7.5 min window so there's plenty of time to enter the code on the phone.
  for (let i = 0; i < 180; i++) {
    let s = {}
    try { s = await api.get(`/numbers/${numberId}/status`) } catch { /* transient */ }
    if (s.authStatus === 'linked') {
      pair.innerHTML = '<div class="badge badge-green mt">Linked ✓</div>'
      toast('Linked!'); setTimeout(onLinked, 1000); return
    }
    if (s.code) {
      const formatted = s.code.length === 8 ? s.code.slice(0, 4) + '-' + s.code.slice(4) : s.code
      pair.innerHTML = `<div class="mt"><div class="hint">On the phone: WhatsApp → Linked devices → Link with phone number, then enter:</div>
        <div class="pair-code mt">${esc(formatted)}</div>
        <div class="hint mt"><span class="spinner"></span> Waiting for you to enter it on the phone…</div></div>`
    } else {
      pair.innerHTML = '<div class="hint mt"><span class="spinner"></span> Requesting pairing code…</div>'
    }
    await new Promise((r) => setTimeout(r, 2500))
  }
  pair.innerHTML += `<div class="mt"><button class="btn btn-secondary btn-sm" onclick="window._recheck()">I entered it — check now</button></div>`
}
window._recheck = () => { if (_pollCtx) pollPairing(_pollCtx.numberId, _pollCtx.elId, _pollCtx.onLinked) }

function renderConfig(id, cfg, editing = false) {
  const el = document.getElementById('config-card')
  if (editing) {
    el.innerHTML = `<div class="card-head"><div><div class="card-title">Configuration</div><div class="card-sub">Persona, tools and model</div></div></div>
      <div class="card-body">
        <div class="row"><div class="field"><label class="label">Bot name</label><input class="input" id="c_name" value="${esc(cfg.persona.botName)}" /></div>
          <div class="field"><label class="label">Languages</label><input class="input" id="c_langs" value="${esc(cfg.persona.languages.join(', '))}" /></div></div>
        <div class="field"><label class="label">Tone</label><input class="input" id="c_tone" value="${esc(cfg.persona.tone)}" /></div>
        <div class="field"><label class="label">Instructions</label><textarea class="textarea" id="c_extra">${esc(cfg.persona.systemPromptExtra || '')}</textarea></div>
        <div class="field"><label class="label">Booking link (Calendly)</label><input class="input" id="c_cal" value="${esc(cfg.integrations?.calendlyUrl || '')}" placeholder="https://calendly.com/…" /></div>
        <div class="row"><div class="field"><label class="label">Provider</label><select class="select" id="c_prov">${PROVIDERS.map((p) => `<option ${p === cfg.model.provider ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
          <div class="field"><label class="label">Model</label><input class="input" id="c_model" value="${esc(cfg.model.model)}" /></div></div>
        <div class="card-actions"><button class="btn btn-primary" id="save-cfg">Save</button><button class="btn btn-secondary" id="cancel-cfg">Cancel</button></div>
      </div>`
    document.getElementById('cancel-cfg').onclick = () => renderConfig(id, cfg, false)
    document.getElementById('save-cfg').onclick = async () => {
      const calendly = val('c_cal')
      const tools = [...(cfg.tools || [])]
      if (calendly && !tools.includes('book_meeting')) tools.push('book_meeting')
      const overrides = {
        persona: { botName: val('c_name'), tone: val('c_tone'), languages: splitList('c_langs'), systemPromptExtra: val('c_extra') },
        guardrails: cfg.guardrails, tools, retrieval: cfg.retrieval,
        model: { provider: val('c_prov'), model: val('c_model'), temperature: cfg.model.temperature },
        integrations: calendly ? { calendlyUrl: calendly } : {},
      }
      const btn = document.getElementById('save-cfg'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…'
      try { await api.patch('/tenants/' + id, { overrides }); toast('Saved'); renderConfig(id, { ...cfg, ...overrides }, false) }
      catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Save' }
    }
    return
  }
  const cal = cfg.integrations?.calendlyUrl
  el.innerHTML = `<div class="card-head"><div><div class="card-title">Configuration</div><div class="card-sub">How the agent behaves</div></div>
      <button class="btn btn-secondary btn-sm" id="cfg_edit">Edit</button></div>
    <div class="card-body">
      <dl class="dl">
        <dt>Bot name</dt><dd>${esc(cfg.persona.botName)}</dd>
        <dt>Tone</dt><dd>${esc(cfg.persona.tone)}</dd>
        <dt>Languages</dt><dd><div class="chips">${cfg.persona.languages.map((l) => `<span class="chip">${esc(l)}</span>`).join('')}</div></dd>
        <dt>Model</dt><dd><span class="chip brand">${esc(cfg.model.provider)} · ${esc(cfg.model.model)}</span></dd>
        <dt>Tools</dt><dd>${(cfg.tools || []).length ? `<div class="chips">${cfg.tools.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : '<span class="empty">none</span>'}</dd>
        <dt>Booking</dt><dd class="${cal ? '' : 'empty'}">${cal ? esc(cal) : 'not set'}</dd>
      </dl>
    </div>`
  document.getElementById('cfg_edit').onclick = () => renderConfig(id, cfg, true)
}

function wireSandbox(id) {
  const chat = document.getElementById('chat')
  const input = document.getElementById('chat-in')
  const send = async () => {
    const text = input.value.trim(); if (!text) return
    input.value = ''
    chat.innerHTML += `<div class="bubble user">${esc(text)}</div>`
    chat.scrollTop = chat.scrollHeight
    const loading = document.createElement('div'); loading.className = 'bubble bot'; loading.innerHTML = '<span class="spinner"></span>'
    chat.appendChild(loading); chat.scrollTop = chat.scrollHeight
    try {
      const r = await api.post(`/tenants/${id}/chat`, { text })
      const meta = `${r.toolsCalled.length ? 'tools: ' + r.toolsCalled.join(', ') + ' · ' : ''}${r.knowledgeUsed} chunk(s) · ${r.tokensIn || 0}/${r.tokensOut || 0} tok`
      loading.innerHTML = `${esc(r.reply)}<div class="bubble-meta">${esc(meta)}</div>`
      for (const m of r.outbox || []) {
        const b = document.createElement('div'); b.className = 'bubble bot'
        if (m.kind === 'image') b.innerHTML = `🖼️ ${esc(m.caption || 'image')}<div class="bubble-meta mono">${esc(m.url)}</div>`
        else if (m.kind === 'location') b.innerHTML = `📍 ${esc(m.name || 'location')}`
        else if (m.kind === 'document') b.innerHTML = `📄 ${esc(m.fileName || 'document')}`
        else b.textContent = m.text
        chat.appendChild(b)
      }
    } catch (e) { loading.innerHTML = esc(e.message) }
    chat.scrollTop = chat.scrollHeight
  }
  document.getElementById('chat-send').onclick = send
  input.onkeydown = (e) => { if (e.key === 'Enter') send() }
}

function activityTable(data, tenantId) {
  const runs = data.runs || [], handoffs = (data.handoffs || []).filter((h) => h.status === 'open')
  let html = ''
  if (handoffs.length) {
    html += `<table class="table"><thead><tr><th>Open handoff</th><th>Reason</th><th></th></tr></thead><tbody>${handoffs.map((h) => `<tr><td class="mono" style="font-size:11px">${esc(h.chat_jid)}</td><td class="muted">${esc(h.reason || '')}</td><td><button class="btn btn-secondary btn-sm" onclick="window._closeHandoff('${tenantId}','${esc(h.chat_jid)}')">Resume</button></td></tr>`).join('')}</tbody></table>`
  }
  if (!runs.length) return html || '<div class="empty">No activity yet.</div>'
  html += `<table class="table"><thead><tr><th>Route</th><th>By</th><th>Latency</th><th>When</th></tr></thead><tbody>${runs.map((r) => `<tr><td><span class="badge ${r.route === 'handoff' ? 'badge-amber' : r.route === 'action' ? 'badge-blue' : 'badge-gray'}">${r.route}</span></td><td>${r.handled_by}</td><td>${r.latency_ms || 0}ms</td><td class="muted">${new Date(r.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table>`
  return html
}

window._closeHandoff = async (tenantId, chatJid) => {
  try { await api.post(`/tenants/${tenantId}/handoffs/close`, { chatJid }); toast('Resumed'); route() } catch (e) { toast(e.message) }
}

const val = (id) => (document.getElementById(id)?.value || '').trim()
const splitList = (id) => val(id).split(',').map((s) => s.trim()).filter(Boolean)

route()
