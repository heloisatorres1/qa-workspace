import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bug, CheckCircle2 } from 'lucide-react';
import { useAppState } from '../data/state';
import { bugFromResult, completeRun, recordResult } from '../data/actions';
import { buildLabel, personName, projectName } from '../data/selectors';
import { currentResult, formatPercent } from '../domain/metrics';
import { latestRevision, remainingWork, runProgress } from '../domain/runs';
import { RESULTS, type ResultValue, type RunCaseSnapshot } from '../domain/types';
import { Callout, Card, Dialog, Drawer, Empty, RESULT_COLOR, RESULT_LABEL, ResultBadge, formatTime, useToast } from '../components/ui';

export function RunDetail() {
  const { runId } = useParams();
  const s = useAppState();
  const run = s.runs.find((r) => r.id === runId);
  const [filter, setFilter] = useState<ResultValue | ''>('');
  const [suite, setSuite] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  if (!run) return <Empty title="Run not found"><Link to="/test-lab/runs">Back to runs</Link></Empty>;
  const p = runProgress(run);
  const suites = [...new Set(run.cases.map((c) => c.suiteId))];
  const rows = run.cases.filter((c) => (!filter || currentResult(c) === filter) && (!suite || c.suiteId === suite));
  const sel = run.cases.find((c) => c.caseId === selected);

  return (
    <>
      <Link to="/test-lab/runs" className="link-btn" style={{ marginBottom: 12 }}><ArrowLeft size={16} aria-hidden /> All runs</Link>
      <div className="page-head">
        <div>
          <h1>{run.name}</h1>
          <div className="meta">{projectName(s, run.projectId)} · Build {buildLabel(s, run.buildId)} · {run.platforms.join(', ')} · started {formatTime(run.createdAt)}</div>
        </div>
        {run.status === 'active' ? (
          <button className="btn primary" onClick={() => setCompleting(true)}><CheckCircle2 size={16} aria-hidden /> Complete run</button>
        ) : (
          <span className="badge neutral">Completed {run.completedAt && formatTime(run.completedAt)}</span>
        )}
      </div>
      {run.incompleteAck && <div style={{ marginBottom: 16 }}><Callout tone="warn">Completed with {run.incompleteAck.remaining} untested case{run.incompleteAck.remaining > 1 ? 's' : ''}. Reason: {run.incompleteAck.reason}</Callout></div>}

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        {(['passed', 'failed', 'blocked', 'untested'] as const).map((k) => (
          <button key={k} className="card count-tile" style={{ textAlign: 'left', cursor: 'pointer', borderColor: filter === k ? 'var(--teal)' : undefined }} onClick={() => setFilter(filter === k ? '' : k)} aria-pressed={filter === k}>
            <ResultBadge value={k} />
            <div className="n">{p.counts[k]}</div>
          </button>
        ))}
      </div>
      <Card title="Execution" actions={<span className="subtle">{p.executed} / {p.applicable} executed · {formatPercent(p.executionRate)} · pass rate {formatPercent(p.passRate)}{p.counts.na ? ` · ${p.counts.na} not applicable` : ''}</span>}>
        <div className="stacked-bar" role="img" aria-label={`Passed ${p.counts.passed}, failed ${p.counts.failed}, blocked ${p.counts.blocked}, untested ${p.counts.untested}`}>
          {(['passed', 'failed', 'blocked', 'untested'] as const).map((k) => p.counts[k] > 0 && <span key={k} style={{ flex: p.counts[k], background: RESULT_COLOR[k] }} />)}
        </div>
      </Card>

      <div className="filters" style={{ marginTop: 20 }}>
        <label className="sr-only" htmlFor="r-suite">Suite</label>
        <select id="r-suite" className="input" value={suite} onChange={(e) => setSuite(e.target.value)}>
          <option value="">All suites</option>
          {suites.map((id) => <option key={id} value={id}>{s.suites.find((x) => x.id === id)?.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="r-res">Result</label>
        <select id="r-res" className="input" value={filter} onChange={(e) => setFilter(e.target.value as ResultValue | '')}>
          <option value="">All results</option>
          {RESULTS.map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
        </select>
      </div>
      <Card className="flush" title={`${rows.length} case${rows.length === 1 ? '' : 's'}`}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Case</th><th>Suite</th><th>Assignee</th><th>Result</th><th>Attempts</th><th>Linked bugs</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const last = c.attempts.at(-1);
                const live = s.cases.find((x) => x.id === c.caseId);
                const newer = live && latestRevision(live).rev > c.revision.rev;
                return (
                  <tr key={c.caseId} className={`clickable ${selected === c.caseId ? 'selected' : ''}`} onClick={() => setSelected(c.caseId)}>
                    <td>
                      <button className="link-btn" style={{ color: 'var(--ink)', fontWeight: 500, textAlign: 'left' }} onClick={(e) => { e.stopPropagation(); setSelected(c.caseId); }}>{c.revision.title}</button>
                      <div className="subtle">v{c.revision.rev}{newer && ' · newer revision exists'}</div>
                    </td>
                    <td className="nowrap">{s.suites.find((x) => x.id === c.suiteId)?.name}</td>
                    <td className="nowrap">{personName(s, c.assigneeId)}</td>
                    <td><ResultBadge value={currentResult(c)} /></td>
                    <td>{c.attempts.length}</td>
                    <td><div className="chips">{last?.findingIds.map((id) => <Link key={id} to={`/triage/${id}`} onClick={(e) => e.stopPropagation()}>{id}</Link>)}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {sel && <ResultDrawer runId={run.id} snap={sel} active={run.status === 'active'} onClose={() => setSelected(null)} />}
      {completing && <CompleteDialog runId={run.id} remaining={remainingWork(run)} onClose={() => setCompleting(false)} />}
    </>
  );
}

function ResultDrawer({ runId, snap, active, onClose }: { runId: string; snap: RunCaseSnapshot; active: boolean; onClose: () => void }) {
  const s = useAppState();
  const toast = useToast();
  const navigate = useNavigate();
  const [result, setResult] = useState<ResultValue>(currentResult(snap) === 'untested' ? 'passed' : currentResult(snap));
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState('');
  const [link, setLink] = useState('');
  const cur = currentResult(snap);
  const r = snap.revision;
  return (
    <Drawer title={r.title} subtitle={`Snapshot of revision v${r.rev} · current result: ${RESULT_LABEL[cur]}`} onClose={onClose}>
      <div className="subtle">Preconditions: {r.preconditions || '—'}</div>
      <ol style={{ margin: 0, paddingLeft: 20 }} className="stack">
        {r.steps.map((st, i) => <li key={i}><div>{st.action}</div><div className="subtle">Expected: {st.expected}</div></li>)}
      </ol>
      {active ? (
        <form className="stack preview" onSubmit={(e) => {
          e.preventDefault();
          if ((result === 'failed' || result === 'blocked') && !notes.trim()) return toast('Add a note explaining the failure or blocker.');
          recordResult(runId, snap.caseId, result, notes.trim(), evidence.trim(), link.trim() ? link.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) : []);
          toast(`${RESULT_LABEL[result]} recorded${snap.attempts.length ? ' as a new attempt' : ''}.`);
          setNotes(''); setEvidence(''); setLink('');
        }}>
          <h3>{snap.attempts.length ? 'Record a retest' : 'Record result'}</h3>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Result</legend>
            <div className="row">{RESULTS.filter((x) => x !== 'untested').map((x) => <label key={x} className="check"><input type="radio" name="result" checked={result === x} onChange={() => setResult(x)} /> {RESULT_LABEL[x]}</label>)}</div>
          </fieldset>
          <label className="field"><span className="label">Notes {(result === 'failed' || result === 'blocked') && <span className="req">*</span>}</span><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <label className="field"><span className="label">Evidence</span><input className="input" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Video name, log reference…" /></label>
          <label className="field"><span className="label">Link existing bugs</span><input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="CP-104, CP-109" /></label>
          <div className="row"><button className="btn primary">Save result</button></div>
        </form>
      ) : <Callout>This run is completed. Results are read-only.</Callout>}
      {active && cur === 'failed' && (
        <div>
          <button className="btn outline" onClick={() => { bugFromResult(runId, snap.caseId); navigate('/capture'); }}><Bug size={16} aria-hidden /> Report a bug from this failure</button>
          <p className="hint" style={{ marginTop: 6 }}>Opens Capture with the steps prefilled. The new bug is linked back to this result when submitted.</p>
        </div>
      )}
      <div className="stack" style={{ gap: 8 }}>
        <h3>History</h3>
        {snap.attempts.length === 0 ? <p className="subtle">No results yet.</p> : [...snap.attempts].reverse().map((a, i) => (
          <div key={i} className="preview">
            <div className="spread"><ResultBadge value={a.result} /><span className="subtle">{formatTime(a.at)} · {personName(s, a.testerId)}</span></div>
            {a.notes && <p style={{ marginTop: 6 }}>{a.notes}</p>}
            {a.evidence && <p className="subtle">Evidence: {a.evidence}</p>}
            {a.findingIds.length > 0 && <p className="subtle">Bugs: {a.findingIds.map((id) => <Link key={id} to={`/triage/${id}`} style={{ marginRight: 6 }}>{id}</Link>)}</p>}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

function CompleteDialog({ runId, remaining, onClose }: { runId: string; remaining: number; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  return (
    <Dialog title="Complete this run?" onClose={onClose}>
      <form className="stack" onSubmit={(e) => {
        e.preventDefault();
        try {
          completeRun(runId, remaining ? reason : undefined);
          toast('Run completed.');
          onClose();
        } catch (err) {
          toast((err as Error).message);
        }
      }}>
        {remaining > 0 ? (
          <>
            <Callout tone="warn">{remaining} case{remaining > 1 ? 's are' : ' is'} still untested. They stay untested; nothing is marked as passed.</Callout>
            <label className="field"><span className="label">Reason <span className="req">*</span></span><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Devices unavailable; remaining cases moved to the next run." /></label>
            <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand the remaining work will be recorded as untested.</label>
          </>
        ) : <p>All cases have a result. Completing makes the run read-only.</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={remaining > 0 && (!reason.trim() || !ack)}>Complete run</button>
        </div>
      </form>
    </Dialog>
  );
}
