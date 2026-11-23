import { store, type AppState, type CaptureDraft } from './state';
import { seed } from './fixtures';
import { createMockAdapters, type Faults } from '../integrations/mock';
import { newJob, processJob } from '../integrations/outbox';
import { answerQuestion as answerQ, nextFindingId, questionToBugDraft, validateForSubmit, type FieldErrors } from '../domain/findings';
import { chatSummary } from '../domain/format';
import { completeRun as completeRunDomain, createRun as createRunDomain, recordResult as recordResultDomain, reviseCase } from '../domain/runs';
import { captureEvidence, releaseMessage, saveRevision, validateDecision, type DecisionDraft } from '../domain/release';
import { buildDigest, createLedger, digestParent, digestReplies, fetchAllTasks, sendLedger, type DigestLedger, type FetchResult } from '../domain/digest';
import type { AuditEvent, CaseRevision, DeliveryJob, Finding, FindingType, ID, Platform, QaTask, ResourceLink, ResultValue, Route, Session, TaskStatus } from '../domain/types';
import { columnOf, moveTask, TASK_STATUS_LABEL, TASK_TYPE_LABEL } from '../domain/tasks';

export const config = { deliveryDelayMs: 700 };

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
let counter = 0;
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

export function adapters() {
  return createMockAdapters({
    get: () => store().get().remote,
    set: (remote) => store().set((s) => ({ ...s, remote })),
  });
}

function update(fn: (s: AppState) => AppState) {
  store().set(fn);
}

function logEvent(e: Omit<AuditEvent, 'id' | 'at' | 'actorId'>) {
  update((s) => ({ ...s, events: [{ id: uid('ev'), at: nowIso(), actorId: s.currentUserId, ...e }, ...s.events].slice(0, 200) }));
}

// ---- Scope ------------------------------------------------------------------

export function setScope(projectId: ID | 'all', buildId: ID | null) {
  update((s) => ({ ...s, ui: { ...s.ui, projectId, buildId } }));
}

// ---- Capture ----------------------------------------------------------------

export function routeFor(s: AppState, projectId: ID | undefined, type: FindingType): Route | undefined {
  return s.routes.find((r) => r.projectId === projectId && r.type === type);
}

export function newCaptureDraft(s: AppState, type: FindingType = 'bug'): CaptureDraft {
  const projectId = s.ui.projectId === 'all' ? s.projects[0].id : s.ui.projectId;
  const buildId = s.ui.buildId && s.builds.find((b) => b.id === s.ui.buildId)?.projectId === projectId ? s.ui.buildId : undefined;
  return {
    type,
    fields: { type, projectId, buildId },
    destinations: { tracker: routeFor(s, projectId, type)?.tracker.enabled ?? false, messaging: routeFor(s, projectId, type)?.messaging.enabled ?? false },
    postInThread: false,
  };
}

export function setCaptureDraft(draft: CaptureDraft | null) {
  update((s) => ({ ...s, ui: { ...s.ui, captureDraft: draft } }));
}

export function saveFindingDraft(draft: CaptureDraft): Finding {
  const s = store().get();
  const at = nowIso();
  const existing = draft.draftId ? s.findings.find((f) => f.id === draft.draftId) : undefined;
  const id = existing?.id ?? nextFindingId(s.findings);
  const record: Finding = {
    ...(existing ?? { createdAt: at, reporterId: s.currentUserId }),
    ...draft.fields,
    id,
    type: draft.type,
    projectId: draft.fields.projectId ?? s.projects[0].id,
    title: draft.fields.title?.trim() || 'Untitled draft',
    status: 'draft',
    updatedAt: at,
  } as Finding;
  update((st) => ({
    ...st,
    findings: existing ? st.findings.map((f) => (f.id === id ? record : f)) : [record, ...st.findings],
    ui: { ...st.ui, captureDraft: { ...draft, draftId: id } },
  }));
  return record;
}

export function openSessionFor(s: AppState, f: Partial<Finding>): Session | undefined {
  return s.sessions.find((x) => x.id === f.sessionId && x.status === 'open');
}

export interface SubmitResult {
  ok: boolean;
  errors: FieldErrors;
  finding?: Finding;
  jobIds: ID[];
}

