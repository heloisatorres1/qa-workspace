import { config, resetDemo, retryJob, setFaults, submitFinding } from '../src/data/actions';
import { createStore, setActiveStore, store, type CaptureDraft } from '../src/data/state';
import { seed } from '../src/data/fixtures';

const bug = (title: string): CaptureDraft => ({
  type: 'bug',
  fields: { type: 'bug', projectId: 'og', title, severity: 'high', priority: 'P2', steps: '1. Open', expected: 'Opens', actual: 'Closes' },
  destinations: { tracker: true, messaging: false },
  postInThread: false,
});

const settled = async () => {
  for (let i = 0; i < 50 && store().get().jobs.some((j) => j.status === 'pending'); i++) await new Promise((r) => setTimeout(r, 5));
};

beforeEach(() => {
  config.deliveryDelayMs = 0;
  setActiveStore(createStore(seed(new Date('2026-11-16T12:00:00Z'))));
});

describe('delivery actions', () => {
  it('reconciles an uncertain ticket once even when Retry is pressed twice', async () => {
    setFaults({ trackerTimeoutNext: 1 });
    const res = submitFinding(bug('Double retry'));
    await settled();
    const id = res.jobIds[0];
    expect(store().get().jobs.find((j) => j.id === id)!.status).toBe('unknown');

    await Promise.all([retryJob(id), retryJob(id)]);
    const job = store().get().jobs.find((j) => j.id === id)!;
    expect(job.status).toBe('delivered');
    expect(job.attempts.map((a) => a.outcome)).toEqual(['timeout', 'reconciled']);
    expect(store().get().remote.tasks.filter((t) => t.findingId === res.finding!.id)).toHaveLength(1);
    expect(store().get().events.filter((e) => e.detail?.startsWith('Found the earlier request'))).toHaveLength(1);
  });

  it('does not let a delivery queued before a reset touch the fresh demo data', async () => {
    config.deliveryDelayMs = 20;
    submitFinding(bug('Queued then reset'));
    const before = store().get().remote.tasks.length;
    resetDemo();
    await new Promise((r) => setTimeout(r, 80));
    expect(store().get().remote.tasks).toHaveLength(before);
    expect(store().get().events.some((e) => e.kind === 'delivery' && e.at >= store().get().seededAt)).toBe(false);
  });
});
