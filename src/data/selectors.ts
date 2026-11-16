import type { AppState } from './state';
import type { Finding, ID, Run } from '../domain/types';

export const personName = (s: AppState, id?: ID) => (id ? s.people.find((p) => p.id === id)?.name ?? 'Unknown' : 'Unassigned');
export const projectName = (s: AppState, id?: ID | 'all') => (id === 'all' ? 'All projects' : s.projects.find((p) => p.id === id)?.name ?? '—');
export const buildOf = (s: AppState, id?: ID) => s.builds.find((b) => b.id === id);
export const buildLabel = (s: AppState, id?: ID) => {
  const b = buildOf(s, id);
  return b ? `${b.version}${b.label ? ` (${b.label})` : ''}` : 'No build';
};

export const inScope = (s: AppState, item: { projectId: ID | 'all' }) => s.ui.projectId === 'all' || item.projectId === 'all' || item.projectId === s.ui.projectId;

export function scopedFindings(s: AppState): Finding[] {
  return s.findings.filter((f) => inScope(s, f));
}

export function scopedRuns(s: AppState): Run[] {
  return s.runs.filter((r) => inScope(s, r));
}

export function currentRelease(s: AppState) {
  const pid = s.ui.projectId === 'all' ? s.projects[0].id : s.ui.projectId;
  const forBuild = s.releases.find((r) => r.projectId === pid && r.buildId === s.ui.buildId);
  if (forBuild) return forBuild;
  const builds = s.builds.filter((b) => b.projectId === pid).map((b) => b.id);
  return s.releases.filter((r) => builds.includes(r.buildId)).sort((a, b) => builds.indexOf(b.buildId) - builds.indexOf(a.buildId))[0];
}

export const jobsForFinding = (s: AppState, id: ID) =>
  s.jobs.filter((j) => (j.payload.kind === 'tracker.create' ? j.payload.findingId === id : j.payload.findingId === id));