/** Saves one local record, then enqueues one job per enabled destination. */
export function submitFinding(draft: CaptureDraft): SubmitResult {
  const s = store().get();
  const errors = validateForSubmit({ ...draft.fields, type: draft.type });
  if (draft.fields.sessionId) {
    const ses = s.sessions.find((x) => x.id === draft.fields.sessionId);
    if (ses?.status === 'closed') errors.sessionId = 'This session is closed. Submit as a standalone report or pick an open session.';
  }
  if (Object.keys(errors).length) return { ok: false, errors, jobIds: [] };

  const at = nowIso();
  const id = draft.draftId ?? nextFindingId(s.findings);
  const prior = s.findings.find((f) => f.id === id);
  const finding: Finding = {
    ...(prior ?? {}),
    ...draft.fields,
    id,
    type: draft.type,
    projectId: draft.fields.projectId!,
    title: draft.fields.title!.trim(),
    status: 'open',
    reporterId: prior?.reporterId ?? s.currentUserId,
    createdAt: prior?.createdAt ?? at,
    updatedAt: at,
  } as Finding;

  const route = routeFor(s, finding.projectId, finding.type);
  const project = s.projects.find((p) => p.id === finding.projectId)!;
  const build = s.builds.find((b) => b.id === finding.buildId);
  const jobs: DeliveryJob[] = [];
  if (route?.tracker.enabled && draft.destinations.tracker) {
    jobs.push(newJob(uid('job'), `finding:${id}:tracker`, { kind: 'tracker.create', findingId: id, list: route.tracker.list }, at));
  }
  if (route?.messaging.enabled && draft.destinations.messaging) {
    const session = openSessionFor(s, finding);
    const inThread = draft.postInThread && session?.threadTs;
    jobs.push(
      newJob(
        uid('job'),
        `finding:${id}:chat`,
        {
          kind: 'messaging.post',
          channel: inThread ? session!.channel : route.messaging.channel,
          threadTs: inThread ? session!.threadTs : undefined,
          text: chatSummary(finding, project.name, build?.version),
          findingId: id,
          sessionId: inThread ? session!.id : undefined,
        },
        at,
      ),
    );
  }
  update((st) => ({
    ...st,
    findings: prior ? st.findings.map((f) => (f.id === id ? finding : f)) : [finding, ...st.findings],
    jobs: [...jobs, ...st.jobs],
    ui: { ...st.ui, captureDraft: null },
  }));
  if (finding.runResultRef) linkFindingToResult(finding.runResultRef.runId, finding.runResultRef.caseId, id);
  logEvent({ kind: 'finding', title: `${typeLabel(finding.type)} reported`, detail: `${id}: ${finding.title}`, link: `/triage/${id}` });
  void processPending();
  return { ok: true, errors: {}, finding, jobIds: jobs.map((j) => j.id) };
}

export const typeLabel = (t: FindingType) => (t === 'bug' ? 'Bug' : t === 'feedback' ? 'Feedback' : 'Question');

// ---- Outbox -----------------------------------------------------------------

let running = false;
export async function processPending(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = store().get().jobs.slice().reverse().find((j) => j.status === 'pending' && !inFlight.has(j.id));
      if (!job) break;
      const queuedIn = epoch;
      await sleep(config.deliveryDelayMs);
      if (queuedIn !== epoch) continue;
      await runJob(job);
    }
  } finally {
    running = false;
  }
}

// Bumped by resetDemo so a delivery that was in flight cannot write into fresh fixtures.
let epoch = 0;
const inFlight = new Set<ID>();

async function runJob(job: DeliveryJob) {
  if (inFlight.has(job.id)) return;
  inFlight.add(job.id);
  try {
    await runJobOnce(job);
  } finally {
    inFlight.delete(job.id);
  }
}

async function runJobOnce(job: DeliveryJob) {
  const startedIn = epoch;
  const s = store().get();
  const result = await processJob(job, {
    adapters: adapters(),
    findFinding: (id) => store().get().findings.find((f) => f.id === id),
    projectKey: (pid) => s.projects.find((p) => p.id === pid)?.key ?? 'X',
    now: nowIso,
  });
  if (startedIn !== epoch) return;
  update((st) => {
    let findings = st.findings;
    let sessions = st.sessions;
    if (result.status === 'delivered' && result.payload.kind === 'tracker.create' && result.result?.externalId) {
      const fid = result.payload.findingId;
      findings = findings.map((f) =>
        f.id === fid ? { ...f, external: { provider: 'tracker', externalId: result.result!.externalId!, url: result.result!.url!, syncedAt: nowIso(), remoteStatus: 'to do' } } : f,
      );
    }
    if (result.status === 'delivered' && result.payload.kind === 'messaging.post' && result.dedupeKey.startsWith('session:')) {
      const sid = result.dedupeKey.slice('session:'.length);
      sessions = sessions.map((x) => (x.id === sid ? { ...x, threadTs: result.result?.ts } : x));
    }
    return { ...st, findings, sessions, jobs: st.jobs.map((j) => (j.id === job.id ? result : j)) };
  });
  const last = result.attempts[result.attempts.length - 1];
  if (last) logEvent({ kind: 'delivery', title: deliveryTitle(result), detail: last.detail });
}

