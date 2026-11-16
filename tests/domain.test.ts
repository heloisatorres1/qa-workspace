import { describe, expect, it } from 'vitest';
import { formatPercent, runMetrics, countResults } from '../src/domain/metrics';
import { completeRun, createRun, recordResult, reviseCase, latestRevision } from '../src/domain/runs';
import { draftFromNotes, validateForSubmit, answerQuestion, questionToBugDraft } from '../src/domain/findings';
import { escapeChat } from '../src/domain/format';
import { captureEvidence, validateDecision, saveRevision, releaseMessage } from '../src/domain/release';
import { seed } from '../src/data/fixtures';
import type { Finding, TestCase } from '../src/domain/types';

const at = '2026-01-01T10:00:00.000Z';

describe('release metrics', () => {
  it('matches the documented example', () => {
    const m = runMetrics({ passed: 42, failed: 3, blocked: 2, untested: 5, na: 0 });
    expect(m.applicable).toBe(52);
    expect(formatPercent(m.passRate)).toBe('80.8%');
    expect(formatPercent(m.executionRate)).toBe('90.4%');
  });

  it('excludes not-applicable results from the denominator', () => {
    const m = runMetrics({ passed: 8, failed: 0, blocked: 0, untested: 2, na: 5 });
    expect(m.applicable).toBe(10);
    expect(m.passRate).toBeCloseTo(0.8);
  });

  it('reports a zero denominator in words', () => {
    const m = runMetrics({ passed: 0, failed: 0, blocked: 0, untested: 0, na: 3 });
    expect(formatPercent(m.passRate)).toBe('No applicable cases');
  });

  it('demo fixtures reproduce the 42/3/2/5 release evidence', () => {
    const s = seed(new Date(at));
    const rel = s.releases.find((r) => r.id === 'rel-084')!;
    const counts = countResults(s.runs.filter((r) => rel.runIds.includes(r.id)));
    expect(counts).toEqual({ passed: 42, failed: 3, blocked: 2, untested: 5, na: 0 });
  });
});

const tc = (): TestCase => ({
  id: 'c1',
  projectId: 'p',
  suiteId: 's',
  revisions: [{ rev: 1, title: 'Old title', preconditions: '', steps: [{ action: 'a', expected: 'b' }], priority: 'P2', tags: [], editedAt: at, editedBy: 'u' }],
});

describe('test runs', () => {
  it('editing a case does not rewrite an existing run snapshot', () => {
    const original = tc();
    const run = createRun({ id: 'r', name: 'R', projectId: 'p', buildId: 'b', platforms: ['PC'], assigneeIds: [], cases: [original], at });
    const edited = reviseCase(original, { title: 'New title', preconditions: 'x', steps: [{ action: 'changed', expected: 'changed' }], priority: 'P1', tags: [] }, 'u', at);
    expect(latestRevision(edited).rev).toBe(2);
    expect(run.cases[0].revision.title).toBe('Old title');
    expect(run.cases[0].revision.steps[0].action).toBe('a');
    // mutate the source object to prove the snapshot is a copy
    original.revisions[0].steps[0].action = 'mutated';
    expect(run.cases[0].revision.steps[0].action).toBe('a');
  });

  it('keeps result history across retests', () => {
    let run = createRun({ id: 'r', name: 'R', projectId: 'p', buildId: 'b', platforms: ['PC'], assigneeIds: [], cases: [tc()], at });
    run = recordResult(run, 'c1', { result: 'failed', notes: 'broken', evidence: '', testerId: 'u', at, findingIds: ['CP-1'] });
    run = recordResult(run, 'c1', { result: 'passed', notes: 'fixed', evidence: '', testerId: 'u', at, findingIds: [] });
    expect(run.cases[0].attempts.map((a) => a.result)).toEqual(['failed', 'passed']);
    expect(countResults([run]).passed).toBe(1);
  });

  it('requires a reason to complete a run with untested cases', () => {
    const run = createRun({ id: 'r', name: 'R', projectId: 'p', buildId: 'b', platforms: ['PC'], assigneeIds: [], cases: [tc()], at });
    expect(() => completeRun(run, at)).toThrow(/still untested/);
    const done = completeRun(run, at, { reason: 'Device lab unavailable' });
    expect(done.incompleteAck).toEqual({ reason: 'Device lab unavailable', remaining: 1 });
    expect(countResults([done]).untested).toBe(1); // nothing silently marked passed
  });

  it('refuses results on a completed run', () => {
    const run = completeRun(createRun({ id: 'r', name: 'R', projectId: 'p', buildId: 'b', platforms: ['PC'], assigneeIds: [], cases: [], at }), at);
    expect(() => recordResult(run, 'c1', { result: 'passed', notes: '', evidence: '', testerId: 'u', at, findingIds: [] })).toThrow();
  });
});

