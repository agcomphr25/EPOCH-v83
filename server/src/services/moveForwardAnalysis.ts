import OpenAI from 'openai';

export const MOVE_FORWARD_TYPES = [
  'task',
  'reminder',
  'accounting_attention',
  'production_quality_discussion',
  'compliance_attention',
  'person_follow_up',
  'idea_process_improvement',
  'reference_note',
] as const;

export type MoveForwardItemDraft = {
  itemType: (typeof MOVE_FORWARD_TYPES)[number];
  title: string;
  details?: string;
  category?: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  dueDate?: string | null;
  amountCents?: number | null;
  suggestedLinks?: Array<{ type: string; id: string; label: string }>;
};

export type MoveForwardAnalysis = {
  items: MoveForwardItemDraft[];
  questions: string[];
  usedAi: boolean;
};

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
function nextBusinessDay(from: Date) {
  const date = new Date(from);
  do date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6);
  return iso(date);
}
function firstBusinessDay(year: number, month: number) {
  const date = new Date(year, month, 1);
  while (date.getDay() === 0 || date.getDay() === 6)
    date.setDate(date.getDate() + 1);
  return iso(date);
}

export function sensibleDate(text: string, now = new Date()): string | null {
  const lower = text.toLowerCase();
  if (/\b(today|urgent|immediately|safety)\b/.test(lower)) return iso(now);
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return iso(d);
  }
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const month = months.findIndex((name) => lower.includes(name));
  if (month >= 0) {
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    let year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
    if (!yearMatch && month < now.getMonth()) year += 1;
    return firstBusinessDay(year, month);
  }
  if (/\b(ask|follow up|check|review|call|make sure)\b/.test(lower))
    return nextBusinessDay(now);
  return null;
}

function amountCents(text: string) {
  const match = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  return match ? Math.round(Number(match[1].replace(/,/g, '')) * 100) : null;
}

export function deterministicAnalysis(
  text: string,
  now = new Date()
): MoveForwardAnalysis {
  const clean = text.trim().replace(/\s+/g, ' ');
  const lower = clean.toLowerCase();
  const dueDate = sensibleDate(clean, now);
  const amount = amountCents(clean);
  const items: MoveForwardItemDraft[] = [
    {
      itemType: 'reference_note',
      title: clean.slice(0, 100),
      details: clean,
      category: 'Reference',
      priority: 'NORMAL',
      dueDate: null,
    },
  ];
  const add = (item: MoveForwardItemDraft) => items.push(item);

  if (
    amount !== null ||
    /\b(accounting|expense|spend|payment|renewal|budget)\b/.test(lower)
  )
    add({
      itemType: 'accounting_attention',
      title: clean.slice(0, 100),
      details: clean,
      category: 'Accounting',
      priority: 'HIGH',
      dueDate,
      amountCents: amount,
    });
  if (/\b(ddtc|registration|compliance|itar|audit)\b/.test(lower))
    add({
      itemType: 'compliance_attention',
      title: clean.slice(0, 100),
      details: clean,
      category: 'Compliance',
      priority: 'HIGH',
      dueDate,
    });
  if (
    /\b(scrap|scrapped|defect|mandrel|layup|ply|plies|quality|qms)\b/.test(
      lower
    )
  )
    add({
      itemType: 'production_quality_discussion',
      title: clean.slice(0, 100),
      details: clean,
      category: /\b(qms|quality|audit)\b/.test(lower)
        ? 'Quality'
        : 'Production',
      priority: 'HIGH',
      dueDate: null,
    });
  if (/\b(ask|call|talk to|follow up with)\b/.test(lower))
    add({
      itemType: 'person_follow_up',
      title: clean.slice(0, 100),
      details: clean,
      category: 'Follow-up',
      priority: 'NORMAL',
      dueDate: dueDate || nextBusinessDay(now),
    });
  if (
    /\b(need to|have to|should|ask|check|review|renew|follow up)\b/.test(lower)
  )
    add({
      itemType: 'task',
      title: clean.slice(0, 100),
      details: clean,
      category: 'Action',
      priority: /\b(urgent|safety)\b/.test(lower) ? 'CRITICAL' : 'NORMAL',
      dueDate,
    });
  if (amount !== null && dueDate) {
    const reminder = new Date(`${dueDate}T12:00:00`);
    reminder.setDate(reminder.getDate() - 30);
    add({
      itemType: 'reminder',
      title: `Prepare for: ${clean.slice(0, 80)}`,
      details: clean,
      category: 'Reminder',
      priority: 'NORMAL',
      dueDate: iso(reminder),
    });
  }

  const questions: string[] = [];
  if (
    /\b(scrap|scrapped|mandrel|defect|qms)\b/.test(lower) &&
    !/\b(?:p1|p2|po|wo|order)\s*[-#]?\s*[a-z0-9]+\b/i.test(clean)
  )
    questions.push('Which order, work order, part, or process was affected?');
  if (
    /\b(ask|call|talk to)\b/.test(lower) &&
    !/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      clean
    )
  )
    questions.push('When would you like this follow-up to surface?');
  return { items, questions, usedAi: false };
}

function validAnalysis(
  value: any
): value is { items: MoveForwardItemDraft[]; questions: string[] } {
  return (
    value &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every(
      (item: any) =>
        MOVE_FORWARD_TYPES.includes(item.itemType) &&
        typeof item.title === 'string'
    ) &&
    Array.isArray(value.questions)
  );
}

export async function analyzeMoveForward(
  text: string,
  rules: string[],
  now = new Date()
): Promise<MoveForwardAnalysis> {
  const fallback = deterministicAnalysis(text, now);
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    const response = await client.chat.completions.create({
      model: process.env.MOVE_FORWARD_MODEL || 'gpt-5-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Split Glenn's private brain dump into useful proposed items. Always retain one reference_note. Allowed itemType values: ${MOVE_FORWARD_TYPES.join(', ')}. Never claim to modify official records. Use sensible ISO dates: undated ask/check = next business day; month-only = first business day; urgent/safety = today. Ask only important missing-context questions, one will be shown at a time. Return JSON {items:[{itemType,title,details,category,priority,dueDate,amountCents,suggestedLinks:[]}],questions:[]}. Approved rules:\n${rules.join('\n') || '(none)'}`,
        },
        { role: 'user', content: `Today is ${iso(now)}. Capture: ${text}` },
      ],
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    return validAnalysis(parsed) ? { ...parsed, usedAi: true } : fallback;
  } catch (error) {
    console.warn(
      '[moveForward] AI analysis unavailable:',
      error instanceof Error ? error.message : error
    );
    return fallback;
  }
}
