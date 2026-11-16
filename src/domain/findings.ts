import type { Finding, FindingType, ID, ISODate } from './types';

export type FieldErrors = Partial<Record<keyof Finding, string>>;

const blank = (v?: string) => !v || !v.trim();

/** Drafts may be incomplete; submission requires these fields. */
export function validateForSubmit(f: Partial<Finding> & { type: FindingType }): FieldErrors {
  const e: FieldErrors = {};
  if (blank(f.title)) e.title = 'Add a short title so the finding can be scanned in lists.';
  if (!f.projectId) e.projectId = 'Choose the project this finding belongs to.';
  if (f.type === 'bug') {
    if (!f.severity) e.severity = 'Choose a severity: how much this affects the player.';
    if (!f.priority) e.priority = 'Choose a priority: when this should be fixed.';
    if (blank(f.steps)) e.steps = 'List the steps that lead to the problem.';
    if (blank(f.expected)) e.expected = 'Describe what should have happened.';
    if (blank(f.actual)) e.actual = 'Describe what actually happened.';
  }
  if (f.type === 'feedback') {
    if (blank(f.observation)) e.observation = 'Describe what you observed.';
  }
  if (f.type === 'question') {
    if (blank(f.question)) e.question = 'Write the question you need answered.';
    if (!f.ownerId) e.ownerId = 'Pick who should answer this question.';
  }
  return e;
}

export const isOpen = (f: Finding) => f.status === 'open' || f.status === 'in_progress';
export const isAwaitingAnswer = (f: Finding) => f.type === 'question' && f.status !== 'draft' && !f.answer && f.status !== 'closed';

export function answerQuestion(q: Finding, answer: string, at: ISODate): Finding {
  if (q.type !== 'question') throw new Error('Only questions can be answered.');
  if (blank(answer)) throw new Error('An answer cannot be empty.');
  return { ...q, answer: answer.trim(), answeredAt: at, status: 'resolved', updatedAt: at };
}

/** Deliberate conversion: creates a new bug draft that links back to the question. */
export function questionToBugDraft(q: Finding, newId: ID, at: ISODate): Finding {
  return {
    id: newId,
    type: 'bug',
    projectId: q.projectId,
    buildId: q.buildId,
    title: q.title,
    description: `Converted from question ${q.id}: ${q.question ?? ''}`.trim(),
    status: 'draft',
    reporterId: q.reporterId,
    createdAt: at,
    updatedAt: at,
    convertedFromId: q.id,
  };
}

export function nextFindingId(existing: { id: string }[]): string {
  const max = existing.reduce((m, f) => {
    const n = Number(f.id.replace(/^CP-/, ''));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 100);
  return `CP-${max + 1}`;
}

/**
 * Deterministic note structuring. It only rearranges what the user wrote:
 * it never invents steps, outcomes or evidence.
 */
export function draftFromNotes(notes: string): { title?: string; steps?: string; leftover: string[] } {
  const lines = notes
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
  if (!lines.length) return { leftover: [] };
  const [first, ...rest] = lines;
  const title = first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
  const stepLines = rest.filter((l) => !/^(expected|actual)\s*[:-]/i.test(l));
  const leftover = rest.filter((l) => /^(expected|actual)\s*[:-]/i.test(l));
  return {
    title,
    steps: stepLines.length ? stepLines.map((l, i) => `${i + 1}. ${l}`).join('\n') : undefined,
    leftover,
  };
}