function deliveryTitle(j: DeliveryJob) {
  const ok = j.status === 'delivered';
  if (j.payload.kind === 'tracker.create') return ok ? 'Ticket created' : j.status === 'unknown' ? 'Ticket delivery uncertain' : 'Ticket delivery failed';
  return ok ? 'Message delivered' : 'Message delivery failed';
}

/** Retries only this job. Uncertain jobs reconcile before re-sending. */
export async function retryJob(jobId: ID) {
  const job = store().get().jobs.find((j) => j.id === jobId);
  if (!job || job.status === 'delivered') return;
  if (job.status === 'failed') update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === jobId ? { ...j, status: 'pending' } : j)) }));
  if (job.status === 'unknown') {
    await runJob(job);
    return;
  }
  await processPending();
}

export function setFaults(patch: Partial<Faults>) {
  update((s) => ({ ...s, remote: { ...s.remote, faults: { ...s.remote.faults, ...patch } } }));
}

// ---- Triage -----------------------------------------------------------------

export function updateFinding(id: ID, patch: Partial<Finding>) {
  update((s) => ({ ...s, findings: s.findings.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: nowIso() } : f)) }));
}

export function deleteDraft(id: ID) {
  update((s) => ({
    ...s,
    findings: s.findings.filter((f) => !(f.id === id && f.status === 'draft')),
    ui: { ...s.ui, captureDraft: s.ui.captureDraft?.draftId === id ? null : s.ui.captureDraft },
  }));
}

export function answerQuestion(id: ID, answer: string) {
  const q = store().get().findings.find((f) => f.id === id)!;
  const answered = answerQ(q, answer, nowIso());
  update((s) => ({ ...s, findings: s.findings.map((f) => (f.id === id ? answered : f)) }));
  logEvent({ kind: 'question', title: 'Answer recorded', detail: `${id}: ${answer.slice(0, 80)}`, link: `/triage/${id}` });
}

/** Creates a linked bug draft and opens it in Capture for review. */
export function convertQuestionToBug(id: ID): Finding {
  const s = store().get();
  const q = s.findings.find((f) => f.id === id)!;
  const draft = questionToBugDraft(q, nextFindingId(s.findings), nowIso());
  update((st) => ({
    ...st,
    findings: [draft, ...st.findings.map((f) => (f.id === id ? { ...f, convertedToId: draft.id, updatedAt: nowIso() } : f))],
    ui: {
      ...st.ui,
      captureDraft: {
        type: 'bug',
        fields: { ...draft },
        draftId: draft.id,
        postInThread: false,
        destinations: { tracker: routeFor(st, draft.projectId, 'bug')?.tracker.enabled ?? false, messaging: routeFor(st, draft.projectId, 'bug')?.messaging.enabled ?? false },
      },
    },
  }));
  return draft;
}

// ---- Sessions ---------------------------------------------------------------

export function createSession(input: { title: string; projectId: ID; buildId: ID; platform: Platform; ownerId: ID; runId?: ID; channel: string }) {
  const s = store().get();
  const id = uid('ses');
  const project = s.projects.find((p) => p.id === input.projectId)!;
  const build = s.builds.find((b) => b.id === input.buildId)!;
  const session: Session = { id, ...input, status: 'open', createdAt: nowIso() };
  const job = newJob(uid('job'), `session:${id}`, { kind: 'messaging.post', channel: input.channel, text: `*Testing session: ${input.title} · ${project.name} ${build.version}*\nFindings from this session are posted as replies.`, sessionId: id }, nowIso());
  update((st) => ({ ...st, sessions: [session, ...st.sessions], jobs: [job, ...st.jobs] }));
  logEvent({ kind: 'session', title: 'Session started', detail: `${input.title} · ${project.name} ${build.version}` });
  void processPending();
  return session;
}

