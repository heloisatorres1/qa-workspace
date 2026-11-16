import type { ResultCounts, ResultValue, Run, RunCaseSnapshot } from './types';

export const emptyCounts = (): ResultCounts => ({ passed: 0, failed: 0, blocked: 0, untested: 0, na: 0 });

export function currentResult(snapshot: RunCaseSnapshot): ResultValue {
  const last = snapshot.attempts[snapshot.attempts.length - 1];
  return last ? last.result : 'untested';
}

export function countResults(runs: Run[]): ResultCounts {
  const counts = emptyCounts();
  for (const run of runs) for (const c of run.cases) counts[currentResult(c)] += 1;
  return counts;
}

export interface RunMetrics {
  applicable: number;
  executed: number;
  /** null when there are no applicable cases */
  passRate: number | null;
  executionRate: number | null;
}

/**
 * pass rate      = passed / applicable
 * execution rate = (passed + failed + blocked) / applicable
 * applicable excludes "Not applicable" results.
 */
export function runMetrics(c: ResultCounts): RunMetrics {
  const applicable = c.passed + c.failed + c.blocked + c.untested;
  const executed = c.passed + c.failed + c.blocked;
  if (applicable === 0) return { applicable, executed, passRate: null, executionRate: null };
  return { applicable, executed, passRate: c.passed / applicable, executionRate: executed / applicable };
}

export function formatPercent(value: number | null): string {
  if (value === null) return 'No applicable cases';
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}
