import { SEVERITIES, type ISODate, type Severity } from './types';
import { SEVERITY_LABEL, escapeChat } from './format';
import type { IssueTracker, RemoteTask, TeamMessaging } from '../integrations/types';

export interface StatusMapping {
  open: string[];
  closed: string[];
}

export const DEFAULT_STATUS_MAPPING: StatusMapping = {
  open: ['to do', 'in progress', 'ready for qa', 'reopened'],
  closed: ['done', 'closed', 'won’t fix', 'duplicate'],
};

export const SEVERITY_MAPPING: Record<string, Severity> = {
  urgent: 'critical',
  critical: 'critical',
  high: 'high',
  normal: 'medium',
  medium: 'medium',
  low: 'low',
};

export interface FetchResult {
  complete: boolean;
  fetchedAt: ISODate;
  pages: number;
  items: RemoteTask[];
  duplicatesRemoved: number;
  error?: string;
}

/** Fetches every page and de-duplicates by stable external ID. */
export async function fetchAllTasks(tracker: IssueTracker, projectKey: string | undefined, now: () => ISODate): Promise<FetchResult> {
  const seen = new Map<string, RemoteTask>();
  let cursor: string | undefined;
  let pages = 0;
  let raw = 0;
  try {
    do {
      const page = await tracker.listTasks({ projectKey, cursor });
      pages += 1;
      raw += page.items.length;
      for (const t of page.items) seen.set(t.externalId, t);
      cursor = page.nextCursor;
    } while (cursor);
  } catch (err) {
    return { complete: false, fetchedAt: now(), pages, items: [...seen.values()], duplicatesRemoved: raw - seen.size, error: (err as Error).message };
  }
  return { complete: true, fetchedAt: now(), pages, items: [...seen.values()], duplicatesRemoved: raw - seen.size };
}

export interface Digest {
  groups: Record<Severity, RemoteTask[]>;
  unmapped: { task: RemoteTask; reason: string }[];
  total: number;
  excludedClosed: number;
}

export function buildDigest(items: RemoteTask[], mapping: StatusMapping = DEFAULT_STATUS_MAPPING): Digest {
  const groups = Object.fromEntries(SEVERITIES.map((s) => [s, [] as RemoteTask[]])) as Record<Severity, RemoteTask[]>;
  const unmapped: Digest['unmapped'] = [];
  let excludedClosed = 0;
  for (const t of items) {
    const status = t.status.toLowerCase();
    if (mapping.closed.includes(status)) {
      excludedClosed += 1;
      continue;
    }
    if (!mapping.open.includes(status)) {
      unmapped.push({ task: t, reason: `Status “${t.status}” is not mapped` });
      continue;
    }
    const sev = SEVERITY_MAPPING[t.severity.toLowerCase()];
    if (!sev) {
      unmapped.push({ task: t, reason: `Severity “${t.severity}” is not mapped` });
      continue;
    }
    groups[sev].push(t);
  }
  for (const s of SEVERITIES) groups[s].sort((a, b) => a.externalId.localeCompare(b.externalId));
  const total = SEVERITIES.reduce((n, s) => n + groups[s].length, 0);
  return { groups, unmapped, total, excludedClosed };
}

export function digestParent(d: Digest, scopeLabel: string, fetchedAt: string): string {
  const counts = SEVERITIES.map((s) => `${SEVERITY_LABEL[s]} ${d.groups[s].length}`).join(' · ');
  return [`*Open bug digest · ${escapeChat(scopeLabel)}*`, `${d.total} open bugs: ${counts}`, `Data fetched ${fetchedAt}. Details in thread.`].join('\n');
}

/** Splits each severity group into replies that stay under the provider limit. */
export function digestReplies(d: Digest, limit: number): string[] {
  const out: string[] = [];
  for (const s of SEVERITIES) {
    const items = d.groups[s];
    if (!items.length) continue;
    const header = `*${SEVERITY_LABEL[s]} (${items.length})*`;
    let current = header;
    let part = 1;
    for (const t of items) {
      const line = `• <${t.url}|${t.externalId}> ${escapeChat(t.title)}`;
      if (current.length + 1 + line.length > limit) {
        out.push(current);
        part += 1;
        current = `*${SEVERITY_LABEL[s]} (${items.length}) · part ${part}*`;
      }
      current += `\n${line}`;
    }
    out.push(current);
  }
  return out;
}

export interface LedgerEntry {
  index: number;
  role: 'parent' | 'reply';
  text: string;
  status: 'pending' | 'sent' | 'failed';
  ts?: string;
  error?: string;
}

export interface DigestLedger {
  id: string;
  channel: string;
  scopeLabel: string;
  fetchedAt: ISODate;
  createdAt: ISODate;
  entries: LedgerEntry[];
}

export function createLedger(id: string, channel: string, scopeLabel: string, fetchedAt: ISODate, parent: string, replies: string[], at: ISODate): DigestLedger {
  return {
    id,
    channel,
    scopeLabel,
    fetchedAt,
    createdAt: at,
    entries: [
      { index: 0, role: 'parent', text: parent, status: 'pending' },
      ...replies.map((text, i) => ({ index: i + 1, role: 'reply' as const, text, status: 'pending' as const })),
    ],
  };
}

/**
 * Sends unsent entries in order and stops at the first failure. Calling it
 * again resumes: entries already marked sent are never posted twice.
 */
export async function sendLedger(ledger: DigestLedger, messaging: TeamMessaging): Promise<DigestLedger> {
  const entries = ledger.entries.map((e) => ({ ...e }));
  for (const e of entries) {
    if (e.status === 'sent') continue;
    const parentTs = entries[0].ts;
    if (e.role === 'reply' && !parentTs) break;
    try {
      const res = await messaging.post({
        channel: ledger.channel,
        text: e.text,
        threadTs: e.role === 'reply' ? parentTs : undefined,
        dedupeKey: `${ledger.id}:${e.index}`,
      });
      e.status = 'sent';
      e.ts = res.ts;
      e.error = undefined;
    } catch (err) {
      e.status = 'failed';
      e.error = (err as Error).message;
      break;
    }
  }
  return { ...ledger, entries };
}

export const ledgerDone = (l: DigestLedger) => l.entries.every((e) => e.status === 'sent');