export function closeSession(id: ID) {
  update((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, status: 'closed', closedAt: nowIso() } : x)) }));
}

// ---- Test Lab ---------------------------------------------------------------

export function saveCase(input: { id?: ID; projectId: ID; suiteId: ID; revision: Omit<CaseRevision, 'rev' | 'editedAt' | 'editedBy'> }): ID {
  const s = store().get();
  const at = nowIso();
  if (input.id) {
    const tc = s.cases.find((c) => c.id === input.id)!;
    const next = reviseCase({ ...tc, suiteId: input.suiteId }, input.revision, s.currentUserId, at);
    update((st) => ({ ...st, cases: st.cases.map((c) => (c.id === tc.id ? next : c)) }));
    return tc.id;
  }
  const id = uid('case');
  update((st) => ({
    ...st,
    cases: [...st.cases, { id, projectId: input.projectId, suiteId: input.suiteId, revisions: [{ ...input.revision, rev: 1, editedAt: at, editedBy: st.currentUserId }] }],
  }));
  return id;
}

export function createSuite(projectId: ID, name: string, description: string): ID {
  const id = uid('suite');
  update((s) => ({ ...s, suites: [...s.suites, { id, projectId, name, description }] }));
  return id;
}

export function startRun(input: { name: string; projectId: ID; buildId: ID; platforms: Platform[]; assigneeIds: ID[]; caseIds: ID[] }): ID {
  const s = store().get();
  const id = uid('run');
  const run = createRunDomain({ ...input, id, cases: input.caseIds.map((cid) => s.cases.find((c) => c.id === cid)!), at: nowIso() });
  update((st) => ({ ...st, runs: [run, ...st.runs] }));
  logEvent({ kind: 'run', title: 'Test run started', detail: `${input.name} · ${input.caseIds.length} cases`, link: `/test-lab/runs/${id}` });
  return id;
}

export function recordResult(runId: ID, caseId: ID, result: ResultValue, notes: string, evidence: string, findingIds: ID[] = []) {
  const s = store().get();
  const run = s.runs.find((r) => r.id === runId)!;
  const next = recordResultDomain(run, caseId, { result, notes, evidence, testerId: s.currentUserId, at: nowIso(), findingIds });
  update((st) => ({ ...st, runs: st.runs.map((r) => (r.id === runId ? next : r)) }));
}

export function completeRun(runId: ID, reason?: string) {
  const run = store().get().runs.find((r) => r.id === runId)!;
  const next = completeRunDomain(run, nowIso(), reason ? { reason } : undefined);
  update((st) => ({ ...st, runs: st.runs.map((r) => (r.id === runId ? next : r)) }));
  logEvent({ kind: 'run', title: 'Test run completed', detail: next.incompleteAck ? `${run.name}: completed with ${next.incompleteAck.remaining} untested (${next.incompleteAck.reason})` : `${run.name}: all cases executed`, link: `/test-lab/runs/${runId}` });
}

/** Saves a bug draft linked to a failed run result, then opens Capture. */
export function bugFromResult(runId: ID, caseId: ID) {
  const s = store().get();
  const run = s.runs.find((r) => r.id === runId)!;
  const snap = run.cases.find((c) => c.caseId === caseId)!;
  const last = snap.attempts[snap.attempts.length - 1];
  const draft: CaptureDraft = {
    type: 'bug',
    fields: {
      type: 'bug',
      projectId: run.projectId,
      buildId: run.buildId,
      platform: run.platforms[0],
      title: `${snap.revision.title}: fails`,
      steps: snap.revision.steps.map((st, i) => `${i + 1}. ${st.action}`).join('\n'),
      expected: snap.revision.steps.map((st) => st.expected).join(' '),
      actual: last?.notes ?? '',
      runResultRef: { runId, caseId },
    },
    destinations: { tracker: routeFor(s, run.projectId, 'bug')?.tracker.enabled ?? false, messaging: routeFor(s, run.projectId, 'bug')?.messaging.enabled ?? false },
    postInThread: false,
  };
  setCaptureDraft(draft);
}

