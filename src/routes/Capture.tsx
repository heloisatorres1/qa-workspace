import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bug, CircleHelp, FileText, Info, MessageSquare, Paperclip, Play, RotateCcw, Send, Trash2, Wand2 } from 'lucide-react';
import { useAppState, type AppState, type CaptureDraft } from '../data/state';
import {
  createSession,
  deleteDraft,
  newCaptureDraft,
  openSessionFor,
  retryJob,
  routeFor,
  saveFindingDraft,
  setCaptureDraft,
  setFaults,
  submitFinding,
  typeLabel,
} from '../data/actions';
import { buildLabel, jobsForFinding, personName, projectName } from '../data/selectors';
import { draftFromNotes, nextFindingId, validateForSubmit, type FieldErrors } from '../domain/findings';
import { chatSummary, trackerBody } from '../domain/format';
import { PLATFORMS, PRIORITIES, SEVERITIES, type Attachment, type Finding, type FindingType, type Platform } from '../domain/types';
import { SEVERITY_LABEL } from '../domain/format';
import { Callout, Card, Dialog, Empty, Field, JobBadge, SeverityBadge, StatusBadge, formatTime, timeAgo, useToast , ChatText } from '../components/ui';
import { deliverySummary } from '../integrations/outbox';

const TYPES: { type: FindingType; label: string; icon: typeof Bug }[] = [
  { type: 'bug', label: 'Bug', icon: Bug },
  { type: 'feedback', label: 'Feedback', icon: MessageSquare },
  { type: 'question', label: 'Question', icon: CircleHelp },
];

const MAX_ATTACHMENT = 50 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|text\/plain|application\/(json|zip))$/;

