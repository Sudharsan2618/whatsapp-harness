import { TenantRepository } from '../src/control/tenantRepository'
import { recordLlmUsage } from '../src/control/usage'
import { pool } from '../src/db/pool'
import { KnowledgeStore } from '../src/intelligence/knowledge/store'
import { ModelAgent } from '../src/intelligence/modelAgent'
import { isHandoffOpen } from '../src/orchestration/handoff'
import { MessageStore } from '../src/transport/messageStore'

// Local end-to-end agent test (no WhatsApp). Memory persists across calls for the
// same --chat, so run it twice to see memory work. Honors handoff gating.
// Usage: npx tsx scripts/agent-chat.ts --slug kokoexports "do you export cocoa to Germany?"
function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function run(): Promise<void> {
  const slug = arg('slug') ?? 'kokoexports'
  const chatJid = arg('chat') ?? 'console-test@s.whatsapp.net'
  const text = process.argv.filter((a) => !a.startsWith('--')).at(-1)
  if (!text || text.endsWith('agent-chat.ts')) throw new Error('provide a message as the last argument')

  const { rows } = await pool.query<{ id: string }>('select id from tenants where slug = $1', [slug])
  const tenantId = rows[0]?.id
  if (!tenantId) throw new Error(`tenant not found: ${slug}`)

  if (await isHandoffOpen(pool, tenantId, chatJid)) {
    console.log('--- PAUSED: a human handoff is open for this chat; the bot stays silent ---')
    await new MessageStore(pool, tenantId).saveIncomingText(chatJid, text)
    return
  }

  const tenants = new TenantRepository(pool)
  const config = await tenants.getResolvedConfig(tenantId)
  const messages = new MessageStore(pool, tenantId)
  const knowledge = new KnowledgeStore(pool, tenantId)
  const agent = new ModelAgent(pool)

  const history = await messages.recentTurns(chatJid, 8)
  const context = await knowledge.retrieve(text, config.retrieval.topK)

  const reply = await agent.handle({
    tenantId,
    chatJid,
    customerJid: chatJid,
    text,
    config,
    history,
    knowledge: context,
  })

  console.log('---')
  console.log('model:', reply.provider, reply.model)
  console.log('history turns:', history.length, '| knowledge chunks:', context.length)
  console.log('tools called:', reply.toolsCalled?.join(', ') || 'none')
  console.log('you:', text)
  console.log('bot:', reply.text)
  console.log('tokens in/out:', reply.tokensIn, '/', reply.tokensOut)

  await messages.saveIncomingText(chatJid, text)
  await messages.saveOutgoingText(chatJid, reply.text)
  await recordLlmUsage(pool, tenantId, reply)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
