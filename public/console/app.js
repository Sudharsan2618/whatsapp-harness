'use strict'

// ── Icons (exact paths from the design) ──
const ICON = {
  Overview: 'M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5z',
  Agent: 'M3 5.5h10v7H3zM8 3v2.5M6 9h.01M10 9h.01',
  Knowledge: 'M3 3h4.5v10H3zM8.5 3H13v10H8.5z',
  Catalog: 'M2.5 5L8 2.5 13.5 5v6L8 13.5 2.5 11zM2.5 5L8 7.5 13.5 5M8 7.5v6',
  Conversations: 'M2.5 3.5h11v7H6l-3.5 2.5z',
  WhatsApp: 'M5 2.5h6v11H5zM7.5 11.5h1',
  Integrations: 'M6 2.5v3M10 2.5v3M4.5 5.5h7V8a3.5 3.5 0 0 1-7 0zM8 11.5v2',
  Settings: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1',
  search: 'M10.5 10.5L14 14',
}

const NAV = [
  { label: null, items: ['Overview', 'Agent', 'Knowledge', 'Catalog', 'Conversations'] },
  { label: 'Connect', items: ['WhatsApp', 'Integrations'] },
  { label: 'Account', items: ['Settings'] },
]
const ROUTE = {
  Overview: 'overview', Agent: 'agent', Knowledge: 'knowledge', Catalog: 'catalog',
  Conversations: 'conversations', WhatsApp: 'whatsapp', Integrations: 'integrations', Settings: 'settings',
}

// ── Helpers ──
const $ = (sel, root = document) => root.querySelector(sel)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const api = {
  async get(p) { const r = await fetch('/api' + p); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText); return r.json() },
  async post(p, b) { const r = await fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText); return r.json() },
}
const icoSvg = (d) => `<svg class="ac-ico" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const initials = (s) => (s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
function fmtPhone(p) { if (!p) return ''; const d = String(p).replace(/\D/g, ''); if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`; return '+' + d }
function fmtDuration(ms) { if (!ms) return '—'; if (ms < 60000) return `${Math.round(ms / 1000)} sec`; return `${(ms / 60000).toFixed(1)} min` }
function timeAgo(ts) {
  if (!ts) return ''
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400) return `${Math.floor(s / 3600)} h`
  return `${Math.floor(s / 86400)} d`
}

// ── State ──
const state = { tenant: null, status: 'down', phone: null, handoffCount: 0 }

// ── Shell ──
function navHtml(active) {
  const adminBack = (state.user && state.user.role === 'admin')
    ? `<a href="#/admin" class="ac-nav" style="color:var(--text-2)">${BACK_ICO}<span>All agents</span></a>`
    : ''
  return adminBack + NAV.map((g) => {
    const group = g.label ? `<div class="ac-nav-group">${g.label}</div>` : ''
    const items = g.items.map((name) => {
      const on = name === active ? ' ac-nav-on' : ''
      const count = name === 'Conversations' && state.handoffCount ? `<span class="ac-nav-count">${state.handoffCount}</span>` : ''
      return `<a href="#/${ROUTE[name]}" class="ac-nav${on}">${icoSvg(ICON[name])}<span>${name}</span>${count}</a>`
    }).join('')
    return group + items
  }).join('')
}

function shell(active, mainHtml) {
  const live = state.status === 'live'
  const badge = live
    ? `<span class="ac-badge ac-badge-green"><span class="ac-badge-dot"></span>Live</span>`
    : `<span class="ac-badge ac-badge-red"><span class="ac-badge-dot"></span>Not connected</span>`
  const tname = state.tenant?.business_name || 'Your business'
  $('#app').innerHTML = `
  <div class="ac-shell">
    <header class="ac-appbar">
      <a href="#/overview" class="ac-appbar-brand"><span class="ac-appbar-mark">A</span><span>Agent Console</span></a>
      <div class="ac-appbar-mid">
        <label class="ac-search">
          <svg class="ac-ico" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="${ICON.search}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input placeholder="Search conversations, pages, settings" aria-label="Search">
        </label>
      </div>
      <div class="ac-appbar-end">
        <span style="font-size:13px;color:var(--text-2)">${esc(tname)}</span>
        <a href="#/settings" class="ac-avatar" aria-label="Account">${esc(initials(tname))}</a>
      </div>
    </header>
    <div class="ac-body">
      <nav class="ac-sidebar" aria-label="Main">
        ${navHtml(active)}
        <div class="ac-sidebar-foot">
          <span style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-2)">Your bot</span>
          <div style="display:flex;align-items:center;gap:8px">${badge}<span style="font-size:13px;color:var(--text-2)">${esc(fmtPhone(state.phone))}</span></div>
        </div>
      </nav>
      <main class="ac-main">${mainHtml}</main>
    </div>
  </div>`
}

function pagehead(title, actions = '') {
  return `<div class="ac-pagehead"><h1>${esc(title)}</h1><div class="ac-pagehead-actions">${actions}</div></div>`
}
function loading() { return `<div class="ac-content"><div class="ac-empty"><span class="ac-spin"></span></div></div>` }
function stub(title) {
  return shell(title, pagehead(title) + `<div class="ac-content"><div class="ac-card"><div class="ac-card-body"><div class="ac-empty"><div class="ac-empty-ico">${icoSvg(ICON[title] || ICON.Overview)}</div><div class="ac-empty-title">${esc(title)}</div><p>This screen is being built next.</p></div></div></div></div>`)
}

// ── Overview screen ──
async function overview(range = 'today') {
  shell('Overview', loading())
  let d
  try { d = await api.get(`/tenants/${state.tenant.id}/overview?range=${range === '7d' ? '7d' : 'today'}`) } catch (e) { shell('Overview', pagehead('Overview') + `<div class="ac-content"><div class="ac-note">Could not load overview: ${esc(e.message)}</div></div>`); return }

  state.status = d.connection.status
  state.phone = d.connection.phone
  state.handoffCount = d.attention.length
  const live = d.connection.status === 'live'
  const rangeLabel = range === '7d' ? 'Last 7 days' : 'Today'

  const head = pagehead('Overview', `
    <div class="ac-seg" role="group" aria-label="Date range">
      <button type="button" aria-pressed="${range !== '7d'}" onclick="location.hash='#/overview'">Today</button>
      <button type="button" aria-pressed="${range === '7d'}" onclick="location.hash='#/overview/7d'">7 days</button>
    </div>
    <a class="ac-btn ac-btn-secondary" href="#/sandbox">Test your bot</a>`)

  const hero = live ? `
    <section class="ac-card" style="padding:20px;display:flex;flex-wrap:wrap;align-items:center;gap:20px">
      <div style="width:48px;height:48px;border-radius:9999px;background:var(--success-bg);display:grid;place-items:center;flex:0 0 auto">
        <span style="width:14px;height:14px;border-radius:9999px;background:var(--success);box-shadow:0 0 0 6px rgba(90,200,124,.25)"></span>
      </div>
      <div style="flex:1 1 320px;min-width:0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h2 style="margin:0;font-size:20px;line-height:28px;font-weight:700">Your bot is live</h2>
          <span class="ac-badge ac-badge-green"><span class="ac-badge-dot"></span>Live</span>
        </div>
        <p style="margin:4px 0 0;font-size:13px;line-height:18px;color:var(--text-2)">Answering customers on WhatsApp at ${esc(fmtPhone(d.connection.phone))}</p>
      </div>
      <a class="ac-btn ac-btn-secondary" href="#/whatsapp">Manage connection</a>
    </section>` : `
    <section class="ac-card" style="padding:20px;display:flex;flex-wrap:wrap;align-items:center;gap:20px">
      <div style="width:48px;height:48px;border-radius:9999px;background:var(--danger-bg);display:grid;place-items:center;flex:0 0 auto">
        <span style="width:14px;height:14px;border-radius:9999px;background:var(--danger)"></span>
      </div>
      <div style="flex:1 1 320px;min-width:0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h2 style="margin:0;font-size:20px;line-height:28px;font-weight:700">Your bot isn't connected</h2>
          <span class="ac-badge ac-badge-red"><span class="ac-badge-dot"></span>Not connected</span>
        </div>
        <p style="margin:4px 0 0;font-size:13px;line-height:18px;color:var(--text-2)">Link a WhatsApp number to put your bot live.</p>
      </div>
      <a class="ac-btn ac-btn-primary" href="#/whatsapp">Connect WhatsApp</a>
    </section>`

  const stat = (label, value) => `<div class="ac-stat"><div class="ac-stat-label">${label}</div><div class="ac-stat-value">${esc(value)}</div><div class="ac-stat-hint">${rangeLabel}</div></div>`
  const stats = `<div class="ac-grid-4">
    ${stat('Conversations', d.stats.conversations.toLocaleString())}
    ${stat('Messages', d.stats.messages.toLocaleString())}
    ${stat('Needed a human', d.stats.neededHuman.toLocaleString())}
    ${stat('Avg reply time', fmtDuration(d.stats.avgLatencyMs))}
  </div>`

  const attnRows = d.attention.length ? d.attention.map((a, i) => {
    const nm = a.name || fmtPhone(a.chatJid.replace(/@.*/, '')) || a.chatJid
    const av = a.name ? `<span class="ac-avatar-lg">${esc(initials(a.name))}</span>` : `<span class="ac-avatar-lg" style="background:var(--surface);color:var(--text-2)">${esc((fmtPhone(a.chatJid.replace(/@.*/, '')) || '?').slice(0, 3))}</span>`
    const border = i < d.attention.length - 1 ? 'border-bottom:1px solid var(--border)' : ''
    return `<div style="display:flex;align-items:center;gap:12px;padding:14px 20px;${border}">
      ${av}
      <div style="flex:1 1 0;min-width:0">
        <div style="font-weight:600">${esc(nm)} <span style="font-weight:400;color:var(--text-2)">· waiting ${timeAgo(a.since)}</span></div>
        <div style="font-size:13px;line-height:18px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.lastText ? '“' + esc(a.lastText) + '”' : esc(a.reason || 'Waiting for a reply')}</div>
      </div>
      <a class="ac-btn ac-btn-primary ac-btn-sm" href="#/conversations">Reply</a>
    </div>`
  }).join('') : `<div class="ac-card-body"><div class="ac-empty" style="padding:28px 20px"><div class="ac-empty-title">All clear</div><p>No customers are waiting for a person right now.</p></div></div>`

  const attention = `<section class="ac-card">
    <div class="ac-card-head">
      <div><h3 class="ac-card-title">Needs your attention</h3><p class="ac-card-sub">${d.attention.length ? `${d.attention.length} ${d.attention.length === 1 ? 'customer is' : 'customers are'} waiting for a person to reply` : 'Nothing waiting on you'}</p></div>
      <a class="ac-btn ac-btn-ghost ac-btn-sm" href="#/conversations">View all</a>
    </div>
    <div>${attnRows}</div>
  </section>`

  const testCard = `<section class="ac-card">
    <div class="ac-card-head"><div><h3 class="ac-card-title">Test your bot</h3><p class="ac-card-sub">Ask a question the way a customer would</p></div></div>
    <div class="ac-card-body" style="display:flex;flex-direction:column;gap:14px">
      <div class="ac-chat">
        <div class="ac-bubble ac-bubble-user">What do you offer?</div>
        <div class="ac-bubble ac-bubble-bot">Here's a quick overview of what we do — ask me anything and I'll answer from ${esc(state.tenant?.business_name || 'the business')}'s info.</div>
      </div>
      <a class="ac-btn ac-btn-secondary" href="#/sandbox" style="align-self:flex-start">Open the test chat</a>
    </div>
  </section>`

  const glanceCol = (href, label, big, small) => `<a href="${href}" style="display:block;padding:16px 20px;color:inherit;text-decoration:none;border-right:1px solid var(--border)">
    <div class="ac-stat-label">${label}</div>
    <div style="margin-top:4px;font-weight:600">${esc(big)}</div>
    <div style="font-size:13px;color:var(--text-2)">${esc(small)}</div></a>`
  const glance = `<section class="ac-card">
    <div class="ac-card-head"><div><h3 class="ac-card-title">Your bot at a glance</h3><p class="ac-card-sub">What shapes its answers right now</p></div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      ${glanceCol('#/knowledge', 'Knowledge', `Learned from ${d.knowledge.pages} page${d.knowledge.pages === 1 ? '' : 's'}`, d.knowledge.processing ? `${d.knowledge.processing} page still processing` : 'All pages processed')}
      ${glanceCol('#/agent', 'Skills', `${d.skills.on} of ${d.skills.total} turned on`, 'Tap to manage what your bot can do')}
      ${glanceCol('#/integrations', 'Integrations', `${d.integrations.connected} connected`, d.integrations.names.join(', ') || 'None yet')}
    </div>
  </section>`

  shell('Overview', head + `<div class="ac-content">${hero}${stats}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;align-items:start">${attention}${testCard}</div>
    ${glance}</div>`)
}