/** Called after a bug linked to a run result is submitted. */
export function linkFindingToResult(runId: ID, caseId: ID, findingId: ID) {
  update((s) => ({
    ...s,
    runs: s.runs.map((r) =>
      r.id !== runId
        ? r
        : {
            ...r,
            cases: r.cases.map((c) => {
              if (c.caseId !== caseId || !c.attempts.length) return c;
              const attempts = c.attempts.slice();
              const last = attempts[attempts.length - 1];
              attempts[attempts.length - 1] = { ...last, findingIds: [...new Set([...last.findingIds, findingId])] };
              return { ...c, attempts };
            }),
          },
    ),
  }));
}

// ---- Releases ---------------------------------------------------------------

export function updateReleaseDraft(releaseId: ID, patch: Partial<DecisionDraft>) {
  update((s) => {
    const current = s.ui.releaseDrafts[releaseId] ?? { checklist: { smokeLinked: false, blockersReviewed: false, risksAccepted: false }, rationale: '', risks: [] };
    return { ...s, ui: { ...s.ui, releaseDrafts: { ...s.ui.releaseDrafts, [releaseId]: { ...current, ...patch } } } };
  });
}

export function liveEvidence(s: AppState, releaseId: ID) {
  const rel = s.releases.find((r) => r.id === releaseId)!;
  return captureEvidence(s.runs.filter((r) => rel.runIds.includes(r.id)), s.findings, rel.projectId, nowIso());
}

export function saveDecision(releaseId: ID): { ok: boolean; errors: string[]; rev?: number } {
  const s = store().get();
  const rel = s.releases.find((r) => r.id === releaseId)!;
  const draft = s.ui.releaseDrafts[releaseId];
  const evidence = liveEvidence(s, releaseId);
  const errors = draft ? validateDecision(draft, evidence) : ['Choose a QA recommendation.'];
  if (errors.length) return { ok: false, errors };
  const project = s.projects.find((p) => p.id === rel.projectId)!;
  const build = s.builds.find((b) => b.id === rel.buildId)!;
  const message = releaseMessage({
    recommendation: draft.recommendation!,
    projectName: project.name,
    buildLabel: `${build.version}${rel.type === 'hotfix' ? ' (Hotfix)' : ''}`,
    evidence,
    rationale: draft.rationale,
    risks: draft.risks,
  });
  const next = saveRevision(
    rel,
    { authorId: s.currentUserId, evidence, recommendation: draft.recommendation!, checklist: draft.checklist, rationale: draft.rationale, risks: draft.risks, message, channel: s.settings.releaseChannel },
    nowIso(),
  );
  update((st) => ({ ...st, releases: st.releases.map((r) => (r.id === releaseId ? next : r)) }));
  const rev = next.revisions[next.revisions.length - 1].rev;
  logEvent({ kind: 'release', title: 'Release decision saved', detail: `${project.name} ${build.version}: ${draft.recommendation} (revision ${rev})`, link: `/releases/${releaseId}` });
  return { ok: true, errors: [], rev };
}

export function sendReleaseMessage(releaseId: ID, rev: number) {
  const s = store().get();
  const rel = s.releases.find((r) => r.id === releaseId)!;
  const revision = rel.revisions.find((r) => r.rev === rev)!;
  if (revision.sentJobId) return revision.sentJobId;
  const job = newJob(uid('job'), `release:${releaseId}:${rev}`, { kind: 'messaging.post', channel: revision.channel, text: revision.message, releaseId, rev }, nowIso());
  update((st) => ({
    ...st,
    jobs: [job, ...st.jobs],
    releases: st.releases.map((r) => (r.id !== releaseId ? r : { ...r, revisions: r.revisions.map((x) => (x.rev === rev ? { ...x, sentJobId: job.id } : x)) })),
  }));
  void processPending();
  return job.id;
}

// ---- Digest -----------------------------------------------------------------

export async function fetchDigestData(projectKey: string | undefined): Promise<FetchResult> {
  const res = await fetchAllTasks(adapters().tracker, projectKey, nowIso);
  if (res.complete) update((s) => ({ ...s, settings: { ...s.settings, lastSyncAt: res.fetchedAt } }));
  return res;
}

export function prepareDigest(fetch: FetchResult, scopeLabel: string, channel: string): DigestLedger {
  if (!fetch.complete) throw new Error('The fetch was partial. Fetch again before preparing a digest.');
  const s = store().get();
  const d = buildDigest(fetch.items, s.settings.statusMapping);
  const parent = digestParent(d, scopeLabel, new Date(fetch.fetchedAt).toUTCString());
  const ledger = createLedger(uid('digest'), channel, scopeLabel, fetch.fetchedAt, parent, digestReplies(d, adapters().messaging.maxMessageChars), nowIso());
  update((st) => ({ ...st, ledgers: [ledger, ...st.ledgers] }));
  return ledger;
}

