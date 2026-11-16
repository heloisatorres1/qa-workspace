import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockAdapters, memoryRemote, MESSAGE_LIMIT } from '../src/integrations/mock';
import { newJob, processJob } from '../src/integrations/outbox';
import { buildDigest, createLedger, digestReplies, fetchAllTasks, sendLedger, ledgerDone } from '../src/domain/digest';
import type { Finding } from '../src/domain/types';
import type { RemoteTask } from '../src/integrations/types';

const at = '2026-01-01T10:00:00.000Z';
const bug: Finding = {
  id: 'CP-500', type: 'bug', projectId: 'og', title: 'Inventory closes after reconnect', status: 'open', reporterId: 'u', createdAt: at, updatedAt: at,
  steps: '1. a', expected: 'b', actual: 'c', severity: 'high', priority: 'P2',
};
const ctx = (remote: ReturnType<typeof memoryRemote>) => ({
  adapters: createMockAdapters(remote, () => new Date(at)),
  findFinding: (id: string) => (id === bug.id ? bug : undefined),
  projectKey: () => 'OG',
  now: () => at,
});

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new Error('network not allowed')));
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled(); // mock delivery never touches the network
  vi.unstubAllGlobals();
});

describe('delivery outbox', () => {
  it('a chat failure after ticket success retries only the chat job', async () => {
    const remote = memoryRemote();
    remote.state.faults.messagingFailNext = 1;
    const ticket = await processJob(newJob('j1', 'finding:CP-500:tracker', { kind: 'tracker.create', findingId: 'CP-500', list: 'Bugs' }, at), ctx(remote));
    let chat = await processJob(newJob('j2', 'finding:CP-500:chat', { kind: 'messaging.post', channel: '#qa', text: 'hi' }, at), ctx(remote));
    expect(ticket.status).toBe('delivered');
    expect(chat.status).toBe('failed');

    chat = await processJob({ ...chat, status: 'pending' }, ctx(remote));
    expect(chat.status).toBe('delivered');
    expect(chat.attempts.map((a) => a.outcome)).toEqual(['failed', 'delivered']);
    expect(remote.state.tasks).toHaveLength(1);
    expect(remote.state.messages).toHaveLength(1);
  });

  it('an ambiguous timeout reconciles instead of creating a duplicate', async () => {
    const remote = memoryRemote();
    remote.state.faults.trackerTimeoutNext = 1;
    let job = await processJob(newJob('j1', 'finding:CP-500:tracker', { kind: 'tracker.create', findingId: 'CP-500', list: 'Bugs' }, at), ctx(remote));
    expect(job.status).toBe('unknown');
    expect(remote.state.tasks).toHaveLength(1); // it did land remotely

    job = await processJob(job, ctx(remote));
    expect(job.status).toBe('delivered');
    expect(job.attempts.map((a) => a.outcome)).toEqual(['timeout', 'reconciled']);
    expect(remote.state.tasks).toHaveLength(1);
  });

  it('an uncertain job that never landed is created on retry', async () => {
    const remote = memoryRemote();
    const job = { ...newJob('j1', 'k-new', { kind: 'tracker.create' as const, findingId: 'CP-500', list: 'Bugs' }, at), status: 'unknown' as const };
    const done = await processJob(job, ctx(remote));
    expect(done.status).toBe('delivered');
    expect(remote.state.tasks).toHaveLength(1);
  });
});

const task = (n: number, status: string, severity: string): RemoteTask => ({
  externalId: `T-${String(n).padStart(3, '0')}`, projectKey: 'OG', list: 'Bugs', title: `Bug ${n}`, status, severity, url: `https://tracker.example.com/t/${n}`, updatedAt: at,
});

describe('bug digest', () => {
  const severities = ['urgent', 'high', 'normal', 'low'];
  const tasks = Array.from({ length: 30 }, (_, i) => task(i, i % 7 === 0 ? 'done' : 'to do', severities[i % 4]));
  tasks.push(task(99, 'needs info', 'high'));

  it('fetches every page, removes overlap duplicates and excludes closed bugs', async () => {
    const remote = memoryRemote({ tasks });
    const res = await fetchAllTasks(createMockAdapters(remote).tracker, 'OG', () => at);
    expect(res.complete).toBe(true);
    expect(res.pages).toBeGreaterThan(3);
    expect(res.duplicatesRemoved).toBeGreaterThan(0);
    expect(res.items).toHaveLength(31);

    const d = buildDigest(res.items);
    const closed = tasks.filter((t) => t.status === 'done').length;
    expect(d.excludedClosed).toBe(closed);
    expect(d.unmapped.map((u) => u.task.externalId)).toEqual(['T-099']);
    const grouped = Object.values(d.groups).reduce((n, g) => n + g.length, 0);
    expect(grouped).toBe(d.total);
    expect(d.total).toBe(31 - closed - 1);
  });

  it('reports a partial fetch instead of a complete digest', async () => {
    const remote = memoryRemote({ tasks });
    remote.state.faults.listFailPage = 2;
    const res = await fetchAllTasks(createMockAdapters(remote).tracker, 'OG', () => at);
    expect(res.complete).toBe(false);
    expect(res.error).toMatch(/page 2/);
  });

  it('splits replies under the provider limit', () => {
    const many = Array.from({ length: 300 }, (_, i) => task(i, 'to do', 'normal'));
    const replies = digestReplies(buildDigest(many), MESSAGE_LIMIT);
    expect(replies.length).toBeGreaterThan(1);
    for (const r of replies) expect(r.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
    expect(replies.join('\n').match(/T-\d+/g)!.length).toBe(300);
  });

  it('resumes a partially sent digest without reposting sent messages', async () => {
    const remote = memoryRemote();
    const messaging = createMockAdapters(remote).messaging;
    let ledger = createLedger('d1', '#qa', 'Orbit Garden', at, 'parent', ['r1', 'r2', 'r3'], at);
    // parent + r1 succeed, r2 fails
    const realPost = messaging.post.bind(messaging);
    let calls = 0;
    messaging.post = async (input) => {
      calls += 1;
      if (calls === 3) remote.state.faults.messagingFailNext = 1;
      return realPost(input);
    };
    ledger = await sendLedger(ledger, messaging);
    expect(ledger.entries.map((e) => e.status)).toEqual(['sent', 'sent', 'failed', 'pending']);
    expect(remote.state.messages).toHaveLength(2);

    ledger = await sendLedger(ledger, messaging);
    expect(ledgerDone(ledger)).toBe(true);
    expect(remote.state.messages).toHaveLength(4);
    expect(remote.state.messages.slice(1).every((m) => m.threadTs === ledger.entries[0].ts)).toBe(true);
  });
});