// ── Config helpers (shared by Agent/Settings/etc.) ──
async function getTenant() { return api.get('/tenants/' + state.tenant.id) }
async function saveConfig(config) { await api.patch('/tenants/' + state.tenant.id, { overrides: config }) }
api.patch = async (p, b) => { const r = await fetch('/api' + p, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText); return r.json() }
api.del = async (p) => { const r = await fetch('/api' + p, { method: 'DELETE' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText); return r.json() }
function toast(msg) {
  const t = document.createElement('div'); t.className = 'ac-toast ac-toast-fixed'; t.textContent = msg
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600)
}

// Skill metadata (friendly, from the design), ordered. req: integration a skill needs.
const SKILLS = [
  { key: 'book_appointment', title: 'Take an appointment', desc: 'Books a slot and confirms it with the customer.' },
  { key: 'check_availability', title: 'Check availability', desc: 'Tells customers which days and times are free.' },
  { key: 'book_meeting', title: 'Book a meeting', desc: 'Sends your booking link so customers pick a time.' },
  { key: 'lookup_customer', title: 'Look up a customer', desc: 'Recognises returning customers and their past visits.' },
  { key: 'send_catalog', title: 'Send catalog', desc: 'Shares your products or price list. Needs Catalog.', req: 'catalog' },
  { key: 'send_image', title: 'Send product image', desc: 'Sends a photo of the product being discussed. Needs Catalog.', req: 'catalog' },
  { key: 'send_payment_link', title: 'Send payment link', desc: 'Sends a secure link to pay. Needs Razorpay.', req: 'payment' },
  { key: 'handoff_human', title: 'Hand off to a human', desc: 'Passes the chat to you when the customer asks or the bot is unsure.' },
]
const checkMark = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 5.2l2 2L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const CREATIVITY = [['Focused', 0.1], ['Balanced', 0.3], ['Creative', 0.7]]
const PAGES = [['A few pages', 3], ['Several pages', 5], ['Many pages', 8]]
const nearest = (opts, v) => opts.reduce((a, o) => Math.abs(o[1] - v) < Math.abs(a[1] - v) ? o : a)[0]