describe('findings', () => {
  it('explains missing bug fields', () => {
    const e = validateForSubmit({ type: 'bug', title: ' ' });
    expect(Object.keys(e).sort()).toEqual(['actual', 'expected', 'priority', 'projectId', 'severity', 'steps', 'title']);
  });

  it('questions need a question and an owner, not reproduction steps', () => {
    expect(validateForSubmit({ type: 'question', title: 'Q', projectId: 'p', question: 'Why?', ownerId: 'u' })).toEqual({});
  });

  it('answering a question does not turn it into a bug', () => {
    const q = { id: 'CP-1', type: 'question', projectId: 'p', title: 'Q', question: '?', status: 'open', reporterId: 'u', createdAt: at, updatedAt: at } as Finding;
    const a = answerQuestion(q, 'Yes', at);
    expect(a.type).toBe('question');
    expect(a.answer).toBe('Yes');
    const bug = questionToBugDraft(q, 'CP-2', at);
    expect(bug).toMatchObject({ type: 'bug', status: 'draft', convertedFromId: 'CP-1' });
  });

  it('note drafting only reuses what was written', () => {
    const d = draftFromNotes('Inventory closes after reconnect\n- open a save\n- go offline\nExpected: stays open');
    expect(d.title).toBe('Inventory closes after reconnect');
    expect(d.steps).toBe('1. open a save\n2. go offline');
    expect(d.leftover).toEqual(['Expected: stays open']);
    expect(draftFromNotes('   ')).toEqual({ leftover: [] });
  });

  it('neutralises broadcast mentions and markup in chat text', () => {
    expect(escapeChat('<!channel> @here & @everyone')).toBe('&lt;!channel&gt; @​here &amp; @​everyone');
  });
});

describe('release decisions', () => {
  const s = seed(new Date(at));
  const rel = s.releases.find((r) => r.id === 'rel-084')!;
  const evidence = captureEvidence(s.runs.filter((r) => rel.runIds.includes(r.id)), s.findings, 'og', at);

  it('counts open bugs by severity and lists critical blockers', () => {
    expect(evidence.openBySeverity).toEqual({ critical: 2, high: 5, medium: 10, low: 7 });
    expect(evidence.blockers.map((b) => b.id)).toEqual(['CP-104', 'CP-109']);
  });

  it('never approves implicitly', () => {
    const errs = validateDecision({ checklist: { smokeLinked: true, blockersReviewed: true, risksAccepted: true }, rationale: 'x', risks: [] }, evidence);
    expect(errs[0]).toMatch(/Nothing is approved automatically/);
  });

  it('blocks "Ready" while critical bugs are open, and requires owners for accepted risks', () => {
    const ready = validateDecision({ recommendation: 'ready', checklist: { smokeLinked: true, blockersReviewed: true, risksAccepted: false }, rationale: 'ok', risks: [] }, evidence);
    expect(ready.join(' ')).toMatch(/critical bugs are unresolved/);
    const risky = validateDecision(
      { recommendation: 'ready_with_risks', checklist: { smokeLinked: true, blockersReviewed: true, risksAccepted: true }, rationale: 'ok', risks: [{ findingId: 'CP-104', rationale: '', ownerId: '' }] },
      evidence,
    );
    expect(risky.join(' ')).toMatch(/needs a rationale and an owner/);
  });

  it('saved revisions are frozen copies', () => {
    const msg = releaseMessage({ recommendation: 'hold', projectName: 'Orbit Garden', buildLabel: '0.8.4', evidence, rationale: 'Reconnect issue remains unresolved.', risks: [] });
    expect(msg).toContain('HOLD · Orbit Garden 0.8.4');
    expect(msg).toContain('42 / 52 passed (80.8% pass rate, 90.4% executed)');
    const saved = saveRevision(rel, { authorId: 'u', evidence, recommendation: 'hold', checklist: { smokeLinked: true, blockersReviewed: true, risksAccepted: false }, rationale: 'r', risks: [], message: msg, channel: '#c' }, at);
    evidence.counts.passed = 0;
    expect(saved.revisions[0].evidence.counts.passed).toBe(42);
    const again = saveRevision(saved, { ...saved.revisions[0] }, at);
    expect(again.revisions.map((r) => r.rev)).toEqual([1, 2]);
  });
});
