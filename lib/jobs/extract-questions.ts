// Extrae las preguntas screening que el cliente embebe dentro del job description.
// Caso típico:
//   "...you will be asked to answer the following questions when submitting a proposal:
//    1. How many years of experience do you have with X?
//    2. Describe a similar project...
//    Skills and Expertise..."
//
// Devuelve null si no hay un bloque de preguntas con texto real
// (un "please answer the screening questions" sin items no cuenta).

const HEADER_PATTERNS = [
  /you will be asked to answer the following questions[^:.\n]*:?/i,
  /you will be asked the following questions[^:.\n]*:?/i,
  /please answer the following questions[^:.\n]*:?/i,
  /please answer the below[^:.\n]*:?/i,
  /please answer these questions[^:.\n]*:?/i,
  /answer the following questions[^:.\n]*:?/i,
  /screening questions[^:.\n]*:/i,
  /when applying,?\s+please answer[^:.\n]*:?/i,
];

// Marcadores que indican que el bloque de preguntas terminó.
const END_MARKERS = [
  /skills?\s+(and|&)\s+expertise/i,
  /mandatory skills/i,
  /preferred qualifications/i,
  /about the client/i,
  /activity on this job/i,
  /project type:/i,
  /client's recent history/i,
  /payment method/i,
];

function findHeaderIndex(text: string): { idx: number; matchLength: number } | null {
  for (const p of HEADER_PATTERNS) {
    const m = p.exec(text);
    if (m) return { idx: m.index, matchLength: m[0].length };
  }
  return null;
}

function findEndIndex(text: string, startFrom: number): number {
  let end = text.length;
  for (const p of END_MARKERS) {
    const sub = text.slice(startFrom);
    const m = p.exec(sub);
    if (m && m.index + startFrom < end) end = m.index + startFrom;
  }
  return end;
}

export function extractQuestions(description: string | null | undefined): string[] | null {
  if (!description) return null;
  const text = description.replace(/\r\n/g, '\n');

  const header = findHeaderIndex(text);
  if (!header) return null;

  const afterHeader = header.idx + header.matchLength;
  const end = findEndIndex(text, afterHeader);
  const block = text.slice(afterHeader, end);

  // Parsear items numerados "1." "2)" "3-"
  const numbered = [...block.matchAll(/(?:^|\n)\s*(\d+)[.)\-]\s+([^\n]+(?:\n(?!\s*\d+[.)\-]\s)(?!\s*[•\-\*]\s)[^\n]+)*)/g)]
    .map((m) => m[2].trim().replace(/\s+/g, ' '))
    .filter((q) => q.length > 5);

  if (numbered.length >= 1) return numbered;

  // Fallback: bullets "•" "-" "*"
  const bulleted = [...block.matchAll(/(?:^|\n)\s*[•\-\*]\s+([^\n]+(?:\n(?!\s*[•\-\*]\s)[^\n]+)*)/g)]
    .map((m) => m[1].trim().replace(/\s+/g, ' '))
    .filter((q) => q.length > 10 && /\?$|describe|explain|tell|share|what|how|why|when|do you|are you|have you/i.test(q));

  if (bulleted.length >= 2) return bulleted;

  return null;
}