// ── Agent screen ──
let _agentData = null
async function agent() {
  shell('Agent', loading())
  let d; try { d = await getTenant() } catch (e) { return shell('Agent', pagehead('Agent') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  _agentData = d
  renderAgent()
}
function renderAgent(editing) {
  const d = _agentData, c = d.config
  const hasCatalog = (d.products || 0) > 0
  const hasPayment = c.integrations?.payment && c.integrations.payment.provider !== 'none'
  const on = new Set(c.tools || [])
  const skillsOn = SKILLS.filter((s) => on.has(s.key)).length

  const idRead = `<section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Identity</h3><p class="ac-card-sub">How your bot introduces itself</p></div><button type="button" class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._agentEdit('identity')">Edit</button></div>
    <div class="ac-card-body"><dl class="ac-dl"><dt>Bot name</dt><dd>${esc(c.persona.botName)}</dd><dt>Tone</dt><dd>${esc(c.persona.tone)}</dd><dt>Languages</dt><dd>${esc((c.persona.languages || []).join(', '))}</dd></dl></div></section>`
  const idEdit = `<section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Identity</h3><p class="ac-card-sub">How your bot introduces itself</p></div></div>
    <div class="ac-card-body"><div class="ac-form">
      <label class="ac-field"><span class="ac-label">Bot name</span><input class="ac-input" id="ag_name" value="${esc(c.persona.botName)}"></label>
      <label class="ac-field"><span class="ac-label">Tone</span><input class="ac-input" id="ag_tone" value="${esc(c.persona.tone)}"></label>
      <label class="ac-field"><span class="ac-label">Languages</span><input class="ac-input" id="ag_langs" value="${esc((c.persona.languages || []).join(', '))}"><span class="ac-hint">Comma separated.</span></label>
      <div class="ac-form-actions"><button class="ac-btn ac-btn-ghost" onclick="window._agentEdit(null)">Cancel</button><button class="ac-btn ac-btn-primary" onclick="window._agentSave('identity')">Save</button></div>
    </div></div></section>`

  const g = c.guardrails || {}
  const instrRead = `<section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Instructions</h3><p class="ac-card-sub">In your own words — like briefing a new receptionist</p></div><button type="button" class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._agentEdit('instructions')">Edit</button></div>
    <div class="ac-card-body"><dl class="ac-dl">
      <dt>Behave like</dt><dd>${esc(c.persona.systemPromptExtra) || '<span class="ac-faint">—</span>'}</dd>
      <dt>Never</dt><dd>${esc((g.mustRefuse || []).join('. ')) || '<span class="ac-faint">—</span>'}</dd>
      <dt>Always say</dt><dd>${esc((g.disclaimers || []).join(' ')) || '<span class="ac-faint">—</span>'}</dd>
      <dt>Hand off when</dt><dd>${esc((g.escalateWhen || []).join('. ')) || '<span class="ac-faint">—</span>'}</dd>
    </dl></div></section>`
  const instrEdit = `<section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Instructions</h3><p class="ac-card-sub">In your own words — like briefing a new receptionist</p></div></div>
    <div class="ac-card-body"><div class="ac-form">
      <label class="ac-field"><span class="ac-label">Behave like</span><textarea class="ac-textarea" id="ag_behave">${esc(c.persona.systemPromptExtra)}</textarea></label>
      <label class="ac-field"><span class="ac-label">Never</span><textarea class="ac-textarea" id="ag_never">${esc((g.mustRefuse || []).join('\n'))}</textarea><span class="ac-hint">One per line.</span></label>
      <label class="ac-field"><span class="ac-label">Always say</span><textarea class="ac-textarea" id="ag_always">${esc((g.disclaimers || []).join('\n'))}</textarea><span class="ac-hint">One per line.</span></label>
      <label class="ac-field"><span class="ac-label">Hand off when</span><textarea class="ac-textarea" id="ag_handoff">${esc((g.escalateWhen || []).join('\n'))}</textarea><span class="ac-hint">One per line.</span></label>
      <div class="ac-form-actions"><button class="ac-btn ac-btn-ghost" onclick="window._agentEdit(null)">Cancel</button><button class="ac-btn ac-btn-primary" onclick="window._agentSave('instructions')">Save</button></div>
    </div></div></section>`

  const skillItems = SKILLS.map((s) => {
    const isOn = on.has(s.key)
    const disabled = (s.req === 'catalog' && !hasCatalog) || (s.req === 'payment' && !hasPayment)
    return `<label class="ac-check ${isOn ? 'ac-check-on' : ''}" ${disabled ? 'style="opacity:.55"' : ''}>
      <input type="checkbox" ${isOn ? 'checked' : ''} ${disabled ? 'disabled' : ''} onchange="window._agentToggle('${s.key}', this.checked)">
      <span class="ac-check-box">${isOn ? checkMark : ''}</span>
      <span><span class="ac-check-title" style="display:block">${esc(s.title)}</span><span class="ac-check-desc" style="display:block">${esc(s.desc)}</span></span>
    </label>`
  }).join('')
  const needsIntegration = SKILLS.some((s) => s.req)
  const skills = `<section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Skills</h3><p class="ac-card-sub">What your bot can do for customers · ${skillsOn} of ${SKILLS.length} on</p></div></div>
    <div style="padding:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:2px 8px">${skillItems}</div>
    ${needsIntegration ? `<div style="padding:0 20px 16px"><div class="ac-note">Payment links and the catalog need an integration first. <a href="#/integrations" style="font-weight:600;text-decoration:none">Go to Integrations</a></div></div>` : ''}
  </section>`

  const sel = (id, opts, cur) => `<select class="ac-select" id="${id}" onchange="window._agentAdvanced()">${opts.map((o) => `<option ${o[0] === cur ? 'selected' : ''}>${o[0]}</option>`).join('')}</select>`
  const advanced = `<section class="ac-card" style="padding:0 20px"><details class="ac-disc"><summary>Advanced settings</summary><div class="ac-disc-body">
    <p style="margin:0 0 14px;font-size:13px;color:var(--text-2)">Most businesses never need to change these.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
      <label class="ac-field"><span class="ac-label">Creativity</span>${sel('ag_creativity', CREATIVITY, nearest(CREATIVITY, c.model.temperature ?? 0.3))}<span class="ac-hint">Lower keeps answers close to your website.</span></label>
      <label class="ac-field"><span class="ac-label">Pages to check before answering</span>${sel('ag_pages', PAGES, nearest(PAGES, c.retrieval.topK ?? 5))}<span class="ac-hint">More can help with detailed questions, but is slower.</span></label>
    </div>
  </div></details></section>`

  const body = `<div class="ac-content">
    <p style="margin:0;color:var(--text-2);max-width:640px">Who your bot is and how it behaves with customers. Changes apply to new messages right away.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;align-items:start">
      ${editing === 'identity' ? idEdit : idRead}
      ${editing === 'instructions' ? instrEdit : instrRead}
    </div>
    ${skills}
    ${advanced}
  </div>`
  shell('Agent', pagehead('Agent', `<a class="ac-btn ac-btn-secondary" href="#/sandbox">Test your bot</a>`) + body)
}
window._agentEdit = (which) => renderAgent(which)
window._agentSave = async (which) => {
  const c = _agentData.config
  if (which === 'identity') {
    c.persona.botName = document.getElementById('ag_name').value.trim()
    c.persona.tone = document.getElementById('ag_tone').value.trim()
    c.persona.languages = document.getElementById('ag_langs').value.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (which === 'instructions') {
    const lines = (id) => document.getElementById(id).value.split('\n').map((s) => s.trim()).filter(Boolean)
    c.persona.systemPromptExtra = document.getElementById('ag_behave').value.trim()
    c.guardrails = c.guardrails || {}
    c.guardrails.mustRefuse = lines('ag_never')
    c.guardrails.disclaimers = lines('ag_always')
    c.guardrails.escalateWhen = lines('ag_handoff')
  }
  try { await saveConfig(c); toast('Saved'); renderAgent(null) } catch (e) { toast(e.message) }
}
window._agentToggle = async (key, checked) => {
  const c = _agentData.config
  const set = new Set(c.tools || [])
  checked ? set.add(key) : set.delete(key)
  c.tools = [...set]
  try { await saveConfig(c); renderAgent(null) } catch (e) { toast(e.message); renderAgent(null) }
}
window._agentAdvanced = async () => {
  const c = _agentData.config
  const cr = document.getElementById('ag_creativity').value
  const pg = document.getElementById('ag_pages').value
  c.model.temperature = (CREATIVITY.find((o) => o[0] === cr) || [, 0.3])[1]
  c.retrieval.topK = (PAGES.find((o) => o[0] === pg) || [, 5])[1]
  try { await saveConfig(c); toast('Saved') } catch (e) { toast(e.message) }
}

// ── Knowledge screen ──
function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function pageTitle(url) {
  try {
    const u = new URL(url)
    const seg = u.pathname.replace(/\/$/, '').split('/').filter(Boolean).pop()
    if (!seg) return 'Home'
    return seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  } catch { return url }
}
function pageHost(url) { try { return new URL(url).host + new URL(url).pathname.replace(/\/$/, '') } catch { return url } }
const PAGE_ICO = `<svg class="ac-ico" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`

let _knDocs = null, _knShowAll = false
async function knowledge() {
  shell('Knowledge', loading())
  let d; try { d = await api.get('/tenants/' + state.tenant.id + '/knowledge') } catch (e) { return shell('Knowledge', pagehead('Knowledge') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  _knDocs = d.documents || []; _knShowAll = false
  renderKnowledge()
}
function renderKnowledge() {
  const docs = _knDocs
  const actions = `
    <button type="button" class="ac-btn ac-btn-secondary" onclick="window._knUpload()"><svg class="ac-ico" viewBox="0 0 16 16" fill="none"><path d="M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Upload a document</button>
    <button type="button" class="ac-btn ac-btn-primary" onclick="window._knAdd()"><svg class="ac-ico" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Add a page</button>`

  if (!docs.length) {
    const empty = `<div class="ac-content">
      <p style="margin:0;color:var(--text-2);max-width:640px">Everything your bot has learned from. It answers using only these pages and documents, plus your business profile.</p>
      <div class="ac-card"><div class="ac-card-body"><div class="ac-empty">
        <div class="ac-empty-ico">${PAGE_ICO}</div><div class="ac-empty-title">Nothing learned yet</div>
        <p>Add your website so your bot can answer from it.</p>
        <div class="ac-empty-action"><button class="ac-btn ac-btn-primary" onclick="window._knAdd()">Add a page</button></div>
      </div></div></div></div>`
    return shell('Knowledge', pagehead('Knowledge', actions) + empty)
  }

  const processing = docs.filter((x) => x.status !== 'approved')
  const banner = processing.length ? `<div style="display:flex;align-items:center;gap:12px;background:var(--brand-subtle);color:var(--brand-text);border-radius:10px;padding:12px 16px;font-size:13px;line-height:18px">
    <span class="ac-spin" role="status" aria-label="Learning"></span>
    <span style="flex:1 1 0">Learning from <b>${esc(pageTitle(processing[0].source_ref || processing[0].title))}</b>. Your bot keeps answering with what it already knows meanwhile.</span>
  </div>` : ''

  const shown = _knShowAll ? docs : docs.slice(0, 12)
  const rows = shown.map((x) => {
    const url = x.source_ref || x.title
    const learned = x.status === 'approved'
    const title = esc(pageTitle(url))
    const sub = x.source === 'upload' ? 'Uploaded document' : esc(pageHost(url))
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px">
        <span style="width:28px;height:28px;border-radius:7px;background:var(--surface);color:var(--text-2);display:grid;place-items:center;flex:0 0 auto">${PAGE_ICO}</span>
        <div style="min-width:0"><div style="font-weight:600;color:var(--text-1)">${title}</div>
        ${x.source === 'upload' ? `<span style="font-size:12px;color:var(--text-3)">${sub}</span>` : `<a href="${esc(url)}" target="_blank" rel="noopener" style="font-size:12px;text-decoration:none;color:var(--brand)">${sub}</a>`}</div>
      </div></td>
      <td class="ac-muted">${fmtDate(x.created_at)}</td>
      <td>${learned ? '<span class="ac-badge ac-badge-green">Learned</span>' : '<span class="ac-badge ac-badge-amber">Processing</span>'}</td>
      <td style="text-align:right"><button type="button" class="ac-btn ac-btn-ghost ac-btn-sm" onclick="window._knRemove('${x.id}', this)">Remove</button></td>
    </tr>`
  }).join('')

  const foot = docs.length > 12 ? `<div style="border-top:1px solid var(--border);padding:10px 20px"><button type="button" class="ac-btn ac-btn-ghost ac-btn-sm" onclick="window._knToggleAll()">${_knShowAll ? 'Show less' : 'Show all ' + docs.length}</button></div>` : ''

  const body = `<div class="ac-content">
    <p style="margin:0;color:var(--text-2);max-width:640px">Everything your bot has learned from. It answers using only these pages and documents, plus your business profile.</p>
    ${banner}
    <section class="ac-card">
      <div class="ac-card-head"><div><h3 class="ac-card-title">What your bot has learned</h3><p class="ac-card-sub">${docs.length} page${docs.length === 1 ? '' : 's'} and documents</p></div></div>
      <div style="overflow-x:auto"><table class="ac-table" style="min-width:640px">
        <thead><tr><th>Page</th><th style="width:130px">Added</th><th style="width:120px">Status</th><th style="width:60px"><span style="position:absolute;left:-9999px">Actions</span></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${foot}
    </section>
  </div>`
  shell('Knowledge', pagehead('Knowledge', actions) + body)
}
window._knToggleAll = () => { _knShowAll = !_knShowAll; renderKnowledge() }
window._knAdd = async () => {
  const url = prompt('Add a page or whole website URL the bot should learn from:')
  if (!url) return
  toast('Learning from the page…')
  try { await api.post('/tenants/' + state.tenant.id + '/ingest', { url: url.trim() }); await knowledge() } catch (e) { toast(e.message) }
}
window._knUpload = () => toast('Document upload is coming soon — add a page URL for now.')
window._knRemove = async (id, btn) => {
  if (!confirm('Remove this page? Your bot will stop using it.')) return
  btn.disabled = true
  try { await api.del('/tenants/' + state.tenant.id + '/knowledge/' + id); _knDocs = _knDocs.filter((x) => x.id !== id); renderKnowledge(); toast('Removed') } catch (e) { toast(e.message); btn.disabled = false }
}

// ── Catalog screen ──
const PHOTO_ICO = `<svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 2-2 3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const REFRESH_ICO = `<svg class="ac-ico" viewBox="0 0 16 16" fill="none"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
function money(p, cur) { if (p == null) return '—'; const c = (cur || 'INR').toUpperCase(); const sym = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }[c]; const n = Number(p).toLocaleString(); return sym ? sym + n : c + ' ' + n }
function catalogSkeleton(line) {
  const skel = `<div class="ac-card" aria-hidden="true" style="overflow:hidden">
    <div style="aspect-ratio:4/3;background:var(--surface)"></div>
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
      <div style="height:12px;width:70%;border-radius:5px;background:var(--hover)"></div>
      <div style="display:flex;justify-content:space-between"><div style="height:14px;width:30%;border-radius:5px;background:var(--hover)"></div><div style="height:14px;width:22%;border-radius:9999px;background:var(--surface)"></div></div>
      <div style="height:28px;width:56px;border-radius:7px;background:var(--surface)"></div>
    </div></div>`
  const actions = `<button type="button" class="ac-btn ac-btn-secondary" disabled>${REFRESH_ICO}Refresh from products page</button>`
  const body = `<div class="ac-content">
    <div style="display:flex;align-items:center;gap:10px;color:var(--text-2)"><span class="ac-spin" role="status" aria-label="Loading products" style="width:18px;height:18px"></span>${esc(line || 'Loading products…')}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px">${skel.repeat(6)}</div>
  </div>`
  shell('Catalog', pagehead('Catalog', actions) + body)
}
let _catProducts = null, _catFilter = 'all'
async function catalog() {
  catalogSkeleton('Loading your catalog…')
  let d; try { d = await api.get('/tenants/' + state.tenant.id + '/products') } catch (e) { return shell('Catalog', pagehead('Catalog') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  _catProducts = d.products || []; _catFilter = 'all'
  renderCatalog()
}
function renderCatalog() {
  const all = _catProducts
  const actions = `<button type="button" class="ac-btn ac-btn-secondary" onclick="window._catRefresh()">${REFRESH_ICO}Refresh from products page</button>`
  if (!all.length) {
    const empty = `<div class="ac-content">
      <p style="margin:0;color:var(--text-2);max-width:620px">Products your bot can quote, show and send payment links for.</p>
      <div class="ac-card"><div class="ac-card-body"><div class="ac-empty">
        <div class="ac-empty-ico">${PHOTO_ICO}</div><div class="ac-empty-title">No products yet</div>
        <p>Point your bot at a products or price-list page and it will read the items so it can quote and send them.</p>
        <div class="ac-empty-action"><button class="ac-btn ac-btn-primary" onclick="window._catRefresh()">Add from a products page</button></div>
      </div></div></div></div>`
    return shell('Catalog', pagehead('Catalog', actions) + empty)
  }
  const items = all.filter((p) => _catFilter === 'all' || (_catFilter === 'in' ? p.inStock !== false : p.inStock === false))
  const chip = (key, label) => `<button type="button" class="ac-chip ${_catFilter === key ? 'ac-chip-brand' : ''}" style="cursor:pointer;font:inherit;font-size:13px" onclick="window._catSetFilter('${key}')">${label}</button>`
  const cards = items.map((p) => {
    const img = p.imageUrl ? `<div style="aspect-ratio:4/3;background:#fff url('${esc(p.imageUrl)}') center/cover no-repeat;border-bottom:1px solid var(--border)"></div>`
      : `<div style="aspect-ratio:4/3;background:var(--surface);border-bottom:1px solid var(--border);display:grid;place-items:center;color:var(--text-2);font-size:12px"><div style="display:flex;flex-direction:column;align-items:center;gap:6px">${PHOTO_ICO}No photo</div></div>`
    const badge = p.inStock === false ? '<span class="ac-badge ac-badge-gray">Out of stock</span>' : '<span class="ac-badge ac-badge-green">In stock</span>'
    return `<article class="ac-card" style="overflow:hidden;display:flex;flex-direction:column">
      ${img}
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:6px;flex:1 1 0">
        <div style="font-weight:700">${esc(p.name)}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span style="font-size:16px;font-weight:700;font-variant-numeric:tabular-nums">${esc(money(p.price, p.currency))}</span>${badge}
        </div>
      </div>
    </article>`
  }).join('')
  const body = `<div class="ac-content">
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
      <p style="margin:0;color:var(--text-2);max-width:620px">Products your bot can quote, show and send payment links for.</p>
      <div role="group" aria-label="Filter" style="display:flex;gap:6px">${chip('all', 'All')}${chip('in', 'In stock')}${chip('out', 'Out of stock')}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px">${cards || '<p class="ac-muted">No products match this filter.</p>'}</div>
  </div>`
  shell('Catalog', pagehead('Catalog', actions) + body)
}
window._catSetFilter = (f) => { _catFilter = f; renderCatalog() }
window._catRefresh = async () => {
  const url = prompt('Products or price-list page URL to read items from:')
  if (!url) return
  catalogSkeleton('Reading your products page… this can take a minute for large shops.')
  try { const r = await api.post('/tenants/' + state.tenant.id + '/catalog', { url: url.trim() }); toast(`Found ${r.count} product${r.count === 1 ? '' : 's'}`); await catalog() } catch (e) { toast(e.message); catalog() }
}

// ── Integrations screen ──
const COMING = [
  { icon: 'G', title: 'Google Calendar', desc: 'Check real free slots before booking.', tag: 'Check availability' },
  { icon: 'C', title: 'CRM', desc: 'Recognise returning customers from your records.', tag: 'Look up a customer' },
  { icon: 'G', title: 'Google Business', desc: 'Keep opening hours in sync with your Google listing.', tag: 'Hours' },
  { icon: 'S', title: 'Google Sheets', desc: 'Log new enquiries and bookings to a sheet.', tag: 'Logging' },
  { icon: 'W', title: 'Webhooks', desc: 'Send conversation events to your own systems.', tag: 'For developers' },
]
let _intgConfig = null
async function integrations() {
  shell('Integrations', loading())
  let d; try { d = await getTenant() } catch (e) { return shell('Integrations', pagehead('Integrations') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  _intgConfig = d.config
  renderIntegrations()
}
function card(icon, title, desc, { connected, note, enables, actions, badge } = {}) {
  const iconBg = connected ? 'background:var(--brand-subtle);color:var(--brand-text)' : 'background:var(--surface);color:var(--text-2)'
  const status = connected ? '<span class="ac-badge ac-badge-green"><span class="ac-badge-dot"></span>Connected</span>' : (badge || '')
  const chipCls = connected ? 'ac-chip ac-chip-brand' : 'ac-chip'
  return `<article class="ac-card" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <span style="width:36px;height:36px;border-radius:7px;${iconBg};display:grid;place-items:center;font-weight:800;flex:0 0 auto">${icon}</span>
      <div style="flex:1 1 0;min-width:0"><div style="font-weight:700">${esc(title)}</div><div style="font-size:13px;line-height:18px;color:var(--text-2)">${esc(desc)}</div></div>
      ${status}
    </div>
    ${note ? `<div class="ac-note" style="font-size:12.5px;word-break:break-word">${esc(note)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      ${enables ? `<span class="${chipCls}" style="font-size:12px;height:22px">${esc(enables)}</span>` : '<span></span>'}
      <div style="display:flex;gap:6px">${actions || ''}</div>
    </div>
  </article>`
}
function renderIntegrations() {
  const c = _intgConfig, ig = c.integrations || {}
  const connected = [], available = []

  // Calendly
  if (ig.calendlyUrl) {
    connected.push(card('B', 'Booking · Calendly', 'Your bot shares your booking link so customers pick a time.', {
      connected: true, note: ig.calendlyUrl, enables: 'Enables: Book a meeting',
      actions: `<button class="ac-btn ac-btn-ghost ac-btn-sm" onclick="window._intgCalendly(false)">Disconnect</button><button class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._intgCalendly(true)">Edit</button>`,
    }))
  } else {
    available.push(card('B', 'Booking · Calendly', 'Share your booking link so customers pick a time.', {
      enables: 'Enables: Book a meeting', actions: `<button class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._intgCalendly(true)">Connect</button>`,
    }))
  }

  // Payments · Razorpay
  const pay = ig.payment && ig.payment.provider === 'razorpay'
  if (pay) {
    connected.push(card('R', 'Payments · Razorpay', 'Send secure payment links in the chat.', {
      connected: true, note: 'Razorpay keys saved', enables: 'Enables: Send payment link',
      actions: `<button class="ac-btn ac-btn-ghost ac-btn-sm" onclick="window._intgRazorpay(false)">Disconnect</button><button class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._intgRazorpay(true)">Edit</button>`,
    }))
  } else {
    available.push(card('R', 'Payments · Razorpay', 'Send secure payment links in the chat.', {
      enables: 'Enables: Send payment link', actions: `<button class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._intgRazorpay(true)">Connect</button>`,
    }))
  }

  // Social links
  const socials = ig.socials || {}
  if (Object.keys(socials).length) {
    const names = Object.keys(socials).map((k) => k[0].toUpperCase() + k.slice(1)).join(', ')
    connected.push(card('S', 'Social links', 'Links your bot can share when customers ask.', {
      connected: true, note: names + ' · found during setup', enables: 'Shared on request',
      actions: `<button class="ac-btn ac-btn-ghost ac-btn-sm" onclick="window._intgSocial(false)">Disconnect</button><button class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._intgSocial(true)">Edit</button>`,
    }))
  } else {
    available.push(card('S', 'Social links', 'Links your bot can share when customers ask.', {
      enables: 'Shared on request', actions: `<button class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._intgSocial(true)">Add</button>`,
    }))
  }

  COMING.forEach((x) => available.push(card(x.icon, x.title, x.desc, { badge: '<span class="ac-badge ac-badge-gray">Coming soon</span>', enables: x.tag })))

  const grid = (cards) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;align-items:start">${cards.join('')}</div>`
  const body = `<div class="ac-content">
    <p style="margin:0;color:var(--text-2);max-width:640px">Connect the tools you already use so your bot can book, take payments and share your links.</p>
    ${connected.length ? `<h2 class="ac-label" style="margin:8px 0 0">Connected</h2>${grid(connected)}` : ''}
    <h2 class="ac-label" style="margin:8px 0 0">Available</h2>${grid(available)}
  </div>`
  shell('Integrations', pagehead('Integrations') + body)
}
async function _intgSave(mut) { mut(_intgConfig.integrations = _intgConfig.integrations || {}); try { await saveConfig(_intgConfig); toast('Saved'); renderIntegrations() } catch (e) { toast(e.message) } }
window._intgCalendly = async (connect) => {
  if (!connect) { if (!confirm('Disconnect Calendly?')) return; _intgConfig.tools = (_intgConfig.tools || []).filter((t) => t !== 'book_meeting'); return _intgSave((ig) => { delete ig.calendlyUrl }) }
  const url = prompt('Your booking link (e.g. https://calendly.com/your-name):', _intgConfig.integrations?.calendlyUrl || '')
  if (!url) return
  if (!(_intgConfig.tools || []).includes('book_meeting')) _intgConfig.tools = [...(_intgConfig.tools || []), 'book_meeting']
  _intgSave((ig) => { ig.calendlyUrl = url.trim() })
}
window._intgRazorpay = async (connect) => {
  if (!connect) { if (!confirm('Disconnect Razorpay?')) return; _intgConfig.tools = (_intgConfig.tools || []).filter((t) => t !== 'send_payment_link'); return _intgSave((ig) => { ig.payment = { provider: 'none' } }) }
  const keyId = prompt('Razorpay Key ID:', _intgConfig.integrations?.payment?.keyId || '')
  if (!keyId) return
  const keySecret = prompt('Razorpay Key Secret:')
  if (!keySecret) return
  if (!(_intgConfig.tools || []).includes('send_payment_link')) _intgConfig.tools = [...(_intgConfig.tools || []), 'send_payment_link']
  _intgSave((ig) => { ig.payment = { provider: 'razorpay', keyId: keyId.trim(), keySecret: keySecret.trim() } })
}
window._intgSocial = async (edit) => {
  const cur = _intgConfig.integrations?.socials || {}
  if (edit === false) { if (!confirm('Remove all social links?')) return; return _intgSave((ig) => { ig.socials = {} }) }
  const text = prompt('Social links, one per line as "platform: url"\n(e.g. instagram: https://instagram.com/you)', Object.entries(cur).map(([k, v]) => `${k}: ${v}`).join('\n'))
  if (text == null) return
  const socials = {}
  text.split('\n').forEach((line) => { const m = line.split(/:(.+)/); if (m[1]) socials[m[0].trim().toLowerCase()] = m[1].trim() })
  _intgSave((ig) => { ig.socials = socials })
}

function fmtDateTime(ts) { if (!ts) return '—'; return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).replace(',', ',') }

// ── Settings screen ──
async function settings() {
  shell('Settings', loading())
  let d; try { d = await getTenant() } catch (e) { return shell('Settings', pagehead('Settings') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  const prof = d.profile || {}, c = d.config
  const email = prof.contact?.email || '—'
  const body = `<div class="ac-content" style="max-width:808px">
    <section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Account</h3><p class="ac-card-sub">You sign in with these</p></div><button type="button" class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._toast('Sign-in accounts are coming soon.')">Edit</button></div>
      <div class="ac-card-body"><dl class="ac-dl"><dt>Name</dt><dd>${esc((state.user && state.user.name) || '—')}</dd><dt>Email</dt><dd>${esc((state.user && state.user.email) || email)}</dd><dt>Sign-in</dt><dd>Email and password</dd></dl></div></section>

    <section class="ac-card"><div class="ac-card-head" style="align-items:center"><div><h3 class="ac-card-title">Plan &amp; billing</h3><p class="ac-card-sub">Your subscription and invoices</p></div></div>
      <div class="ac-card-body"><div class="ac-note">Billing isn't set up yet. You're on the early-access plan — no charges.</div></div></section>

    <section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Team</h3><p class="ac-card-sub">People who can reply to customers and change your bot</p></div></div>
      <div class="ac-empty" style="padding:32px 24px"><div class="ac-empty-ico"><svg class="ac-ico" viewBox="0 0 16 16" fill="none"><path d="M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 13.5c.4-2.3 2.2-3.5 4.5-3.5s4.1 1.2 4.5 3.5M11 3a2.2 2.2 0 0 1 0 4.4M12.5 10.2c1 .5 1.8 1.6 2 3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
      <h4 class="ac-empty-title">Team members are coming soon</h4><p>For now, you're the only person on this account.</p></div></section>

    <section class="ac-card" style="border-color:var(--danger)"><div class="ac-card-head"><div><h3 class="ac-card-title" style="color:var(--danger-text)">Danger zone</h3><p class="ac-card-sub">These can't be undone</p></div></div>
      <div class="ac-card-body"><div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="flex:1 1 280px"><div style="font-weight:600">Delete your bot</div><div style="font-size:13px;line-height:18px;color:var(--text-2)">Disconnects WhatsApp, and permanently removes everything your bot has learned, its settings and conversation history.</div></div>
        <button type="button" class="ac-btn ac-btn-secondary" style="color:var(--danger-text)" onclick="window._deleteBot()">Delete bot</button>
      </div></div></section>

    <button class="ac-btn ac-btn-ghost" style="align-self:flex-start" onclick="window._logout()">Log out</button>
  </div>`
  shell('Settings', pagehead('Settings') + body)
}
window._toast = (m) => toast(m)
window._deleteBot = async () => {
  if (!confirm('Delete this bot? This disconnects WhatsApp and permanently removes everything. This cannot be undone.')) return
  try { await api.del('/tenants/' + state.tenant.id); toast('Bot deleted'); state.tenant = null; location.hash = '#/overview' } catch (e) { toast(e.message) }
}

// ── WhatsApp screen ──
let _waData = null, _waEdit = false, _waPoll = null
async function whatsapp() {
  shell('WhatsApp', loading())
  if (_waPoll) { clearInterval(_waPoll); _waPoll = null }
  let d; try { d = await api.get('/tenants/' + state.tenant.id + '/whatsapp') } catch (e) { return shell('WhatsApp', pagehead('WhatsApp') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  _waData = d; _waEdit = false
  renderWhatsapp()
}
function renderWhatsapp() {
  const d = _waData, n = d.number
  const linked = n && n.auth_status === 'linked'
  state.status = linked ? 'live' : 'down'; state.phone = n?.phone_e164 || null

  const connHead = `<div class="ac-card-head" style="align-items:center"><div><h3 class="ac-card-title">Connection</h3><p class="ac-card-sub">The number your bot answers from</p></div>${linked ? '<span class="ac-badge ac-badge-green"><span class="ac-badge-dot"></span>Live</span>' : '<span class="ac-badge ac-badge-red"><span class="ac-badge-dot"></span>Not connected</span>'}</div>`
  let connBody
  if (linked) {
    connBody = `<div class="ac-card-body" style="display:flex;flex-direction:column;gap:16px">
      <dl class="ac-dl"><dt>Number</dt><dd>${esc(fmtPhone(n.phone_e164))}</dd><dt>Linked since</dt><dd>${esc(fmtDateTime(d.linkedSince))}</dd><dt>Last message handled</dt><dd>${d.lastHandled ? esc(timeAgo(d.lastHandled)) + ' ago' : '—'}</dd></dl>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ac-btn ac-btn-secondary" style="color:var(--danger-text)" onclick="window._waDisconnect()">Disconnect</button></div>
    </div>`
  } else {
    connBody = `<div class="ac-card-body" style="display:flex;flex-direction:column;gap:16px">
      <p style="margin:0;color:var(--text-2);font-size:13px">Link a WhatsApp number by pairing code to put your bot live. Use a dedicated or secondary number.</p>
      <label class="ac-field" style="max-width:320px"><span class="ac-label">Phone (country code + number)</span><input class="ac-input" id="wa_phone" placeholder="911234567890" value="${esc((n?.phone_e164) || '')}"></label>
      <div><button type="button" class="ac-btn ac-btn-primary" id="wa_link" onclick="window._waLink()">Generate pairing code</button></div>
      <div id="wa_pair"></div>
    </div>`
  }

  const identity = `<div style="display:flex;align-items:flex-start;gap:12px;padding:4px 2px 0">
    <div><h2 style="margin:0;font-size:15px;line-height:22px;font-weight:700">Your WhatsApp identity</h2>
    <p style="margin:2px 0 0;font-size:13px;line-height:18px;color:var(--text-2);max-width:680px">What customers see at the top of the chat. This doesn't change what your bot says — that comes from <a href="#/agent" style="text-decoration:none;color:var(--brand)">Agent</a> and <a href="#/knowledge" style="text-decoration:none;color:var(--brand)">Knowledge</a>.</p></div>
  </div>`

  const p = d.profile || {}
  const profCard = _waEdit ? `<section class="ac-card"><div class="ac-card-head" style="align-items:center"><div><h3 class="ac-card-title">WhatsApp profile</h3><p class="ac-card-sub">Changes sync to WhatsApp straight away</p></div></div>
    <div class="ac-card-body"><div class="ac-form">
      <label class="ac-field"><span class="ac-label">Display name</span><input class="ac-input" id="wa_name" value="${esc(p.name)}"></label>
      <label class="ac-field"><span class="ac-label">About</span><textarea class="ac-textarea" id="wa_about">${esc(p.about)}</textarea></label>
      <div class="ac-form-actions"><button class="ac-btn ac-btn-ghost" onclick="window._waEditToggle(false)">Cancel</button><button class="ac-btn ac-btn-primary" onclick="window._waSaveProfile()">Save</button></div>
    </div></div></section>`
    : `<section class="ac-card"><div class="ac-card-head" style="align-items:center"><div><h3 class="ac-card-title">WhatsApp profile</h3><p class="ac-card-sub">Changes sync to WhatsApp straight away</p></div>${linked ? `<button type="button" class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._waEditToggle(true)">Edit</button>` : ''}</div>
    <div class="ac-card-body"><div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div class="ac-avatar-lg" style="width:72px;height:72px;font-size:22px">${esc(initials(p.name))}</div>
      <dl class="ac-dl" style="flex:1 1 220px;grid-template-columns:100px 1fr"><dt>Display name</dt><dd>${esc(p.name) || '<span class="ac-faint">—</span>'}</dd><dt>About</dt><dd>${esc(p.about) || '<span class="ac-faint">Not set</span>'}</dd></dl>
    </div></div></section>`

  const b = d.business || {}
  const bField = (dt, v) => `<dt>${dt}</dt><dd>${v ? esc(v) : '<span class="ac-faint">—</span>'}</dd>`
  const bizCard = `<section class="ac-card"><div class="ac-card-head" style="align-items:center"><div><h3 class="ac-card-title" style="display:flex;align-items:center;gap:8px">WhatsApp Business <span class="ac-badge ac-badge-gray"><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>View only</span></h3><p class="ac-card-sub">As it appears on your WhatsApp Business profile</p></div></div>
    <div class="ac-card-body" style="display:flex;flex-direction:column;gap:16px">
      <dl class="ac-dl">${bField('Category', b.category)}${bField('Description', b.description)}${bField('Address', b.address)}${bField('Email', b.email)}${bField('Website', b.website || b.websiteUrl)}</dl>
      <div class="ac-note">To change these, edit them in the WhatsApp Business app on your phone. They'll show here within a few minutes.</div>
    </div></section>`

  const body = `<div class="ac-content">
    <section class="ac-card">${connHead}${connBody}</section>
    ${identity}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;align-items:start">${profCard}${bizCard}</div>
  </div>`
  shell('WhatsApp', pagehead('WhatsApp') + body)
}
window._waEditToggle = (on) => { _waEdit = on; renderWhatsapp() }
window._waSaveProfile = async () => {
  const name = document.getElementById('wa_name').value.trim()
  const about = document.getElementById('wa_about').value.trim()
  try { await api.post('/tenants/' + state.tenant.id + '/whatsapp/profile', { name, about }); _waData.profile = { name, about }; _waEdit = false; renderWhatsapp(); toast('Profile updated on WhatsApp') } catch (e) { toast(e.message) }
}
window._waDisconnect = async () => {
  if (!confirm('Disconnect this number? Your bot will stop answering until you reconnect.')) return
  try { await api.post('/tenants/' + state.tenant.id + '/disconnect', {}); await whatsapp() } catch (e) { toast(e.message) }
}
window._waLink = async () => {
  const phone = (document.getElementById('wa_phone').value || '').replace(/\D/g, '')
  if (!phone) return toast('Enter a phone number')
  const btn = document.getElementById('wa_link'); btn.disabled = true; btn.textContent = 'Starting…'
  const pair = document.getElementById('wa_pair')
  try {
    const { numberId } = await api.post('/tenants/' + state.tenant.id + '/link', { phone })
    let i = 0
    _waPoll = setInterval(async () => {
      i++
      let s = {}; try { s = await api.get('/numbers/' + numberId + '/status') } catch {}
      if (s.authStatus === 'linked') { clearInterval(_waPoll); _waPoll = null; toast('Linked!'); whatsapp(); return }
      if (s.code) { const f = s.code.length === 8 ? s.code.slice(0, 4) + '-' + s.code.slice(4) : s.code; pair.innerHTML = `<div class="ac-pair"><div class="ac-pair-code">${esc(f)}</div><div class="ac-pair-hint">On the phone: WhatsApp → Linked devices → Link with phone number, then enter this code.</div></div>` }
      else pair.innerHTML = `<div class="ac-pair"><div class="ac-pair-hint"><span class="ac-spin"></span> Requesting pairing code…</div></div>`
      if (i > 180) { clearInterval(_waPoll); _waPoll = null }
    }, 2500)
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Generate pairing code' }
}

// ── Conversations ──
function prettyJid(jid) { const d = String(jid).split('@')[0]; if (/^\d{10,15}$/.test(d)) return fmtPhone(d); return 'Customer' }
function convName(name, jid) { return name || prettyJid(jid) }
function convAvatar(name, jid) {
  if (name) return `<span class="ac-avatar">${esc(initials(name))}</span>`
  const d = String(jid).split('@')[0]
  const label = /^\d{10,15}$/.test(d) ? '+' + d.slice(0, 2) : (d.slice(0, 2) || '#').toUpperCase()
  return `<span class="ac-avatar" style="background:var(--surface);color:var(--text-2)">${esc(label)}</span>`
}
function shortAgo(ts) {
  if (!ts) return ''
  const s = (Date.now() - new Date(ts).getTime()) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  const d = new Date(ts), y = new Date(); y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
const STATUS_BADGE = { handed: '<span class="ac-badge ac-badge-blue">Handed to you</span>', resolved: '<span class="ac-badge ac-badge-green">Resolved by you</span>', bot: '<span class="ac-badge ac-badge-gray">Answered by bot</span>' }
let _conv = null, _convFilter = 'all'
async function conversations() {
  shell('Conversations', loading())
  let d; try { d = await api.get('/tenants/' + state.tenant.id + '/conversations') } catch (e) { return shell('Conversations', pagehead('Conversations') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  _conv = d; _convFilter = 'all'; state.handoffCount = d.waiting.length
  renderConversations()
}
function renderConversations() {
  const d = _conv
  const waiting = d.waiting.length ? `<section class="ac-card" style="border-color:var(--brand)">
    <div class="ac-card-head" style="background:var(--brand-subtle);border-radius:10px 10px 0 0"><div><h3 class="ac-card-title" style="color:var(--brand-text)">${d.waiting.length} ${d.waiting.length === 1 ? 'customer is' : 'customers are'} waiting for you</h3><p class="ac-card-sub">Your bot handed these chats over. It stays quiet until you resume it.</p></div></div>
    <div>${d.waiting.map((w, i) => `<a href="#/conversations/${encodeURIComponent(w.chatJid)}" class="conv-row" style="display:flex;align-items:center;gap:12px;padding:14px 20px;${i < d.waiting.length - 1 ? 'border-bottom:1px solid var(--border)' : ''};color:inherit;text-decoration:none;flex-wrap:wrap">
      ${convAvatar(w.name, w.chatJid)}
      <div style="flex:1 1 260px;min-width:0"><div style="font-weight:600">${esc(convName(w.name, w.chatJid))}</div><div style="font-size:13px;color:var(--text-2)">${w.lastText ? '“' + esc(w.lastText) + '”' : esc(w.reason || '')}</div></div>
      <span style="font-size:12px;color:var(--text-2)">waiting ${shortAgo(w.since)}</span>
      <span class="ac-btn ac-btn-primary ac-btn-sm">Reply</span>
    </a>`).join('')}</div>
  </section>` : ''

  const handedCount = d.recent.filter((r) => r.status === 'handed').length
  const tab = (key, label) => `<button type="button" role="tab" aria-selected="${_convFilter === key}" class="ac-chip ${_convFilter === key ? 'ac-chip-brand' : ''}" style="cursor:pointer;font:inherit;font-size:13px" onclick="window._convFilter('${key}')">${label}</button>`
  const rows = d.recent.filter((r) => _convFilter === 'all' || (_convFilter === 'handed' ? r.status === 'handed' : r.status === 'bot')).map((r) => `
    <a href="#/conversations/${encodeURIComponent(r.chatJid)}" class="conv-row" style="display:grid;grid-template-columns:200px minmax(0,1fr) 140px 70px;gap:12px;align-items:center;padding:12px 20px;border-bottom:1px solid var(--border);color:inherit;text-decoration:none;font-size:13px;line-height:18px">
      <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(convName(r.name, r.chatJid))}</span>
      <span style="color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.lastText || '')}</span>
      <span>${STATUS_BADGE[r.status] || ''}</span>
      <span style="color:var(--text-2);text-align:right">${shortAgo(r.at)}</span>
    </a>`).join('')
  const recent = `<section class="ac-card">
    <div class="ac-card-head" style="flex-wrap:wrap;align-items:center"><div><h3 class="ac-card-title">Recent conversations</h3></div>
      <div role="tablist" style="display:flex;gap:6px;flex-wrap:wrap">${tab('all', 'All')}${tab('handed', 'Handed to you · ' + handedCount)}${tab('bot', 'Answered by bot')}</div>
    </div>
    <div style="overflow-x:auto"><div style="min-width:640px">
      <div style="display:grid;grid-template-columns:200px minmax(0,1fr) 140px 70px;gap:12px;padding:10px 20px;border-bottom:1px solid var(--border);font-size:10.5px;line-height:14px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-2)"><span>Customer</span><span>Last message</span><span>Status</span><span style="text-align:right">Time</span></div>
      ${rows || '<div class="ac-empty" style="padding:28px"><p>No conversations in this view yet.</p></div>'}
    </div></div>
  </section>`
  const body = `<div class="ac-content">${waiting}${recent}</div>`
  shell('Conversations', pagehead('Conversations') + body)
}
window._convFilter = (f) => { _convFilter = f; renderConversations() }

// ── Conversation thread ──
const BACK_ICO = `<svg class="ac-ico" viewBox="0 0 16 16" fill="none"><path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
let _thread = null
async function thread(chatJid) {
  shell('Conversations', loading())
  let d; try { d = await api.get('/tenants/' + state.tenant.id + '/conversations/' + encodeURIComponent(chatJid)) } catch (e) { return shell('Conversations', pagehead('Conversations') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  _thread = d
  renderThread()
}
function renderThread() {
  const d = _thread
  const open = d.handoff && d.handoff.status === 'open'
  const who = convName(d.customer.name, d.chatJid)
  const num = prettyJid(d.chatJid)
  const headActions = open ? `<span class="ac-badge ac-badge-blue">Handed to you</span><button type="button" class="ac-btn ac-btn-secondary" onclick="window._threadResume()">Resume bot</button>` : `<button type="button" class="ac-btn ac-btn-secondary" onclick="window._threadReplyFocus()">Reply</button>`
  const head = `<div class="ac-pagehead" style="flex-wrap:wrap">
    <a href="#/conversations" class="ac-btn ac-btn-ghost ac-btn-sm">${BACK_ICO}Conversations</a>
    <h1 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">${esc(who)} ${num !== who ? `<span style="font-size:13px;font-weight:400;color:var(--text-2)">${esc(num)}</span>` : ''}</h1>
    <div class="ac-pagehead-actions">${headActions}</div></div>`

  const msgs = d.messages.map((m) => {
    const t = new Date(m.at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    if (m.fromMe) return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px"><span style="font-size:11.5px;color:var(--text-2)">${esc(state.tenant.business_name || 'Your bot')} · ${t}</span><div class="ac-bubble ac-bubble-user" style="max-width:72%">${esc(m.text)}</div></div>`
    return `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:3px"><span style="font-size:11.5px;color:var(--text-2)">${esc(who)} · ${t}</span><div class="ac-bubble ac-bubble-bot" style="max-width:72%">${esc(m.text)}</div></div>`
  }).join('')

  const composer = `<div style="border-top:1px solid var(--border);padding:16px 24px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;gap:8px;align-items:flex-end">
      <label style="flex:1 1 0;display:flex;flex-direction:column;gap:6px"><span class="ac-label">Reply as ${esc(state.tenant.business_name || 'your business')}</span>
        <textarea class="ac-textarea" id="th_reply" placeholder="Type your reply — it's sent from your WhatsApp number" style="min-height:64px"></textarea></label>
      <button type="button" class="ac-btn ac-btn-primary" onclick="window._threadSend()">Send</button>
    </div>
    <span class="ac-hint">Your bot stays quiet in this chat until you resume it.</span>
  </div>`

  const aside = `<aside style="flex:1 1 260px;padding:24px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box">
    ${d.handoff && d.handoff.reason ? `<div><div class="ac-label" style="margin-bottom:8px">Why it was handed to you</div><p style="margin:0;font-size:13px;line-height:18px">${esc(d.handoff.reason)}</p></div>` : ''}
    <div><div class="ac-label" style="margin-bottom:8px">Customer</div><dl class="ac-dl" style="grid-template-columns:80px 1fr"><dt>Name</dt><dd>${esc(d.customer.name || '—')}</dd><dt>Number</dt><dd>${esc(num)}</dd><dt>First chat</dt><dd>${d.customer.firstAt ? esc(fmtDate(d.customer.firstAt)) : '—'}</dd></dl></div>
    <a href="#/agent" style="font-size:13px;text-decoration:none;color:var(--brand)">Change when your bot hands off</a>
  </aside>`

  const body = `<div style="flex:1 1 0;display:flex;flex-wrap:wrap;align-items:stretch">
    <div style="flex:999 1 480px;min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--border)">
      <div style="flex:1 1 0;padding:24px;display:flex;flex-direction:column;gap:10px;max-width:820px;width:100%;box-sizing:border-box">
        <div style="align-self:center;font-size:12px;color:var(--text-2)">Conversation</div>
        ${msgs || '<p class="ac-muted" style="align-self:center">No messages yet.</p>'}
      </div>
      ${composer}
    </div>
    ${aside}
  </div>`
  shell('Conversations', head + body)
}
window._threadResume = async () => { try { await api.post('/tenants/' + state.tenant.id + '/handoffs/close', { chatJid: _thread.chatJid }); toast('Bot resumed'); thread(_thread.chatJid) } catch (e) { toast(e.message) } }
window._threadReplyFocus = () => { const t = document.getElementById('th_reply'); if (t) t.focus() }
window._threadSend = async () => {
  const t = document.getElementById('th_reply'); const text = t.value.trim(); if (!text) return
  const btn = t.parentElement.parentElement.querySelector('.ac-btn-primary'); btn.disabled = true
  try { await api.post('/tenants/' + state.tenant.id + '/conversations/' + encodeURIComponent(_thread.chatJid) + '/reply', { text }); await thread(_thread.chatJid) } catch (e) { toast(e.message); btn.disabled = false }
}

// ── Sandbox (Test your bot) ──
let _sbJid = null, _sbMsgs = []
async function sandbox() {
  _sbJid = 'sandbox-' + Date.now() + '@console'; _sbMsgs = []
  const c = (await getTenant().catch(() => null))?.config
  const greeting = `Hi! I'm ${c?.persona?.botName || state.tenant.business_name || 'your assistant'}. How can I help you today?`
  _sbMsgs.push({ bot: true, text: greeting })
  renderSandbox({ knowledgeUsed: null })
}
function renderSandbox(meta) {
  const chips = ['Are you open on Sunday?', 'What do you offer?', 'Can I book a time?']
  const bubbles = _sbMsgs.map((m) => `<div class="ac-bubble ${m.bot ? 'ac-bubble-bot' : 'ac-bubble-user'}">${esc(m.text)}</div>`).join('')
  const aside = `<aside style="flex:1 1 280px;padding:24px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box">
    <div class="ac-label">How it answered</div>
    ${meta && meta.knowledgeUsed != null
      ? `<div style="font-size:13px;color:var(--text-2)">Used ${meta.knowledgeUsed} page${meta.knowledgeUsed === 1 ? '' : 's'} from your knowledge.${meta.toolsCalled && meta.toolsCalled.length ? ' Actions: ' + esc(meta.toolsCalled.map(skillTitle).join(', ')) + '.' : ''}</div>`
      : `<span style="font-size:13px;color:var(--text-2)">Ask something to see which pages your bot used.</span>`}
    <div style="border-top:1px solid var(--border);padding-top:16px;display:flex;flex-direction:column;gap:8px">
      <span style="font-size:13px;font-weight:600">Not the answer you wanted?</span>
      <a href="#/agent" style="font-size:13px;text-decoration:none;color:var(--brand)">Adjust instructions</a>
      <a href="#/knowledge" style="font-size:13px;text-decoration:none;color:var(--brand)">Add a page it should know</a>
    </div></aside>`
  const head = `<div class="ac-pagehead"><a href="#/overview" class="ac-btn ac-btn-ghost ac-btn-sm">${BACK_ICO}Overview</a><h1>Test your bot</h1><div class="ac-pagehead-actions"><button type="button" class="ac-btn ac-btn-secondary" onclick="window._sbReset()">Start over</button></div></div>`
  const body = `<div style="flex:1 1 0;display:flex;flex-wrap:wrap">
    <section style="flex:999 1 480px;min-width:0;display:flex;flex-direction:column;border-right:1px solid var(--border)">
      <div style="padding:12px 24px;background:var(--surface);border-bottom:1px solid var(--border);font-size:13px;line-height:18px;color:var(--text-2)">You're chatting as a customer. Nothing here is sent to WhatsApp.</div>
      <div class="ac-chat" id="sb_chat" style="flex:1 1 0;padding:24px;max-width:820px;width:100%;box-sizing:border-box">${bubbles}</div>
      <div style="padding:0 24px 12px;display:flex;gap:6px;flex-wrap:wrap">${chips.map((q) => `<button type="button" class="ac-chip" style="cursor:pointer;font:inherit;font-size:13px" onclick="window._sbSend(${JSON.stringify(q).replace(/"/g, '&quot;')})">${esc(q)}</button>`).join('')}</div>
      <div style="border-top:1px solid var(--border);padding:16px 24px;display:flex;gap:8px">
        <input class="ac-input" id="sb_in" placeholder="Type a message like a customer would" onkeydown="if(event.key==='Enter')window._sbSend()">
        <button type="button" class="ac-btn ac-btn-primary" onclick="window._sbSend()">Send</button>
      </div>
    </section>
    ${aside}
  </div>`
  shell('Overview', head + body)
}
function skillTitle(key) { return (SKILLS.find((s) => s.key === key) || {}).title || key }
window._sbReset = () => sandbox()
window._sbSend = async (preset) => {
  const inp = document.getElementById('sb_in')
  const text = (preset || (inp && inp.value) || '').trim(); if (!text) return
  if (inp) inp.value = ''
  _sbMsgs.push({ bot: false, text }); renderSandbox({ knowledgeUsed: null })
  _sbMsgs.push({ bot: true, text: '…' }); renderSandbox({ knowledgeUsed: null })
  try {
    const r = await api.post('/tenants/' + state.tenant.id + '/chat', { text, chatJid: _sbJid })
    _sbMsgs.pop()
    if (r.reply) _sbMsgs.push({ bot: true, text: r.reply })
    ;(r.outbox || []).forEach((o) => { if (o.kind === 'text') _sbMsgs.push({ bot: true, text: o.text }) })
    renderSandbox({ knowledgeUsed: r.knowledgeUsed, toolsCalled: r.toolsCalled })
  } catch (e) { _sbMsgs.pop(); _sbMsgs.push({ bot: true, text: 'Something went wrong: ' + e.message }); renderSandbox({ knowledgeUsed: null }) }
  const chat = document.getElementById('sb_chat'); if (chat) chat.scrollTop = chat.scrollHeight
}

// ── Setup / onboarding flow ──
const SETUP_STEPS = ['Website', 'Review', 'Agent type', 'Connect WhatsApp']
const _setup = { step: 0, businessName: '', url: '', profile: null, selected: [], archetype: 'company_info', archetypes: [], tenantId: null, numberId: null, poll: null }
function setupFrame(inner) {
  if (_setup.poll) { clearInterval(_setup.poll); _setup.poll = null }
  $('#app').innerHTML = `<div style="min-height:100vh;display:flex;flex-direction:column;background:var(--bg)">
    <header class="ac-appbar"><a class="ac-appbar-brand" href="#/overview" style="text-decoration:none"><span class="ac-appbar-mark">A</span><span>Agent Console</span></a></header>
    <div style="flex:1;display:flex;justify-content:center;padding:32px 16px"><div style="width:100%;max-width:640px;display:flex;flex-direction:column;gap:20px">${inner}</div></div>
  </div>`
}
function setupStepsHtml(active) {
  return `<ol class="ac-steps">` + SETUP_STEPS.map((s, i) => {
    const cls = i < active ? 'ac-step ac-step-done' : i === active ? 'ac-step ac-step-active' : 'ac-step'
    const n = i < active ? `<span class="ac-step-n">${checkMark}</span>` : `<span class="ac-step-n">${i + 1}</span>`
    return `<li class="${cls}"${i === active ? ' aria-current="step"' : ''}>${n}${s}</li>`
  }).join('') + `</ol>`
}
function setup() { _setup.step = 0; setupWebsite() }
function setupWebsite() {
  setupFrame(`${setupStepsHtml(0)}
    <div><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">Let's start with your website</h1>
    <p style="margin:6px 0 0;color:var(--text-2);max-width:560px">We'll read your site to learn what you do, where you are and how customers reach you. You'll check everything on the next step before your bot uses it.</p></div>
    <section class="ac-card" style="padding:24px;display:flex;flex-direction:column;gap:18px">
      <label class="ac-field"><span class="ac-label">Business name</span><input class="ac-input" id="su_name" value="${esc(_setup.businessName)}" placeholder="Koko Exports"></label>
      <label class="ac-field"><span class="ac-label">Website</span><input type="url" class="ac-input" id="su_url" value="${esc(_setup.url)}" placeholder="https://example.com"><span class="ac-hint">Your home page is enough — we'll find the pages worth learning from.</span></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="ac-btn ac-btn-ghost" onclick="window._suNoSite()">I don't have a website</button><button type="button" class="ac-btn ac-btn-primary" id="su_scan" onclick="window._suScan()">Scan my website</button></div>
    </section>
    <p style="margin:0;font-size:12px;color:var(--text-2)">This usually takes under a minute. Nothing goes live until you connect WhatsApp.</p>`)
}
window._suScan = async () => {
  _setup.businessName = document.getElementById('su_name').value.trim()
  _setup.url = document.getElementById('su_url').value.trim()
  if (!_setup.businessName || !_setup.url) return toast('Business name and website are required')
  const btn = document.getElementById('su_scan'); btn.disabled = true; btn.innerHTML = '<span class="ac-spin"></span> Scanning…'
  try {
    const r = await api.post('/onboard/scrape', { url: _setup.url })
    _setup.profile = r.profile || {}; _setup.selected = r.selected || []; _setup.scanned = r.scanned; _setup.rejected = r.rejected
    _setup.step = 1; setupReview()
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Scan my website' }
}
window._suNoSite = () => { _setup.businessName = (document.getElementById('su_name').value || '').trim() || _setup.businessName; _setup.profile = { name: _setup.businessName, services: [], socials: {}, contact: {} }; _setup.selected = []; _setup.step = 1; setupReview() }
function setupReview() {
  const p = _setup.profile || {}
  const kept = _setup.selected.length || (_setup.scanned || 0)
  const banner = kept ? `<div style="display:flex;align-items:center;gap:12px;background:var(--success-bg);color:var(--success-text);border-radius:10px;padding:12px 16px;font-size:13px;line-height:18px">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex:0 0 auto"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>Scanned your site and picked the <b>${kept} page${kept === 1 ? '' : 's'}</b> worth learning from, skipping blogs and system pages.</span></div>` : ''
  const contact = [p.contact?.phone, p.contact?.email].filter(Boolean).join(' · ')
  const services = (p.services || []).map((s, i) => `<span class="ac-chip">${esc(s)}<button type="button" class="ac-chip-x" aria-label="Remove ${esc(s)}" onclick="window._suDelService(${i})">×</button></span>`).join('')
  const socials = Object.entries(p.socials || {}).map(([k, v]) => `<span class="ac-chip">${esc(k[0].toUpperCase() + k.slice(1))} · ${esc(v.replace(/^https?:\/\/(www\.)?/, '').slice(0, 28))}</span>`).join('') || '<span class="ac-faint" style="font-size:13px">None found</span>'
  setupFrame(`${setupStepsHtml(1)}
    <div><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">Here's what we found</h1><p style="margin:6px 0 0;color:var(--text-2)">Check it over — your bot will use this to answer customers. Edit anything that's off.</p></div>
    ${banner}
    <section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Business profile</h3><p class="ac-card-sub">Shapes how your bot describes you</p></div><button type="button" class="ac-btn ac-btn-secondary ac-btn-sm" onclick="window._suEditProfile()">Edit</button></div>
      <div class="ac-card-body"><dl class="ac-dl"><dt>Business name</dt><dd>${esc(p.name) || '—'}</dd><dt>About</dt><dd>${esc(p.about) || '<span class="ac-faint">—</span>'}</dd><dt>Location</dt><dd>${esc(p.location) || '<span class="ac-faint">—</span>'}</dd><dt>Contact</dt><dd>${esc(contact) || '<span class="ac-faint">—</span>'}</dd><dt>Hours</dt><dd>${esc(p.hours) || '<span class="ac-faint">—</span>'}</dd></dl></div></section>
    <section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Services</h3><p class="ac-card-sub">What customers can ask about</p></div></div>
      <div class="ac-card-body" style="display:flex;flex-direction:column;gap:14px"><div class="ac-row">${services || '<span class="ac-faint" style="font-size:13px">None yet</span>'}</div>
        <div style="display:flex;gap:8px;max-width:420px"><input class="ac-input" id="su_svc" placeholder="Add a service" onkeydown="if(event.key==='Enter')window._suAddService()"><button type="button" class="ac-btn ac-btn-secondary" onclick="window._suAddService()">Add</button></div></div></section>
    <section class="ac-card"><div class="ac-card-head"><div><h3 class="ac-card-title">Social links</h3><p class="ac-card-sub">Your bot can share these when customers ask</p></div></div><div class="ac-card-body ac-row">${socials}</div></section>
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><button type="button" class="ac-btn ac-btn-ghost" onclick="window._suBack(0)">Back</button><button type="button" class="ac-btn ac-btn-primary" onclick="window._suToAgent()">Looks good, continue</button></div>`)
}
window._suDelService = (i) => { _setup.profile.services.splice(i, 1); setupReview() }
window._suAddService = () => { const el = document.getElementById('su_svc'); const v = el.value.trim(); if (!v) return; _setup.profile.services = [...(_setup.profile.services || []), v]; setupReview() }
window._suEditProfile = () => {
  const p = _setup.profile
  const name = prompt('Business name:', p.name || ''); if (name != null) p.name = name.trim()
  const about = prompt('About (one or two sentences):', p.about || ''); if (about != null) p.about = about.trim()
  const loc = prompt('Location:', p.location || ''); if (loc != null) p.location = loc.trim()
  setupReview()
}
window._suToAgent = async () => {
  if (!_setup.archetypes.length) { try { _setup.archetypes = (await api.get('/archetypes')).archetypes } catch {} }
  _setup.step = 2; setupAgentType()
}
function setupAgentType() {
  const arcs = _setup.archetypes
  const opts = arcs.map((a) => `<button type="button" role="radio" aria-checked="${a.key === _setup.archetype}" class="ac-option ${a.key === _setup.archetype ? 'ac-option-on' : ''}" onclick="window._suPickArchetype('${a.key}')"><span><span class="ac-option-title" style="display:block">${esc(a.name)}</span><span class="ac-option-desc" style="display:block">${esc(a.description)}</span></span></button>`).join('')
  const chosen = arcs.find((a) => a.key === _setup.archetype)
  const enables = (chosen?.tools || []).map((t) => `<span class="ac-chip ac-chip-brand">${esc(skillTitle(t))}</span>`).join('')
  setupFrame(`${setupStepsHtml(2)}
    <div><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">What kind of agent do you need?</h1><p style="margin:6px 0 0;color:var(--text-2)">This picks sensible starting skills and tone. You can change everything later in Agent.</p></div>
    <div role="radiogroup" aria-label="Agent type" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">${opts}</div>
    <section style="background:var(--surface);border-radius:10px;padding:16px 20px;display:flex;flex-direction:column;gap:10px"><span class="ac-label">This turns on</span><div class="ac-row">${enables || '<span class="ac-faint" style="font-size:13px">Basic Q&amp;A</span>'}</div></section>
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><button type="button" class="ac-btn ac-btn-ghost" onclick="window._suBack(1)">Back</button><button type="button" class="ac-btn ac-btn-primary" onclick="window._suToConnect()">Continue</button></div>`)
}
window._suPickArchetype = (k) => { _setup.archetype = k; setupAgentType() }
window._suToConnect = async () => {
  _setup.step = 3; setupConnect('creating')
  try {
    const slug = _setup.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36).slice(-4)
    const r = await api.post('/tenants', { slug, businessName: _setup.businessName, archetype: _setup.archetype, profile: _setup.profile, selected: _setup.selected, url: _setup.url || undefined })
    _setup.tenantId = r.tenant.id
    setupConnect('phone')
  } catch (e) { toast(e.message); setupConnect('phone') }
}
function setupConnect(mode) {
  const inner = mode === 'creating'
    ? `<section class="ac-card" style="padding:24px"><div style="display:flex;align-items:center;gap:10px;color:var(--text-2)"><span class="ac-spin"></span> Creating your agent and learning your site…</div></section>`
    : `<section class="ac-card" style="padding:24px;display:flex;flex-direction:column;gap:18px">
        <label class="ac-field"><span class="ac-label">WhatsApp number (country code + number)</span><input class="ac-input" id="su_phone" placeholder="911234567890"><span class="ac-hint">Use a dedicated or secondary number — unofficial WhatsApp carries ban risk.</span></label>
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><button type="button" class="ac-btn ac-btn-ghost" onclick="location.hash='#/overview'">Skip for now</button><button type="button" class="ac-btn ac-btn-primary" id="su_gen" onclick="window._suLink()">Generate pairing code</button></div>
        <div id="su_pair"></div>
      </section>`
  setupFrame(`${setupStepsHtml(3)}
    <div><h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700">Connect your WhatsApp number</h1><p style="margin:6px 0 0;color:var(--text-2)">Your bot answers from your own number. You'll link it like adding WhatsApp on a computer — no app to install.</p></div>
    ${inner}`)
}
window._suLink = async () => {
  const phone = (document.getElementById('su_phone').value || '').replace(/\D/g, '')
  if (!phone) return toast('Enter a phone number')
  const btn = document.getElementById('su_gen'); btn.disabled = true; btn.textContent = 'Starting…'
  const pair = document.getElementById('su_pair')
  try {
    const { numberId } = await api.post('/tenants/' + _setup.tenantId + '/link', { phone })
    let i = 0
    _setup.poll = setInterval(async () => {
      i++; let s = {}; try { s = await api.get('/numbers/' + numberId + '/status') } catch {}
      if (s.authStatus === 'linked') { clearInterval(_setup.poll); _setup.poll = null; state.tenant = null; toast('Linked! Your bot is live.'); location.hash = '#/overview'; return }
      if (s.code) { const f = s.code.length === 8 ? s.code.slice(0, 4) + '-' + s.code.slice(4) : s.code; pair.innerHTML = `<div class="ac-pair" style="margin-top:8px"><div class="ac-pair-code">${esc(f)}</div><div class="ac-pair-hint"><span class="ac-spin"></span> Waiting for you to enter this code on your phone…</div></div>
        <ol style="margin:14px 0 0;padding:0 0 0 20px;display:flex;flex-direction:column;gap:8px"><li>Open <b>WhatsApp</b> on your phone.</li><li>Tap <b>Settings</b> (iPhone) or <b>⋮</b> (Android), then <b>Linked devices</b>.</li><li>Tap <b>Link a device</b>, then <b>Link with phone number instead</b>.</li><li>Type the code above. It stays valid for a few minutes.</li></ol>` }
      else pair.innerHTML = `<div class="ac-pair" style="margin-top:8px"><div class="ac-pair-hint"><span class="ac-spin"></span> Requesting pairing code…</div></div>`
      if (i > 180) { clearInterval(_setup.poll); _setup.poll = null }
    }, 2500)
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Generate pairing code' }
}
window._suBack = (step) => { _setup.step = step; step === 0 ? setupWebsite() : step === 1 ? setupReview() : setupAgentType() }

// ── Auth screens ──
const GOOGLE_ICO = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.75" stroke="currentColor" stroke-width="1.5"/><path d="M8 8h5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
function authFrame(cardInner, footer) {
  $('#app').innerHTML = `<div style="font-family:var(--font-sans);background:var(--surface);color:var(--text-1);min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:64px 16px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;margin-bottom:28px"><span style="width:28px;height:28px;border-radius:7px;background:var(--brand);color:var(--on-brand);display:grid;place-items:center;font-size:14px;font-weight:800">A</span>Agent Console</div>
    <main class="ac-card" style="width:100%;max-width:400px;padding:32px;box-sizing:border-box;display:flex;flex-direction:column;gap:18px">${cardInner}</main>
    <p style="margin:20px 0 0;font-size:13px;color:var(--text-2)">${footer}</p>
  </div>`
}
const authDivider = `<div style="display:flex;align-items:center;gap:12px;color:var(--text-2);font-size:12px"><span style="flex:1 1 0;height:1px;background:var(--border)"></span>or use your email<span style="flex:1 1 0;height:1px;background:var(--border)"></span></div>`
function login() {
  authFrame(`
    <div><h1 style="margin:0;font-size:20px;line-height:28px;font-weight:700">Log in to your bot</h1><p style="margin:4px 0 0;font-size:13px;line-height:18px;color:var(--text-2)">Check on your WhatsApp agent and reply to customers who need you.</p></div>
    <button class="ac-btn ac-btn-secondary" style="justify-content:center;width:100%" onclick="window._ssoSoon()">${GOOGLE_ICO}Continue with Google</button>
    ${authDivider}
    <label class="ac-field"><span class="ac-label">Email</span><input type="email" id="au_email" class="ac-input" placeholder="you@business.com" onkeydown="if(event.key==='Enter')window._login()"></label>
    <div style="display:flex;flex-direction:column;gap:6px"><label class="ac-field"><span class="ac-label">Password</span><input type="password" id="au_pw" class="ac-input" onkeydown="if(event.key==='Enter')window._login()"></label><a href="#" onclick="window._ssoSoon();return false" style="font-size:12.5px;align-self:flex-end;text-decoration:none;color:var(--brand)">Forgot password?</a></div>
    <button class="ac-btn ac-btn-primary" style="justify-content:center;width:100%" id="au_submit" onclick="window._login()">Log in</button>
    <div id="au_err" style="font-size:12.5px;color:var(--danger-text)"></div>`,
    `New here? <a href="#/signup" style="font-weight:600;text-decoration:none;color:var(--brand)">Create an account</a>`)
}
function signup() {
  authFrame(`
    <div><h1 style="margin:0;font-size:20px;line-height:28px;font-weight:700">Create your account</h1><p style="margin:4px 0 0;font-size:13px;line-height:18px;color:var(--text-2)">Set up a WhatsApp AI agent for your business in a few minutes.</p></div>
    <button class="ac-btn ac-btn-secondary" style="justify-content:center;width:100%" onclick="window._ssoSoon()">${GOOGLE_ICO}Continue with Google</button>
    ${authDivider}
    <label class="ac-field"><span class="ac-label">Your name</span><input id="au_name" class="ac-input" placeholder="Meera Raghavan"></label>
    <label class="ac-field"><span class="ac-label">Email</span><input type="email" id="au_email" class="ac-input" placeholder="you@business.com"></label>
    <label class="ac-field"><span class="ac-label">Password</span><input type="password" id="au_pw" class="ac-input" placeholder="At least 8 characters" onkeydown="if(event.key==='Enter')window._signup()"></label>
    <button class="ac-btn ac-btn-primary" style="justify-content:center;width:100%" id="au_submit" onclick="window._signup()">Create account</button>
    <div id="au_err" style="font-size:12.5px;color:var(--danger-text)"></div>`,
    `Already have an account? <a href="#/login" style="font-weight:600;text-decoration:none;color:var(--brand)">Log in</a>`)
}
window._ssoSoon = () => toast('Google sign-in is coming soon — use email for now.')
function authErr(m) { const e = document.getElementById('au_err'); if (e) e.textContent = m }
async function _authDone() {
  const me = await api.get('/auth/me'); state.user = me.user; state.tenant = me.tenant
  location.hash = (me.user && me.user.role === 'admin') ? '#/admin' : (state.tenant ? '#/overview' : '#/setup')
  route()
}
window._login = async () => {
  const email = val('au_email'), password = val('au_pw'); if (!email || !password) return authErr('Enter your email and password.')
  const btn = document.getElementById('au_submit'); btn.disabled = true; btn.textContent = 'Logging in…'
  try { await api.post('/auth/login', { email, password }); _authDone() } catch (e) { authErr(e.message); btn.disabled = false; btn.textContent = 'Log in' }
}
window._signup = async () => {
  const name = val('au_name'), email = val('au_email'), password = val('au_pw')
  if (!email || !password) return authErr('Enter your email and a password.')
  const btn = document.getElementById('au_submit'); btn.disabled = true; btn.textContent = 'Creating…'
  try { await api.post('/auth/signup', { name, email, password }); _authDone() } catch (e) { authErr(e.message); btn.disabled = false; btn.textContent = 'Create account' }
}
window._logout = async () => { try { await api.post('/auth/logout', {}) } catch {} state.user = null; state.tenant = null; location.hash = '#/login'; route() }
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : '' }

// ── Admin view (operator: all agents) ──
function adminShell(mainHtml) {
  const uname = (state.user && (state.user.name || state.user.email)) || 'Admin'
  $('#app').innerHTML = `<div class="ac-shell">
    <header class="ac-appbar">
      <a href="#/admin" class="ac-appbar-brand" style="text-decoration:none"><span class="ac-appbar-mark">A</span><span>Agent Console</span></a>
      <div class="ac-appbar-mid"><label class="ac-search"><svg class="ac-ico" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="${ICON.search}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><input placeholder="Search agents" aria-label="Search"></label></div>
      <div class="ac-appbar-end"><span class="ac-badge ac-badge-blue">Admin</span><span style="font-size:13px;color:var(--text-2)">${esc(uname)}</span><button class="ac-btn ac-btn-ghost ac-btn-sm" onclick="window._logout()">Log out</button></div>
    </header>
    <main class="ac-main">${mainHtml}</main>
  </div>`
}
async function adminHome() {
  state.tenant = null
  adminShell(pagehead('All agents', `<a class="ac-btn ac-btn-primary" href="#/setup">＋ New agent</a>`) + loading())
  let list; try { list = (await api.get('/tenants')).tenants } catch (e) { return adminShell(pagehead('All agents') + `<div class="ac-content"><div class="ac-note">Could not load: ${esc(e.message)}</div></div>`) }
  const statusBadge = (s) => s === 'linked' ? '<span class="ac-badge ac-badge-green"><span class="ac-badge-dot"></span>Live</span>' : s === 'linking' ? '<span class="ac-badge ac-badge-amber">Connecting</span>' : '<span class="ac-badge ac-badge-gray">Not connected</span>'
  const rows = list.map((t) => `<tr onclick="window._adminOpen('${t.id}', ${JSON.stringify(t.business_name || '').replace(/"/g, '&quot;')})">
    <td style="font-weight:600">${esc(t.business_name || t.slug || '—')}</td>
    <td class="ac-muted">${t.phone_e164 ? esc(fmtPhone(t.phone_e164)) : '<span class="ac-faint">No number</span>'}</td>
    <td>${statusBadge(t.auth_status)}</td>
    <td class="ac-muted" style="text-align:right">${Number(t.messages || 0).toLocaleString()}</td>
    <td style="text-align:right">${Number(t.open_handoffs || 0) ? `<span class="ac-badge ac-badge-blue">${t.open_handoffs}</span>` : '<span class="ac-faint">0</span>'}</td>
  </tr>`).join('')
  const body = `<div class="ac-content">
    <p style="margin:0;color:var(--text-2)">Every bot on the platform. Open one to manage it.</p>
    <section class="ac-card">
      <div class="ac-card-head"><div><h3 class="ac-card-title">Agents</h3><p class="ac-card-sub">${list.length} total</p></div></div>
      <div style="overflow-x:auto"><table class="ac-table ac-table-click" style="min-width:640px">
        <thead><tr><th>Business</th><th style="width:170px">Number</th><th style="width:150px">Status</th><th style="width:110px;text-align:right">Messages</th><th style="width:110px;text-align:right">Waiting</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5"><div class="ac-empty" style="padding:28px"><p>No agents yet.</p></div></td></tr>'}</tbody>
      </table></div>
    </section>
  </div>`
  adminShell(pagehead('All agents', `<a class="ac-btn ac-btn-primary" href="#/setup">＋ New agent</a>`) + body)
}
window._adminOpen = (id, name) => { state.tenant = { id, business_name: name }; location.hash = '#/overview' }

// ── Router ──
async function route() {
  const hash = location.hash.replace(/^#\//, '') || 'overview'
  const [screen, arg] = hash.split('/')
  if (state.user === undefined) {
    try { const me = await api.get('/auth/me'); state.user = me.user; state.tenant = me.tenant } catch (e) { $('#app').innerHTML = `<div style="padding:40px;font-family:var(--font-sans)">Could not reach the server.</div>`; return }
  }
  if (!state.user) return screen === 'signup' ? signup() : login()
  if (screen === 'login' || screen === 'signup') { location.hash = '#/overview'; return }
  const isAdmin = state.user.role === 'admin'
  if (screen === 'setup') return setup()
  if (screen === 'admin') { if (isAdmin) return adminHome(); location.hash = '#/overview'; return }
  if (isAdmin && !state.tenant) return adminHome()
  if (!isAdmin && !state.tenant) return setup()
  switch (screen) {
    case 'overview': return overview(arg === '7d' ? '7d' : 'today')
    case 'agent': return agent()
    case 'knowledge': return knowledge()
    case 'catalog': return catalog()
    case 'conversations': return arg ? thread(decodeURIComponent(arg)) : conversations()
    case 'whatsapp': return whatsapp()
    case 'integrations': return integrations()
    case 'settings': return settings()
    case 'sandbox': return sandbox()
    case 'setup': return setup()
    default: return overview('today')
  }
}

window.addEventListener('hashchange', route)
route()
