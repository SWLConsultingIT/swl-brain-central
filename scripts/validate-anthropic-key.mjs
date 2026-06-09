const key = process.env.ANTHROPIC_API_KEY
if (!key) {
  console.error('ANTHROPIC_API_KEY no está seteada')
  process.exit(1)
}

console.log(`Key cargada: prefix=${key.slice(0, 12)}... length=${key.length}`)
console.log('Probando con Anthropic Haiku 4.5...\n')

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Say only: ok' }],
  }),
})

console.log(`HTTP ${res.status}`)
const body = await res.text()

try {
  const json = JSON.parse(body)
  if (res.ok && json.content?.[0]?.text) {
    console.log(`✅ FUNCIONA. Respuesta: "${json.content[0].text}"`)
    console.log(`   model: ${json.model}`)
    console.log(`   usage: input=${json.usage?.input_tokens} output=${json.usage?.output_tokens}`)
  } else {
    console.log(`❌ ERROR:`, json)
  }
} catch {
  console.log('Raw response:', body.slice(0, 300))
}