export function Capture() {
  const s = useAppState();
  const [params] = useSearchParams();
  const toast = useToast();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  useEffect(() => {
    const t = params.get('type') as FindingType | null;
    if (!s.ui.captureDraft) setCaptureDraft(newCaptureDraft(s, t ?? 'bug'));
    else if (t && t !== s.ui.captureDraft.type) setCaptureDraft(switchType(s, s.ui.captureDraft, t));
  }, []);

  const draft = s.ui.captureDraft;
  if (submittedId) return <Submitted id={submittedId} onNew={() => { setSubmittedId(null); setCaptureDraft(newCaptureDraft(s)); }} />;
  if (!draft) return null;

  const f = draft.fields;
  const set = (patch: Partial<Finding>) => {
    setCaptureDraft({ ...draft, fields: { ...draft.fields, ...patch } });
    if (Object.keys(errors).length) setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as keyof Finding];
      return next;
    });
  };
  const err = (k: keyof Finding) => errors[k];

  const review = () => {
    const e = validateForSubmit({ ...f, type: draft.type });
    setErrors(e);
    if (Object.keys(e).length) {
      toast(`${Object.keys(e).length} field${Object.keys(e).length > 1 ? 's need' : ' needs'} attention before submitting.`);
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
      return;
    }
    setConfirming(true);
  };

  const builds = s.builds.filter((b) => b.projectId === f.projectId);
  const sessions = s.sessions.filter((x) => x.projectId === f.projectId);
  const drafts = s.findings.filter((x) => x.status === 'draft');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Capture a finding</h1>
          <div className="meta">Bugs, feedback and questions start here. Drafts are kept while you move around.</div>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Finding type">
        {TYPES.map(({ type, label, icon: Icon }) => (
          <button key={type} role="tab" aria-selected={draft.type === type} onClick={() => setCaptureDraft(switchType(s, draft, type))}>
            <Icon size={18} aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div className="grid cols-main-side">
        <Card title={`${typeLabel(draft.type)} details`} actions={draft.draftId ? <span className="badge lav">Editing draft {draft.draftId}</span> : undefined}>
          <div className="form-grid">
            <Field label="Title" required error={err('title')}>
              {(p) => <input {...p} className="input" value={f.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder={draft.type === 'question' ? 'Short summary of the question' : 'What went wrong, in one line'} />}
            </Field>

            <div className="form-grid fg-3">
              <Field label="Project" required error={err('projectId')}>
                {(p) => (
                  <select {...p} className="input" value={f.projectId ?? ''} onChange={(e) => {
                    const projectId = e.target.value;
                    const route = routeFor(s, projectId, draft.type);
                    setCaptureDraft({ ...draft, fields: { ...f, projectId, buildId: undefined, sessionId: undefined }, destinations: { tracker: !!route?.tracker.enabled, messaging: !!route?.messaging.enabled }, postInThread: false });
                  }}>
                    {s.projects.map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Build" hint="Optional for standalone findings.">
                {(p) => (
                  <select {...p} className="input" value={f.buildId ?? ''} onChange={(e) => set({ buildId: e.target.value || undefined })}>
                    <option value="">Not build-specific</option>
                    {builds.map((b) => (
                      <option key={b.id} value={b.id}>{b.version}{b.label ? ` (${b.label})` : ''}</option>
                    ))}
                  </select>
                )}
              </Field>
              {draft.type === 'bug' ? (
                <Field label="Platform">
                  {(p) => (
                    <select {...p} className="input" value={f.platform ?? ''} onChange={(e) => set({ platform: (e.target.value || undefined) as Platform | undefined })}>
                      <option value="">Choose…</option>
                      {PLATFORMS.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  )}
                </Field>
              ) : draft.type === 'feedback' ? (
                <Field label="Category">
                  {(p) => (
                    <select {...p} className="input" value={f.category ?? ''} onChange={(e) => set({ category: e.target.value || undefined })}>
                      <option value="">Choose…</option>
                      {['UX', 'Onboarding', 'Balance', 'Audio', 'Visual', 'Performance', 'Other'].map((x) => <option key={x}>{x}</option>)}
                    </select>
                  )}
                </Field>
              ) : (
                <Field label="Who should answer" required error={err('ownerId')}>
                  {(p) => (
                    <select {...p} className="input" value={f.ownerId ?? ''} onChange={(e) => set({ ownerId: e.target.value || undefined })}>
                      <option value="">Choose…</option>
                      {s.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  )}
                </Field>
              )}
            </div>

            {draft.type === 'bug' && (
              <>
                <div className="form-grid fg-2">
                  <Field label="Severity" required error={err('severity')} hint="Impact on the player.">
                    {(p) => (
                      <select {...p} className="input sev-select" data-sev={f.severity} value={f.severity ?? ''} onChange={(e) => set({ severity: (e.target.value || undefined) as Finding['severity'] })}>
                        <option value="">Choose…</option>
                        {SEVERITIES.map((x) => <option key={x} value={x}>{SEVERITY_LABEL[x]}</option>)}
                      </select>
                    )}
                  </Field>
                  <Field label="Priority" required error={err('priority')} hint="When it should be fixed.">
                    {(p) => (
                      <select {...p} className="input pri-select" value={f.priority ?? ''} onChange={(e) => set({ priority: (e.target.value || undefined) as Finding['priority'] })}>
                        <option value="">Choose…</option>
                        {PRIORITIES.map((x) => <option key={x}>{x}</option>)}
                      </select>
                    )}
                  </Field>
                </div>
                <Field label="Steps to reproduce" required error={err('steps')}>
                  {(p) => <textarea {...p} className="input" rows={4} value={f.steps ?? ''} onChange={(e) => set({ steps: e.target.value })} placeholder={'1. …\n2. …\n3. …'} />}
                </Field>
                <Field label="Expected result" required error={err('expected')}>
                  {(p) => <textarea {...p} className="input" rows={2} value={f.expected ?? ''} onChange={(e) => set({ expected: e.target.value })} />}
                </Field>
                <Field label="Actual result" required error={err('actual')}>
                  {(p) => <textarea {...p} className="input" rows={2} value={f.actual ?? ''} onChange={(e) => set({ actual: e.target.value })} />}
                </Field>
                <div className="form-grid fg-2">
                  <Field label="Device / OS">
                    {(p) => <input {...p} className="input" value={f.device ?? ''} onChange={(e) => set({ device: e.target.value })} placeholder="e.g. Pixel 7 · Android 14" />}
                  </Field>
                  <Field label="Description" hint="Optional context.">
                    {(p) => <input {...p} className="input" value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} />}
                  </Field>
                </div>
                <Attachments value={f.attachments ?? []} onChange={(attachments) => set({ attachments })} />
              </>
            )}

            {draft.type === 'feedback' && (
              <>
                <Field label="Observation" required error={err('observation')}>
                  {(p) => <textarea {...p} className="input" rows={3} value={f.observation ?? ''} onChange={(e) => set({ observation: e.target.value })} placeholder="What did you notice?" />}
                </Field>
                <Field label="Suggested improvement">
                  {(p) => <textarea {...p} className="input" rows={3} value={f.suggestion ?? ''} onChange={(e) => set({ suggestion: e.target.value })} />}
                </Field>
              </>
            )}

            {draft.type === 'question' && (
              <Field label="Question" required error={err('question')} hint="Questions stay questions. You can convert one into a bug later from Triage.">
                {(p) => <textarea {...p} className="input" rows={4} value={f.question ?? ''} onChange={(e) => set({ question: e.target.value })} />}
              </Field>
            )}

            <div className="form-grid fg-2">
              <Field label="Testing session" error={err('sessionId')} hint="Optional. Session findings can be posted as thread replies.">
                {(p) => (
                  <select {...p} className="input" value={f.sessionId ?? ''} onChange={(e) => { set({ sessionId: e.target.value || undefined }); }}>
                    <option value="">Standalone (no session)</option>
                    {sessions.map((x) => (
                      <option key={x.id} value={x.id} disabled={x.status === 'closed'}>
                        {x.title} · {buildLabel(s, x.buildId)}{x.status === 'closed' ? ' (closed)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <div className="field">
                <span className="label">&nbsp;</span>
                <button type="button" className="btn" onClick={() => setSessionOpen(true)}>
                  <Play size={16} aria-hidden /> Start a session
                </button>
              </div>
            </div>
            {f.runResultRef && (
              <Callout>
                Linked to a run result: <Link to={`/test-lab/runs/${f.runResultRef.runId}`}>{s.runs.find((r) => r.id === f.runResultRef!.runId)?.name}</Link>. The bug ID will be added to that result.
              </Callout>
            )}
          </div>

          <hr className="divider" />
          <div className="spread">
            <button type="button" className="btn soft" onClick={() => setNotesOpen(true)}>
              <FileText size={16} aria-hidden /> Draft from notes
            </button>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => { setCaptureDraft(newCaptureDraft(s, draft.type)); setErrors({}); }}>
                <RotateCcw size={16} aria-hidden /> Clear
              </button>
              <button type="button" className="btn" onClick={() => { const r = saveFindingDraft(draft); toast(`Draft ${r.id} saved locally. Nothing sent.`); }}>
                Save draft
              </button>
              <button type="button" className="btn primary" onClick={review}>
                Review &amp; submit
              </button>
            </div>
          </div>
        </Card>

        <DeliveryPreview draft={draft} />
      </div>

      <Card title="Saved drafts" className="flush" actions={<span className="subtle">{drafts.length} draft{drafts.length === 1 ? '' : 's'}</span>}>
        {drafts.length === 0 ? (
          <Empty title="No saved drafts" icon={<FileText size={28} aria-hidden />}>Use “Save draft” to keep an incomplete finding.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Project</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{typeLabel(d.type)}</td>
                    <td>{d.title}{d.convertedFromId && <span className="subtle"> · from {d.convertedFromId}</span>}</td>
                    <td>{projectName(s, d.projectId)}</td>
                    <td className="nowrap">{timeAgo(d.updatedAt)}</td>
                    <td className="nowrap">
                      <button className="btn small" onClick={() => setCaptureDraft({ type: d.type, fields: { ...d }, draftId: d.id, postInThread: false, destinations: { tracker: !!routeFor(s, d.projectId, d.type)?.tracker.enabled, messaging: !!routeFor(s, d.projectId, d.type)?.messaging.enabled } })}>Open</button>{' '}
                      <button className="icon-btn" aria-label={`Delete draft ${d.id}`} onClick={() => deleteDraft(d.id)}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirming && (
        <ConfirmSubmit
          draft={draft}
          onClose={() => setConfirming(false)}
          onSubmit={() => {
            const res = submitFinding(draft);
            setConfirming(false);
            if (!res.ok) { setErrors(res.errors); return; }
            setSubmittedId(res.finding!.id);
          }}
        />
      )}
      {notesOpen && <NotesDialog onClose={() => setNotesOpen(false)} onApply={(patch) => { set(patch); setNotesOpen(false); toast('Applied. Review the fields before submitting.'); }} type={draft.type} />}
      {sessionOpen && <SessionDialog projectId={f.projectId!} onClose={() => setSessionOpen(false)} onCreated={(id) => { setCaptureDraft({ ...draft, fields: { ...f, sessionId: id }, postInThread: true }); setSessionOpen(false); }} />}
    </>
  );
}

function switchType(s: AppState, d: CaptureDraft, type: FindingType): CaptureDraft {
  const route = routeFor(s, d.fields.projectId, type);
  return { ...d, type, fields: { ...d.fields, type }, destinations: { tracker: !!route?.tracker.enabled, messaging: !!route?.messaging.enabled } };
}

function Attachments({ value, onChange }: { value: Attachment[]; onChange: (a: Attachment[]) => void }) {
  const [error, setError] = useState('');
  return (
    <div className="field">
      <span className="label">Attachments</span>
      {value.map((a) => (
        <div key={a.id} className="preview row" style={{ justifyContent: 'space-between' }}>
          <span className="row"><Paperclip size={16} aria-hidden /> <strong>{a.name}</strong> <span className="subtle">{a.type} · {(a.size / 1_000_000).toFixed(1)} MB</span></span>
          <button type="button" className="icon-btn" aria-label={`Remove ${a.name}`} onClick={() => onChange(value.filter((x) => x.id !== a.id))}><Trash2 size={16} /></button>
        </div>
      ))}
      <label className="btn" style={{ alignSelf: 'flex-start' }}>
        <Paperclip size={16} aria-hidden /> Add file
        <input
          type="file"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (!ALLOWED_TYPES.test(file.type)) return setError(`“${file.name}” is not an allowed type. Use images, video, text, JSON or ZIP.`);
            if (file.size > MAX_ATTACHMENT) return setError(`“${file.name}” is larger than 50 MB.`);
            setError('');
            const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
            onChange([...value, { id: `att-${Date.now()}`, name: safe, type: file.type, size: file.size }]);
          }}
        />
      </label>
      {error ? <span className="error-text" role="alert">{error}</span> : <span className="hint">The demo keeps file details only; file contents never leave your device.</span>}
    </div>
  );
}

function DeliveryPreview({ draft }: { draft: CaptureDraft }) {
  const s = useAppState();
  const f = draft.fields;
  const route = routeFor(s, f.projectId, draft.type);
  const session = openSessionFor(s, f);
  const project = projectName(s, f.projectId);
  const build = s.builds.find((b) => b.id === f.buildId);
  const previewId = draft.draftId ?? nextFindingId(s.findings);
  const finding = { ...f, id: previewId, type: draft.type, title: f.title || 'Untitled' } as Finding;
  const inThread = draft.postInThread && !!session;
  const set = (patch: Partial<CaptureDraft>) => setCaptureDraft({ ...draft, ...patch });
  const nothing = !(route?.tracker.enabled && draft.destinations.tracker) && !(route?.messaging.enabled && draft.destinations.messaging);

  return (
    <Card title="Delivery preview" actions={<span className="badge lav">Draft · Nothing sent</span>}>
      <div className="stack">
        <Callout>Review destinations before submitting. Routing comes from Settings for {project} · {typeLabel(draft.type).toLowerCase()}.</Callout>
        <div>
          <h3 style={{ marginBottom: 8 }}>Destinations</h3>
          <div className="stack" style={{ gap: 8 }}>
            <label className="check">
              <input type="checkbox" disabled={!route?.tracker.enabled} checked={!!route?.tracker.enabled && draft.destinations.tracker} onChange={(e) => set({ destinations: { ...draft.destinations, tracker: e.target.checked } })} />
              <span>Issue tracker / {route?.tracker.list ?? '—'} {!route?.tracker.enabled && <span className="subtle">(not routed for this type)</span>}</span>
            </label>
            <label className="check">
              <input type="checkbox" disabled={!route?.messaging.enabled} checked={!!route?.messaging.enabled && draft.destinations.messaging} onChange={(e) => set({ destinations: { ...draft.destinations, messaging: e.target.checked } })} />
              <span>Team chat / {inThread ? `${session!.channel} thread` : route?.messaging.channel ?? '—'}</span>
            </label>
          </div>
        </div>

        {route?.tracker.enabled && draft.destinations.tracker && (
          <div>
            <h3 style={{ marginBottom: 8 }}>Ticket preview</h3>
            <div className="preview">
              <strong>{finding.id} {finding.title}</strong>
              <div className="chips" style={{ margin: '8px 0' }}>
                {f.severity && <SeverityBadge value={f.severity} />}
                {f.priority && <span className="badge lav square">{f.priority}</span>}
                <span className="badge neutral square">{project}</span>
                {build && <span className="badge neutral square">{build.version}</span>}
                {f.platform && <span className="badge neutral square">{f.platform}</span>}
              </div>
              <div className="pre subtle" style={{ color: 'var(--ink)' }}>{trackerBody(finding)}</div>
            </div>
          </div>
        )}

        {route?.messaging.enabled && draft.destinations.messaging && (
          <div>
            <h3 style={{ marginBottom: 8 }}>Message preview <span className="subtle">({inThread ? `reply in “${session!.title}” thread` : 'new channel message'})</span></h3>
            <div className={`chat-msg ${inThread ? 'chat-reply' : ''}`}><ChatText text={chatSummary(finding, project, build?.version)} /></div>
          </div>
        )}

        {nothing && <Callout tone="warn">No destination selected. Submitting will only save the record in QA Workspace.</Callout>}

        <label className="check">
          <input type="checkbox" disabled={!session} checked={inThread} onChange={(e) => set({ postInThread: e.target.checked })} />
          <span>Post in session thread {!session && <span className="subtle">(pick an open session first)</span>}</span>
        </label>

        <details>
          <summary className="subtle" style={{ cursor: 'pointer' }}>Demo: simulate a delivery problem</summary>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <label className="check"><input type="checkbox" checked={s.remote.faults.messagingFailNext > 0} onChange={(e) => setFaults({ messagingFailNext: e.target.checked ? 1 : 0 })} /> Next chat post fails</label>
            <label className="check"><input type="checkbox" checked={s.remote.faults.trackerTimeoutNext > 0} onChange={(e) => setFaults({ trackerTimeoutNext: e.target.checked ? 1 : 0 })} /> Next ticket times out (but is created)</label>
            <label className="check"><input type="checkbox" checked={s.remote.faults.trackerFailNext > 0} onChange={(e) => setFaults({ trackerFailNext: e.target.checked ? 1 : 0 })} /> Next ticket fails</label>
          </div>
        </details>
      </div>
    </Card>
  );
}

function ConfirmSubmit({ draft, onClose, onSubmit }: { draft: CaptureDraft; onClose: () => void; onSubmit: () => void }) {
  const s = useAppState();
  const route = routeFor(s, draft.fields.projectId, draft.type);
  const session = openSessionFor(s, draft.fields);
  const dests: string[] = [];
  if (route?.tracker.enabled && draft.destinations.tracker) dests.push(`Create a ticket in Issue tracker / ${route.tracker.list}`);
  if (route?.messaging.enabled && draft.destinations.messaging) dests.push(draft.postInThread && session ? `Reply in the “${session.title}” thread on ${session.channel}` : `Post a new message in ${route.messaging.channel}`);
  return (
    <Dialog title="Submit this finding?" onClose={onClose}>
      <div className="stack">
        <p><strong>{draft.fields.title}</strong></p>
        <div>
          <p style={{ marginBottom: 6 }}>QA Workspace will save the record first, then:</p>
          {dests.length ? <ul style={{ margin: 0 }}>{dests.map((d) => <li key={d}>{d}</li>)}</ul> : <p className="muted">Nothing else. No destination is selected.</p>}
        </div>
        <Callout>Demo mode: deliveries go to mock adapters. No real ticket or message is created.</Callout>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Back to edit</button>
          <button className="btn primary" onClick={onSubmit} autoFocus><Send size={16} aria-hidden /> Submit</button>
        </div>
      </div>
    </Dialog>
  );
}

function NotesDialog({ onClose, onApply, type }: { onClose: () => void; onApply: (p: Partial<Finding>) => void; type: FindingType }) {
  const [notes, setNotes] = useState('');
  const proposal = useMemo(() => draftFromNotes(notes), [notes]);
  return (
    <Dialog title="Draft from notes" onClose={onClose}>
      <div className="stack">
        <p className="muted">Paste rough notes. The first line becomes the title and the remaining lines become numbered steps. Nothing is invented: expected and actual results stay yours to write.</p>
        <Field label="Notes">
          {(p) => <textarea {...p} className="input" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={'Inventory closes after reconnect\nopen a save\ngo offline then back online\nopen inventory'} />}
        </Field>
        {proposal.title && (
          <div className="preview stack" style={{ gap: 6 }}>
            <div><span className="subtle">Proposed title</span><div><strong>{proposal.title}</strong></div></div>
            {type === 'bug' && proposal.steps && <div><span className="subtle">Proposed steps</span><div className="pre">{proposal.steps}</div></div>}
            {proposal.leftover.length > 0 && <div className="subtle">Not used (copy them into the right fields yourself): {proposal.leftover.join(' · ')}</div>}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!proposal.title} onClick={() => onApply({ title: proposal.title, ...(type === 'bug' && proposal.steps ? { steps: proposal.steps } : {}) })}>
            <Wand2 size={16} aria-hidden /> Apply to form
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function SessionDialog({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const s = useAppState();
  const builds = s.builds.filter((b) => b.projectId === projectId);
  const runs = s.runs.filter((r) => r.projectId === projectId && r.status === 'active');
  const [title, setTitle] = useState('');
  const [buildId, setBuildId] = useState(builds.at(-1)?.id ?? '');
  const [platform, setPlatform] = useState<Platform>('Android');
  const [runId, setRunId] = useState('');
  const channel = routeFor(s, projectId, 'bug')?.messaging.channel ?? '#demo-qa';
  return (
    <Dialog title="Start a testing session" onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (!title.trim() || !buildId) return; onCreated(createSession({ title: title.trim(), projectId, buildId, platform, ownerId: s.currentUserId, runId: runId || undefined, channel }).id); }}>
        <Field label="Session name" required>{(p) => <input {...p} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. iOS onboarding sweep" />}</Field>
        <div className="form-grid fg-2">
          <Field label="Build" required>{(p) => <select {...p} className="input" value={buildId} onChange={(e) => setBuildId(e.target.value)}>{builds.map((b) => <option key={b.id} value={b.id}>{b.version}</option>)}</select>}</Field>
          <Field label="Platform">{(p) => <select {...p} className="input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>{PLATFORMS.map((x) => <option key={x}>{x}</option>)}</select>}</Field>
        </div>
        <Field label="Linked run" hint="Optional.">{(p) => <select {...p} className="input" value={runId} onChange={(e) => setRunId(e.target.value)}><option value="">None</option>{runs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}</Field>
        <Callout>Starting a session posts one parent message to {channel} (mock). Findings can then reply in its thread.</Callout>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!title.trim()}>Start session</button>
        </div>
      </form>
    </Dialog>
  );
}

function Submitted({ id, onNew }: { id: string; onNew: () => void }) {
  const s = useAppState();
  const f = s.findings.find((x) => x.id === id);
  const jobs = jobsForFinding(s, id);
  const summary = deliverySummary(jobs);
  if (!f) return <Empty title="Finding not found" />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{typeLabel(f.type)} {f.id} saved</h1>
          <div className="meta">{f.title}</div>
        </div>
        <div className="row">
          <Link className="btn" to={`/triage/${f.id}`}>Open in Triage</Link>
          <button className="btn primary" onClick={onNew}>Capture another</button>
        </div>
      </div>
      <Card title="Delivery status">
        <div className="stack">
          <Callout tone="good">Saved in QA Workspace. This record exists even if a delivery below fails.</Callout>
          {summary === 'none' && <p className="muted">No destinations were selected.</p>}
          {summary === 'partial' && <Callout tone="warn">Partially delivered. Retry only the failed destination; delivered ones are not repeated.</Callout>}
          {jobs.map((j) => <JobRow key={j.id} jobId={j.id} />)}
          <p className="subtle"><Info size={13} aria-hidden /> Reporter {personName(s, f.reporterId)} · {formatTime(f.createdAt)} · <StatusBadge value={f.status} /></p>
        </div>
      </Card>
    </>
  );
}

export function JobRow({ jobId }: { jobId: string }) {
  const s = useAppState();
  const j = s.jobs.find((x) => x.id === jobId);
  if (!j) return null;
  const label = j.payload.kind === 'tracker.create' ? `Issue tracker / ${j.payload.list}` : `Team chat / ${j.payload.channel}${j.payload.threadTs ? ' (thread reply)' : ''}`;
  const last = j.attempts.at(-1);
  return (
    <div className="preview spread">
      <div style={{ minWidth: 0 }}>
        <strong>{label}</strong>
        <div className="subtle">{last ? last.detail : 'Waiting in the outbox…'}{j.result?.externalId && <> · <a href={j.result.url} target="_blank" rel="noopener noreferrer">{j.result.externalId}</a></>}</div>
        {j.attempts.length > 1 && <div className="subtle">{j.attempts.length} attempts</div>}
      </div>
      <div className="row">
        <JobBadge job={j} />
        {(j.status === 'failed' || j.status === 'unknown') && (
          <button className="btn small outline" onClick={() => void retryJob(j.id)}>
            {j.status === 'unknown' ? 'Check & retry' : 'Retry'}
          </button>
        )}
      </div>
    </div>
  );
}
