import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { History, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useAppState } from '../data/state';
import { closeSession, createSuite, saveCase, startRun } from '../data/actions';
import { buildLabel, personName, projectName } from '../data/selectors';
import { latestRevision, runProgress } from '../domain/runs';
import { formatPercent } from '../domain/metrics';
import { PLATFORMS, PRIORITIES, type CaseStep, type Platform, type Priority, type TestCase } from '../domain/types';
import { Callout, Card, Dialog, Drawer, Empty, Field, formatTime, timeAgo, useToast } from '../components/ui';
import { SessionDialog } from './Capture';

const TABS = [
  { id: 'cases', label: 'Cases' },
  { id: 'suites', label: 'Suites' },
  { id: 'runs', label: 'Runs' },
  { id: 'sessions', label: 'Sessions' },
];

export function TestLab() {
  const { tab = 'runs' } = useParams();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Test Lab</h1>
          <div className="meta">Reusable cases live in suites. A run snapshots case revisions, so editing a case never rewrites history.</div>
        </div>
      </div>
      <nav className="tabs" aria-label="Test Lab views">
        {TABS.map((t) => (
          <Link key={t.id} to={`/test-lab/${t.id}`} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>
      {tab === 'cases' && <Cases />}
      {tab === 'suites' && <Suites />}
      {tab === 'runs' && <Runs />}
      {tab === 'sessions' && <Sessions />}
    </>
  );
}

const useScopeProject = () => {
  const s = useAppState();
  return s.ui.projectId === 'all' ? null : s.ui.projectId;
};

function Cases() {
  const s = useAppState();
  const pid = useScopeProject();
  const [q, setQ] = useState('');
  const [suite, setSuite] = useState('');
  const [editing, setEditing] = useState<TestCase | 'new' | null>(null);
  const [history, setHistory] = useState<TestCase | null>(null);
  const cases = s.cases
    .filter((c) => !pid || c.projectId === pid)
    .filter((c) => !suite || c.suiteId === suite)
    .filter((c) => {
      const r = latestRevision(c);
      return !q || `${r.title} ${r.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase());
    });
  const suites = s.suites.filter((x) => !pid || x.projectId === pid);
  return (
    <>
      <div className="filters">
        <label className="sr-only" htmlFor="c-q">Search cases</label>
        <input id="c-q" className="input grow" type="search" placeholder="Search titles and tags" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="c-suite">Suite</label>
        <select id="c-suite" className="input" value={suite} onChange={(e) => setSuite(e.target.value)}>
          <option value="">All suites</option>
          {suites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> New case</button>
      </div>
      <Card className="flush" title={`${cases.length} case${cases.length === 1 ? '' : 's'}`}>
        {cases.length === 0 ? <Empty title="No cases match" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Title</th><th>Suite</th><th>Priority</th><th>Tags</th><th>Revision</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {cases.map((c) => {
                  const r = latestRevision(c);
                  return (
                    <tr key={c.id}>
                      <td>{r.title}</td>
                      <td className="nowrap">{s.suites.find((x) => x.id === c.suiteId)?.name}</td>
                      <td><span className="badge lav square">{r.priority}</span></td>
                      <td><div className="chips">{r.tags.map((t) => <span key={t} className="badge neutral square">{t}</span>)}</div></td>
                      <td className="nowrap">v{r.rev} <span className="subtle">· {timeAgo(r.editedAt)}</span></td>
                      <td className="nowrap">
                        <button className="icon-btn" aria-label={`Edit ${r.title}`} onClick={() => setEditing(c)}><Pencil size={16} /></button>
                        <button className="icon-btn" aria-label={`Revision history for ${r.title}`} onClick={() => setHistory(c)}><History size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <CaseEditor tc={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {history && (
        <Drawer title="Revision history" subtitle={latestRevision(history).title} onClose={() => setHistory(null)}>
          {[...history.revisions].reverse().map((r) => (
            <div key={r.rev} className="preview stack" style={{ gap: 6 }}>
              <div className="spread"><strong>v{r.rev} · {r.title}</strong><span className="subtle">{formatTime(r.editedAt)} · {personName(s, r.editedBy)}</span></div>
              <div className="subtle">Preconditions: {r.preconditions || '—'}</div>
              <ol style={{ margin: 0, paddingLeft: 20 }}>{r.steps.map((st, i) => <li key={i}>{st.action} <span className="subtle">→ {st.expected}</span></li>)}</ol>
              <div className="subtle">Used by: {s.runs.filter((run) => run.cases.some((c) => c.caseId === history.id && c.revision.rev === r.rev)).map((run) => run.name).join(', ') || 'no runs'}</div>
            </div>
          ))}
        </Drawer>
      )}
    </>
  );
}

function CaseEditor({ tc, onClose }: { tc?: TestCase; onClose: () => void }) {
  const s = useAppState();
  const toast = useToast();
  const pid = tc?.projectId ?? (s.ui.projectId === 'all' ? s.projects[0].id : s.ui.projectId);
  const base = tc ? latestRevision(tc) : undefined;
  const suites = s.suites.filter((x) => x.projectId === pid);
  const [title, setTitle] = useState(base?.title ?? '');
  const [suiteId, setSuiteId] = useState(tc?.suiteId ?? suites[0]?.id ?? '');
  const [pre, setPre] = useState(base?.preconditions ?? '');
  const [priority, setPriority] = useState<Priority>(base?.priority ?? 'P2');
  const [tags, setTags] = useState(base?.tags.join(', ') ?? '');
  const [steps, setSteps] = useState<CaseStep[]>(base?.steps.map((x) => ({ ...x })) ?? [{ action: '', expected: '' }]);
  const [error, setError] = useState('');
  const usedBy = tc ? s.runs.filter((r) => r.cases.some((c) => c.caseId === tc.id)).length : 0;

  const save = () => {
    const clean = steps.filter((x) => x.action.trim());
    if (!title.trim() || !suiteId || !clean.length) return setError('A case needs a title, a suite and at least one step.');
    saveCase({ id: tc?.id, projectId: pid, suiteId, revision: { title: title.trim(), preconditions: pre.trim(), steps: clean, priority, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) } });
    toast(tc ? `Saved as revision v${base!.rev + 1}. Existing runs keep their snapshot.` : 'Case created.');
    onClose();
  };

  return (
    <Drawer title={tc ? 'Edit case' : 'New case'} subtitle={projectName(s, pid)} onClose={onClose}>
      {tc && usedBy > 0 && <Callout>Used by {usedBy} run{usedBy > 1 ? 's' : ''}. Saving creates revision v{base!.rev + 1}; those runs keep the revision they started with.</Callout>}
      <Field label="Title" required>{(p) => <input {...p} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <div className="form-grid fg-2">
        <Field label="Suite" required>{(p) => <select {...p} className="input" value={suiteId} onChange={(e) => setSuiteId(e.target.value)}>{suites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
        <Field label="Priority">{(p) => <select {...p} className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select>}</Field>
      </div>
      <Field label="Preconditions">{(p) => <textarea {...p} className="input" rows={2} value={pre} onChange={(e) => setPre(e.target.value)} />}</Field>
      <Field label="Tags" hint="Comma separated.">{(p) => <input {...p} className="input" value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
      <div className="stack" style={{ gap: 10 }}>
        <span className="label" style={{ fontWeight: 600 }}>Steps</span>
        {steps.map((st, i) => (
          <div key={i} className="preview stack" style={{ gap: 8 }}>
            <div className="spread"><strong>Step {i + 1}</strong><button className="icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => setSteps(steps.filter((_, j) => j !== i))} disabled={steps.length === 1}><Trash2 size={15} /></button></div>
            <label className="field"><span className="sr-only">Step {i + 1} action</span><input className="input" placeholder="Action" value={st.action} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))} /></label>
            <label className="field"><span className="sr-only">Step {i + 1} expected result</span><input className="input" placeholder="Expected result" value={st.expected} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, expected: e.target.value } : x)))} /></label>
          </div>
        ))}
        <div><button className="btn small" onClick={() => setSteps([...steps, { action: '', expected: '' }])}><Plus size={14} aria-hidden /> Add step</button></div>
      </div>
      {error && <span className="error-text" role="alert">{error}</span>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{tc ? 'Save new revision' : 'Create case'}</button>
      </div>
    </Drawer>
  );
}

function Suites() {
  const s = useAppState();
  const pid = useScopeProject();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const suites = s.suites.filter((x) => !pid || x.projectId === pid);
  return (
    <>
      <div className="filters"><button className="btn primary" onClick={() => setOpen(true)} disabled={!pid} title={pid ? undefined : 'Pick a project first'}><Plus size={16} aria-hidden /> New suite</button></div>
      <div className="grid cols-3">
        {suites.map((x) => {
          const n = s.cases.filter((c) => c.suiteId === x.id).length;
          return (
            <Card key={x.id} title={x.name} actions={<span className="badge neutral">{n} case{n === 1 ? '' : 's'}</span>}>
              <p className="muted">{x.description}</p>
              <p className="subtle" style={{ marginTop: 8 }}>{projectName(s, x.projectId)}</p>
            </Card>
          );
        })}
        {suites.length === 0 && <Empty title="No suites yet" />}
      </div>
      {open && pid && (
        <Dialog title="New suite" onClose={() => setOpen(false)}>
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; createSuite(pid, name.trim(), desc.trim()); setOpen(false); setName(''); setDesc(''); }}>
            <Field label="Name" required>{(p) => <input {...p} className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Description">{(p) => <input {...p} className="input" value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={!name.trim()}>Create suite</button></div>
          </form>
        </Dialog>
      )}
    </>
  );
}

function Runs() {
  const s = useAppState();
  const pid = useScopeProject();
  const [open, setOpen] = useState(false);
  const runs = s.runs.filter((r) => !pid || r.projectId === pid);
  const section = (title: string, list: typeof runs) => (
    <Card className="flush" title={title}>
      {list.length === 0 ? <Empty title={`No ${title.toLowerCase()}`} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Run</th><th>Build</th><th>Platforms</th><th>Progress</th><th>Pass rate</th><th>Started</th></tr></thead>
            <tbody>
              {list.map((r) => {
                const p = runProgress(r);
                const pct = p.executionRate === null ? 0 : Math.round(p.executionRate * 100);
                return (
                  <tr key={r.id}>
                    <td><Link to={`/test-lab/runs/${r.id}`}>{r.name}</Link>{r.incompleteAck && <div className="subtle">Completed with {r.incompleteAck.remaining} untested</div>}</td>
                    <td className="nowrap">{projectName(s, r.projectId)} {buildLabel(s, r.buildId)}</td>
                    <td>{r.platforms.join(', ')}</td>
                    <td style={{ minWidth: 160 }}>
                      <div className="subtle">{p.executed} / {p.applicable} executed</div>
                      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.name} execution`}><span style={{ width: `${pct}%` }} /></div>
                    </td>
                    <td className="nowrap">{formatPercent(p.passRate)}</td>
                    <td className="nowrap">{timeAgo(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
  return (
    <div className="stack">
      <div className="filters"><button className="btn primary" onClick={() => setOpen(true)} disabled={!pid} title={pid ? undefined : 'Pick a project first'}><Play size={16} aria-hidden /> Start a run</button></div>
      {section('Active runs', runs.filter((r) => r.status === 'active'))}
      {section('Completed runs', runs.filter((r) => r.status === 'completed'))}
      {open && pid && <NewRunDialog projectId={pid} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NewRunDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const s = useAppState();
  const navigate = useNavigate();
  const builds = s.builds.filter((b) => b.projectId === projectId);
  const suites = s.suites.filter((x) => x.projectId === projectId);
  const [name, setName] = useState('');
  const [buildId, setBuildId] = useState(s.ui.buildId && builds.some((b) => b.id === s.ui.buildId) ? s.ui.buildId : builds.at(-1)?.id ?? '');
  const [platforms, setPlatforms] = useState<Platform[]>(['PC']);
  const [assignees, setAssignees] = useState<string[]>([s.currentUserId]);
  const [suiteIds, setSuiteIds] = useState<string[]>([]);
  const caseIds = s.cases.filter((c) => suiteIds.includes(c.suiteId)).map((c) => c.id);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const valid = name.trim() && buildId && platforms.length && caseIds.length;
  return (
    <Dialog title="Start a run" onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (!valid) return; const id = startRun({ name: name.trim(), projectId, buildId, platforms, assigneeIds: assignees, caseIds }); onClose(); navigate(`/test-lab/runs/${id}`); }}>
        <Field label="Run name" required>{(p) => <input {...p} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Release candidate smoke" />}</Field>
        <Field label="Build" required>{(p) => <select {...p} className="input" value={buildId} onChange={(e) => setBuildId(e.target.value)}>{builds.map((b) => <option key={b.id} value={b.id}>{b.version}</option>)}</select>}</Field>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ fontWeight: 600, marginBottom: 6 }}>Platforms</legend>
          <div className="row">{PLATFORMS.map((p) => <label key={p} className="check"><input type="checkbox" checked={platforms.includes(p)} onChange={() => setPlatforms(toggle(platforms, p))} /> {p}</label>)}</div>
        </fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ fontWeight: 600, marginBottom: 6 }}>Suites ({caseIds.length} cases)</legend>
          <div className="stack" style={{ gap: 6 }}>{suites.map((x) => <label key={x.id} className="check"><input type="checkbox" checked={suiteIds.includes(x.id)} onChange={() => setSuiteIds(toggle(suiteIds, x.id))} /> {x.name} <span className="subtle">({s.cases.filter((c) => c.suiteId === x.id).length})</span></label>)}</div>
        </fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ fontWeight: 600, marginBottom: 6 }}>Assignees</legend>
          <div className="row">{s.people.filter((p) => p.role !== 'viewer').map((p) => <label key={p.id} className="check"><input type="checkbox" checked={assignees.includes(p.id)} onChange={() => setAssignees(toggle(assignees, p.id))} /> {p.name}</label>)}</div>
        </fieldset>
        <Callout>The run stores a copy of each case’s current revision.</Callout>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid}>Start run</button></div>
      </form>
    </Dialog>
  );
}

