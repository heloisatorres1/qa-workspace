import { DeliveryError, type Adapters, type IssueTracker, type RemoteTask, type TeamMessaging } from './types';

/**
 * In-memory stand-ins for the issue tracker and team chat. They never touch
 * the network. Their state is plain data so the demo can persist it and so
 * tests can inspect exactly what "reached" each provider.
 */

export interface RemoteMessage {
  ts: string;
  channel: string;
  text: string;
  threadTs?: string;
  dedupeKey: string;
}

export interface Faults {
  /** Fail the next N chat posts. */
  messagingFailNext: number;
  /** The next N task creations succeed remotely but report a timeout. */
  trackerTimeoutNext: number;
  /** Fail the next N task creations outright. */
  trackerFailNext: number;
  /** Fail the next listing request for this page number (1-based). */
  listFailPage: number | null;
}

export interface MockRemote {
  seq: number;
  tasks: RemoteTask[];
  messages: RemoteMessage[];
  faults: Faults;
}

export const noFaults = (): Faults => ({ messagingFailNext: 0, trackerTimeoutNext: 0, trackerFailNext: 0, listFailPage: null });

export interface RemoteAccess {
  get(): MockRemote;
  set(next: MockRemote): void;
}

export const TRACKER_PAGE_SIZE = 8;
export const MESSAGE_LIMIT = 3000;

export function createMockAdapters(access: RemoteAccess, now: () => Date = () => new Date()): Adapters {
  const tracker: IssueTracker = {
    name: 'Mock tracker',
    async createTask(input) {
      const r = access.get();
      if (r.faults.trackerFailNext > 0) {
        access.set({ ...r, faults: { ...r.faults, trackerFailNext: r.faults.trackerFailNext - 1 } });
        throw new DeliveryError('Tracker rejected the request (simulated 500).', 'failed');
      }
      const existing = r.tasks.find((t) => t.dedupeKey === input.dedupeKey);
      if (existing) return { externalId: existing.externalId, url: existing.url };
      const seq = r.seq + 1;
      const externalId = `TSK-${4000 + seq}`;
      const task: RemoteTask = {
        externalId,
        dedupeKey: input.dedupeKey,
        projectKey: input.projectKey,
        list: input.list,
        title: input.title,
        status: 'to do',
        severity: input.severity ?? 'none',
        url: `https://tracker.example.com/t/${externalId}`,
        updatedAt: now().toISOString(),
        findingId: input.findingId,
      };
      const timeout = r.faults.trackerTimeoutNext > 0;
      access.set({
        ...r,
        seq,
        tasks: [...r.tasks, task],
        faults: timeout ? { ...r.faults, trackerTimeoutNext: r.faults.trackerTimeoutNext - 1 } : r.faults,
      });
      if (timeout) throw new DeliveryError('No response from tracker after 10s (simulated). The task may exist.', 'timeout');
      return { externalId, url: task.url };
    },
    async findByDedupeKey(key) {
      const t = access.get().tasks.find((x) => x.dedupeKey === key);
      return t ? { externalId: t.externalId, url: t.url } : null;
    },
    async listTasks({ projectKey, cursor }) {
      const r = access.get();
      const page = cursor ? Number(cursor) : 1;
      if (r.faults.listFailPage === page) {
        access.set({ ...r, faults: { ...r.faults, listFailPage: null } });
        throw new DeliveryError(`Listing page ${page} failed (simulated 503).`, 'failed');
      }
      const all = r.tasks.filter((t) => !projectKey || t.projectKey === projectKey);
      // Pages overlap by one item, like offset paging over a list that changed
      // between requests. Consumers must de-duplicate by external ID.
      const start = Math.max(0, (page - 1) * TRACKER_PAGE_SIZE - (page > 1 ? 1 : 0));
      const end = page * TRACKER_PAGE_SIZE;
      const items = all.slice(start, end);
      return { items, nextCursor: end < all.length ? String(page + 1) : undefined };
    },
  };

  const messaging: TeamMessaging = {
    name: 'Mock chat',
    maxMessageChars: MESSAGE_LIMIT,
    async post(input) {
      const r = access.get();
      if (r.faults.messagingFailNext > 0) {
        access.set({ ...r, faults: { ...r.faults, messagingFailNext: r.faults.messagingFailNext - 1 } });
        throw new DeliveryError('Chat rejected the message (simulated outage).', 'failed');
      }
      const prior = r.messages.find((m) => m.dedupeKey === input.dedupeKey);
      if (prior) return { ts: prior.ts };
      if (input.text.length > MESSAGE_LIMIT) throw new DeliveryError(`Message exceeds ${MESSAGE_LIMIT} characters.`, 'failed');
      const seq = r.seq + 1;
      const ts = `${Math.floor(now().getTime() / 1000)}.${String(seq).padStart(6, '0')}`;
      access.set({ ...r, seq, messages: [...r.messages, { ts, ...input }] });
      return { ts };
    },
    async findByDedupeKey(key) {
      const m = access.get().messages.find((x) => x.dedupeKey === key);
      return m ? { ts: m.ts } : null;
    },
  };

  return { tracker, messaging };
}

/** Simple holder for tests and scripts. */
export function memoryRemote(initial?: Partial<MockRemote>): RemoteAccess & { state: MockRemote } {
  const holder = {
    state: { seq: 0, tasks: [], messages: [], faults: noFaults(), ...initial } as MockRemote,
    get() {
      return holder.state;
    },
    set(next: MockRemote) {
      holder.state = next;
    },
  };
  return holder;
}
