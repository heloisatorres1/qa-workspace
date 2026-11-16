import { countResults, currentResult, runMetrics } from './metrics';
import type { CaseRevision, ID, ISODate, Platform, ResultAttempt, Run, TestCase } from './types';

export function latestRevision(tc: TestCase): CaseRevision {
  return tc.revisions[tc.revisions.length - 1];
}

/** Editing a case appends a revision; runs keep the revision they snapshotted. */
export function reviseCase(tc: TestCase, changes: Omit<CaseRevision, 'rev' | 'editedAt' | 'editedBy'>, by: ID, at: ISODate): TestCase {
  const next: CaseRevision = { ...structuredClone(changes), rev: latestRevision(tc).rev + 1, editedAt: at, editedBy: by };
  return { ...tc, revisions: [...tc.revisions, next] };
}

export interface NewRunInput {
  id: ID;
  name: string;
  projectId: ID;
  buildId: ID;
  platforms: Platform[];
  assigneeIds: ID[];
  cases: TestCase[];
  at: ISODate;
}

export function createRun(input: NewRunInput): Run {
  return {
    id: input.id,
    name: input.name,
    projectId: input.projectId,
    buildId: input.buildId,
    platforms: [...input.platforms],
    assigneeIds: [...input.assigneeIds],
    createdAt: input.at,
    status: 'active',
    cases: input.cases.map((tc, i) => ({
      caseId: tc.id,
      suiteId: tc.suiteId,
      // deep copy so later case edits can never reach into the run
      revision: structuredClone(latestRevision(tc)),
      assigneeId: input.assigneeIds.length ? input.assigneeIds[i % input.assigneeIds.length] : undefined,
      attempts: [],
    })),
  };
}

/** Results are append-only: a retest adds an attempt and keeps the history. */
export function recordResult(run: Run, caseId: ID, attempt: ResultAttempt): Run {
  if (run.status === 'completed') throw new Error('This run is completed. Start a new run to record more results.');
  return {
    ...run,
    cases: run.cases.map((c) => (c.caseId === caseId ? { ...c, attempts: [...c.attempts, attempt] } : c)),
  };
}

export function remainingWork(run: Run): number {
  return run.cases.filter((c) => currentResult(c) === 'untested').length;
}

export function completeRun(run: Run, at: ISODate, ack?: { reason: string }): Run {
  const remaining = remainingWork(run);
  if (remaining > 0 && !ack?.reason.trim()) {
    throw new Error(`${remaining} case${remaining === 1 ? ' is' : 's are'} still untested. Give a reason to complete the run anyway.`);
  }
  return {
    ...run,
    status: 'completed',
    completedAt: at,
    incompleteAck: remaining > 0 ? { reason: ack!.reason.trim(), remaining } : undefined,
  };
}

export function runProgress(run: Run) {
  const counts = countResults([run]);
  const m = runMetrics(counts);
  return { counts, ...m, total: run.cases.length };
}