function Sessions() {
  const s = useAppState();
  const pid = useScopeProject();
  const [open, setOpen] = useState(false);
  const sessions = s.sessions.filter((x) => !pid || x.projectId === pid);
  return (
    <>
      <div className="filters"><button className="btn primary" onClick={() => setOpen(true)} disabled={!pid}><Play size={16} aria-hidden /> Start a session</button></div>
      <Card className="flush" title="Testing sessions">
        {sessions.length === 0 ? <Empty title="No sessions yet" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Session</th><th>Build</th><th>Platform</th><th>Owner</th><th>Thread</th><th>Findings</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {sessions.map((x) => (
                  <tr key={x.id}>
                    <td>{x.title}{x.runId && <div className="subtle">Run: <Link to={`/test-lab/runs/${x.runId}`}>{s.runs.find((r) => r.id === x.runId)?.name}</Link></div>}</td>
                    <td className="nowrap">{projectName(s, x.projectId)} {buildLabel(s, x.buildId)}</td>
                    <td>{x.platform}</td>
                    <td className="nowrap">{personName(s, x.ownerId)}</td>
                    <td className="nowrap subtle">{x.threadTs ? `${x.channel} thread` : 'Pending delivery'}</td>
                    <td>{s.findings.filter((f) => f.sessionId === x.id).length}</td>
                    <td>{x.status === 'open' ? <span className="badge good">Open</span> : <span className="badge neutral">Closed {x.closedAt && timeAgo(x.closedAt)}</span>}</td>
                    <td>{x.status === 'open' && <button className="btn small" onClick={() => closeSession(x.id)}>Close</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="hint" style={{ marginTop: 8 }}>Closing a session stops new submissions to it in QA Workspace. It does not lock the chat thread itself.</p>
      {open && pid && <SessionDialog projectId={pid} onClose={() => setOpen(false)} onCreated={() => setOpen(false)} />}
    </>
  );
}
