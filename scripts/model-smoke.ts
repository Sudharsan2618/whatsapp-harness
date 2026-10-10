import type { ModelSpec } from '../src/config/schema'
import { createModel } from '../src/intelligence/models/factory'

// Verify a provider/model works through our own code path.
// Usage: npx tsx scripts/model-smoke.ts openrouter openai/gpt-6-luna
async function run(): Promise<void> {
  const provider = (process.argv[2] ?? 'openrouter') as ModelSpec['provider']
  const model = process.argv[3] ?? ''
  const chat = createModel({ provider, model, temperature: 0.3 })

  const result = await chat.complete(
    [
      { role: 'system', content: 'You are a WhatsApp assistant. Reply in one short sentence.' },
      { role: 'user', content: 'Say hello and name the model you are.' },
    ],
    { temperature: 0.3 },
  )

  console.log('provider:', provider, '| model:', chat.model)
  console.log('reply:', result.text)
  console.log('tokens in/out:', result.tokensIn, '/', result.tokensOut)
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
