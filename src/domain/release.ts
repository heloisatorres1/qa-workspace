import { countResults, formatPercent, runMetrics } from './metrics';
import { isOpen } from './findings';
import { SEVERITY_LABEL, escapeChat } from './format';
import {
  SEVERITIES,
  type DecisionChecklist,
  type EvidenceSnapshot,
  type Finding,
  type ID,
  type ISODate,
  type Recommendation,
  type Release,
  type ReleaseDecisionRevision,
  type RiskAcceptance,
  type Run,
  type Severity,
} from './types';

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  ready: 'Ready',
  ready_with_risks: 'Ready with accepted risks',
  hold: 'Hold',
};

/** Blockers are open Critical bugs on the release's project. */
export function captureEvidence(runs: Run[], findings: Finding[], projectId: ID, at: ISODate): EvidenceSnapshot {
  const bugs = findings.filter((f) => f.type === 'bug' && f.projectId === projectId && isOpen(f) && !f.duplicateOf);
  const openBySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const b of bugs) if (b.severity) openBySeverity[b.severity] += 1;
  const synced = bugs.map((b) => b.external?.syncedAt).filter(Boolean).sort() as string[];
  return structuredClone({
    capturedAt: at,
    runIds: runs.map((r) => r.id),
    runSources: runs.map((r) => ({ runId: r.id, name: r.name, capturedAt: at })),
    counts: countResults(runs),
    openBySeverity,
    blockers: bugs.filter((b) => b.severity === 'critical').map((b) => ({ id: b.id, title: b.title, severity: 'critical' as const })),
    bugsSyncedAt: synced[0],
  });
}

export interface DecisionDraft {
  recommendation?: Recommendation;
  checklist: DecisionChecklist;
  rationale: string;
  risks: RiskAcceptance[];
}

export function validateDecision(d: DecisionDraft, evidence: EvidenceSnapshot): string[] {
  const errors: string[] = [];
  if (!d.recommendation) errors.push('Choose a QA recommendation. Nothing is approved automatically.');
  if (!d.rationale.trim()) errors.push('Add a rationale so the decision can be understood later.');
  if (d.recommendation === 'ready_with_risks') {
    if (!d.risks.length) errors.push('List at least one accepted risk, or choose a different recommendation.');
    for (const r of d.risks) {
      if (!r.rationale.trim() || !r.ownerId) errors.push(`Accepted risk ${r.findingId} needs a rationale and an owner.`);
    }
    if (!d.checklist.risksAccepted) errors.push('Confirm that the accepted risks are documented.');
  }
  if (d.recommendation === 'ready' && evidence.blockers.length) {
    errors.push(`${evidence.blockers.length} critical bug${evidence.blockers.length > 1 ? 's are' : ' is'} unresolved. “Ready” is not available; accept the risks or hold.`);
  }
  if (d.recommendation && d.recommendation !== 'hold' && !d.checklist.blockersReviewed) errors.push('Review blockers before recommending a release.');
  return errors;
}

export function releaseMessage(opts: {
  recommendation: Recommendation;
  projectName: string;
  buildLabel: string;
  evidence: EvidenceSnapshot;
  rationale: string;
  risks: RiskAcceptance[];
}): string {
  const { evidence: e } = opts;
  const m = runMetrics(e.counts);
  const open = SEVERITIES.map((s) => `${e.openBySeverity[s]} ${SEVERITY_LABEL[s].toLowerCase()}`).join(', ');
  const lines = [`*${RECOMMENDATION_LABEL[opts.recommendation].toUpperCase()} · ${escapeChat(opts.projectName)} ${escapeChat(opts.buildLabel)}*`];
  lines.push(`QA recommendation: ${RECOMMENDATION_LABEL[opts.recommendation]}. ${escapeChat(opts.rationale.trim())}`);
  if (e.blockers.length) lines.push(`Blockers: ${e.blockers.map((b) => b.id).join(', ')}`);
  if (opts.risks.length) lines.push(`Accepted risks: ${opts.risks.map((r) => r.findingId).join(', ')}`);
  lines.push(`• Result: ${e.counts.passed} / ${m.applicable} passed (${formatPercent(m.passRate)} pass rate, ${formatPercent(m.executionRate)} executed)`);
  lines.push(`• Open risks: ${open}`);
  lines.push(`• Evidence captured ${e.capturedAt.slice(0, 16).replace('T', ' ')} UTC`);
  lines.push('This is the QA recommendation only; release authorization is separate.');
  return lines.join('\n');
}

export function saveRevision(
  release: Release,
  input: Omit<ReleaseDecisionRevision, 'rev' | 'savedAt' | 'sentJobId'>,
  at: ISODate,
): Release {
  const rev = (release.revisions[release.revisions.length - 1]?.rev ?? 0) + 1;
  const revision: ReleaseDecisionRevision = structuredClone({ ...input, rev, savedAt: at });
  return { ...release, revisions: [...release.revisions, revision] };
}

/** True when live data no longer matches the saved snapshot. */
export function evidenceChanged(saved: EvidenceSnapshot, live: EvidenceSnapshot): boolean {
  const a = { c: saved.counts, o: saved.openBySeverity, b: saved.blockers.map((x) => x.id), r: saved.runIds };
  const b = { c: live.counts, o: live.openBySeverity, b: live.blockers.map((x) => x.id), r: live.runIds };
  return JSON.stringify(a) !== JSON.stringify(b);
}