export async function sendDigest(ledgerId: ID) {
  const ledger = store().get().ledgers.find((l) => l.id === ledgerId)!;
  const next = await sendLedger(ledger, adapters().messaging);
  update((s) => ({ ...s, ledgers: s.ledgers.map((l) => (l.id === ledgerId ? next : l)) }));
  const sent = next.entries.filter((e) => e.status === 'sent').length;
  logEvent({ kind: 'digest', title: sent === next.entries.length ? 'Digest posted' : 'Digest partially posted', detail: `${sent} of ${next.entries.length} messages sent to ${next.channel}.`, link: '/triage/digest' });
  return next;
}

export function discardLedger(ledgerId: ID) {
  update((s) => ({ ...s, ledgers: s.ledgers.filter((l) => l.id !== ledgerId) }));
}

// ---- QA tasks ---------------------------------------------------------------

export type NewTask = Pick<QaTask, 'projectId' | 'title' | 'description' | 'type' | 'ownerId' | 'priority'> & Partial<Pick<QaTask, 'dueDate' | 'link'>>;

/** Adds a task at the top of To do. */
export function createTask(input: NewTask): ID {
  const id = uid('task');
  const at = nowIso();
  const task: QaTask = { ...input, id, title: input.title.trim(), status: 'todo', order: -1, createdAt: at, updatedAt: at };
  update((s) => ({ ...s, tasks: moveTask([...s.tasks, task], id, 'todo', 0, at) }));
  logEvent({ kind: 'task', title: 'Task created', detail: `${task.title} · ${TASK_TYPE_LABEL[task.type]}`, link: '/tasks' });
  return id;
}

/** Moves a task into `status`, just before `beforeId` (or to the end of the column). */
export function moveTaskTo(id: ID, status: TaskStatus, beforeId?: ID) {
  const s = store().get();
  const from = s.tasks.find((t) => t.id === id);
  if (!from) return;
  const column = columnOf(s.tasks, status).filter((t) => t.id !== id);
  const at = beforeId ? column.findIndex((t) => t.id === beforeId) : -1;
  update((st) => ({ ...st, tasks: moveTask(st.tasks, id, status, at < 0 ? column.length : at, nowIso()) }));
  if (from.status !== status)
    logEvent({ kind: 'task', title: status === 'done' ? 'Task completed' : 'Task moved', detail: `${from.title} → ${TASK_STATUS_LABEL[status]}`, link: '/tasks' });
}

export function updateTask(id: ID, patch: Partial<Omit<QaTask, 'id' | 'order' | 'createdAt' | 'completedAt'>>) {
  const { status, ...fields } = patch;
  const current = store().get().tasks.find((t) => t.id === id);
  if (!current) return;
  if (status && status !== current.status) moveTaskTo(id, status);
  update((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fields, title: (fields.title ?? t.title).trim(), updatedAt: nowIso() } : t)) }));
}

export function deleteTask(id: ID) {
  const task = store().get().tasks.find((t) => t.id === id);
  if (!task) return;
  update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id).map((t) => (t.status === task.status && t.order > task.order ? { ...t, order: t.order - 1 } : t)) }));
  logEvent({ kind: 'task', title: 'Task deleted', detail: task.title });
}

// ---- Library ----------------------------------------------------------------

export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function saveResource(r: ResourceLink) {
  if (!isSafeUrl(r.url)) throw new Error('Only http and https links are allowed.');
  update((s) => ({ ...s, resources: s.resources.some((x) => x.id === r.id) ? s.resources.map((x) => (x.id === r.id ? r : x)) : [r, ...s.resources] }));
}

export function deleteResource(id: ID) {
  update((s) => ({ ...s, resources: s.resources.filter((r) => r.id !== id) }));
}

// ---- Settings ---------------------------------------------------------------

export function updateRoute(projectId: ID, type: FindingType, patch: Partial<Pick<Route, 'tracker' | 'messaging'>>) {
  update((s) => ({ ...s, routes: s.routes.map((r) => (r.projectId === projectId && r.type === type ? { ...r, ...patch } : r)) }));
}

export function updateSettings(patch: Partial<AppState['settings']>) {
  update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function resetDemo() {
  epoch++;
  store().replace(seed(new Date()));
}
