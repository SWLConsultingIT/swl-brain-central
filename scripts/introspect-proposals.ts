// Buscar en el schema de Upwork la query de PROPUESTAS PROPIAS y el campo
// "viewed by client". Upwork bloquea introspection masiva -> vamos por partes.
//
// Uso:  UPWORK_TOKEN=xxxx npx tsx scripts/introspect-proposals.ts
export {};
const TOKEN = process.env.UPWORK_TOKEN!;
const GQL = 'https://api.upwork.com/graphql';

async function gql(query: string) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

function typeStr(t: any): string {
  if (!t) return '?';
  if (t.kind === 'LIST') return `[${typeStr(t.ofType)}]`;
  if (t.kind === 'NON_NULL') return `${typeStr(t.ofType)}!`;
  return t.name ?? t.kind;
}

// 1) Listar TODAS las queries raíz y marcar las que suenan a propuestas/ofertas
async function listRootQueries() {
  console.log('\n=== Root Queries (filtradas por proposal/offer/application/submission) ===');
  const r = await gql(`{ __schema { queryType { fields { name description type { kind name ofType { kind name } } } } } }`);
  if (r?.errors) { console.log('  errors:', JSON.stringify(r.errors).slice(0, 400)); return []; }
  const fields = r?.data?.__schema?.queryType?.fields ?? [];
  const re = /propos|offer|applicat|submission|bid|connect|myjobs|freelancer/i;
  const hits: string[] = [];
  for (const f of fields) {
    if (re.test(f.name) || re.test(f.description ?? '')) {
      console.log(`  ${f.name}: ${typeStr(f.type)}`);
      const tn = f.type?.name ?? f.type?.ofType?.name;
      if (tn) hits.push(tn);
    }
  }
  console.log(`\n  (total root queries: ${fields.length})`);
  return hits;
}

// 2) Inspeccionar un type y resaltar campos con "view"/"seen"
async function inspectType(name: string) {
  console.log(`\n=== Type \`${name}\` ===`);
  const r = await gql(`{
    __type(name: "${name}") {
      kind name
      fields { name description type { kind name ofType { kind name ofType { kind name } } } }
    }
  }`);
  if (r?.errors) { console.log('  errors:', JSON.stringify(r.errors).slice(0, 300)); return; }
  const t = r?.data?.__type;
  if (!t) { console.log('  not found'); return; }
  for (const f of t.fields ?? []) {
    const mark = /view|seen|read|opened/i.test(f.name) ? '  <<< POSIBLE "viewed by client"' : '';
    console.log(`  ${f.name}: ${typeStr(f.type)}${mark}`);
  }
}

const hits = await listRootQueries();

// Inspeccionar los types candidatos que aparecieron + algunos nombres probables
const guesses = Array.from(new Set([
  ...hits,
  'Proposal', 'JobProposal', 'MarketplaceJobApplication', 'Application',
  'Offer', 'Submission', 'ClientProposal', 'FreelancerProposal',
]));
for (const g of guesses) await inspectType(g);

console.log('\n\nLISTO. Buscá las líneas marcadas con "<<< POSIBLE" o cualquier campo tipo viewedByClient / lastViewed / seenAt.');
