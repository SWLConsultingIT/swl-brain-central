// Backfill: para cada job en Supabase que aún no tiene `questions`,
// hace 1 request a Upwork GraphQL y guarda las screening questions.
//
// READ + WRITE controlado: solo escribe el campo nuevo `questions`.
// No toca title/description/status/etc.
//
// Uso:
//   UPWORK_BEARER_TOKEN="oauth2v2_pub_..." \
//   node --env-file=.env.local --experimental-strip-types scripts/backfill-questions.ts [--limit 50] [--retry]
//
// Por default procesa solo jobs con questions IS NULL.
// Con --retry también re-procesa los que tienen [] (sin preguntas) por si fue error transitorio.
export {};
import { createClient } from '@supabase/supabase-js';

const TOKEN = process.env.UPWORK_BEARER_TOKEN!;
if (!TOKEN) { console.error('Falta UPWORK_BEARER_TOKEN'); process.exit(1); }

const LIMIT = parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '500', 10);
const RETRY = process.argv.includes('--retry');
const DELAY_MS = 150;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

const QUERY = `query($id: ID!) {
  marketplaceJobPosting(id: $id) {
    contractorSelection {
      proposalRequirement {
        screeningQuestions { question sequenceNumber }
      }
    }
  }
}`;

async function fetchQuestions(upworkId: string): Promise<{ ok: boolean; questions?: any[]; error?: string }> {
  const r = await fetch('https://api.upwork.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { id: upworkId } }),
  });
  const body = await r.json();
  if (body?.errors) {
    return { ok: false, error: body.errors.map((e: any) => e.message).join(' | ') };
  }
  const qs = body?.data?.marketplaceJobPosting?.contractorSelection?.proposalRequirement?.screeningQuestions;
  return { ok: true, questions: qs ?? [] };
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

console.log(`Backfill iniciado (limit=${LIMIT}, retry=${RETRY})\n`);

let query = sb.from('jobs').select('id, upwork_id, title').not('upwork_id', 'is', null).order('created_at', { ascending: false }).limit(LIMIT);
if (!RETRY) query = query.is('questions', null);

const { data, error } = await query;
if (error) { console.error('Supabase error:', error); process.exit(2); }
if (!data?.length) { console.log('Nada para procesar.'); process.exit(0); }

console.log(`Jobs a procesar: ${data.length}\n`);

let ok = 0, withQs = 0, errors = 0, notFound = 0;
for (let i = 0; i < data.length; i++) {
  const j = data[i];
  const r = await fetchQuestions(j.upwork_id!);
  if (!r.ok) {
    if (/not found|404/i.test(r.error || '')) { notFound++; }
    else { errors++; console.log(`  [${i + 1}/${data.length}] ❌ ${j.title.slice(0, 60)} — ${r.error?.slice(0, 100)}`); }
  } else {
    const qs = r.questions!;
    const { error: upErr } = await sb.from('jobs').update({ questions: qs }).eq('id', j.id);
    if (upErr) { errors++; console.log(`  [${i + 1}/${data.length}] ❌ db error: ${upErr.message}`); }
    else {
      ok++;
      if (qs.length > 0) withQs++;
      if (qs.length > 0) console.log(`  [${i + 1}/${data.length}] ✅ ${j.title.slice(0, 60)} → ${qs.length} preguntas`);
    }
  }
  await sleep(DELAY_MS);
}

console.log('\n=== Resumen ===');
console.log(`OK:           ${ok}`);
console.log(`Con preguntas: ${withQs} (${Math.round((withQs / Math.max(ok, 1)) * 100)}% de los OK)`);
console.log(`Sin preguntas: ${ok - withQs}`);
console.log(`Not found:    ${notFound} (job ya no existe en Upwork)`);
console.log(`Errores:      ${errors}`);
