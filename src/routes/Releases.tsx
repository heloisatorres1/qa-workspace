import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, MessageSquare, Plus, Save, Send, Trash2, XCircle } from 'lucide-react';
import { useAppState } from '../data/state';
import { liveEvidence, retryJob, saveDecision, sendReleaseMessage, updateReleaseDraft } from '../data/actions';
import { buildLabel, currentRelease, personName, projectName } from '../data/selectors';
import { formatPercent, runMetrics } from '../domain/metrics';
import { RECOMMENDATION_LABEL, evidenceChanged, releaseMessage, validateDecision, type DecisionDraft } from '../domain/release';
import { SEVERITY_LABEL } from '../domain/format';
import { isOpen } from '../domain/findings';
import { SEVERITIES, type EvidenceSnapshot, type Recommendation } from '../domain/types';
import { Callout, Card, Dialog, Empty, JobBadge, RESULT_COLOR, RecommendationBadge, SeverityBadge, formatTime, timeAgo, useToast , ChatText } from '../components/ui';

type Stage = 'evidence' | 'decision' | 'message';
const EMPTY_DRAFT: DecisionDraft = { checklist: { smokeLinked: false, blockersReviewed: false, risksAccepted: false }, rationale: '', risks: [] };

export function Releases() {
  const s = useAppState();
  const { releaseId } = useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('decision');
  const release = s.releases.find((r) => r.id === releaseId) ?? currentRelease(s);
  if (!release) return <Empty title="No releases for this project yet" />;
  const build = s.builds.find((b) => b.id === release.buildId)!;
  const projectReleases = s.releases.filter((r) => r.projectId === release.projectId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Release readiness</h1>
          <div className="meta">
            {projectName(s, release.projectId)} · Build {build.version}
            <span className="badge lav">{release.type === 'hotfix' ? 'Hotfix' : 'Release'}</span>
            <span className="subtle">{release.environment}</span>
          </div>
        </div>
        <label className="row">
          <span className="subtle">Release</span>
          <select className="input" style={{ width: 'auto' }} value={release.id} onChange={(e) => navigate(`/releases/${e.target.value}`)}>
            {projectReleases.map((r) => <option key={r.id} value={r.id}>{buildLabel(s, r.buildId)} · {r.type}</option>)}
          </select>
        </label>
      </div>
      <div className="tabs" role="tablist" aria-label="Release stages">
        {(['evidence', 'decision', 'message'] as Stage[]).map((x) => (
          <button key={x} role="tab" aria-selected={stage === x} onClick={() => setStage(x)}>{x[0].toUpperCase() + x.slice(1)}</button>
        ))}
      </div>
      {stage === 'evidence' && <EvidenceStage releaseId={release.id} />}
      {stage === 'decision' && <DecisionStage releaseId={release.id} onReview={() => setStage('message')} />}
      {stage === 'message' && <MessageStage releaseId={release.id} />}
    </>
  );
}

function EvidenceSnapshotCard({ e, title = 'Evidence snapshot', note }: { e: EvidenceSnapshot; title?: string; note?: string }) {
  const m = runMetrics(e.counts);
  const tiles = [
    { k: 'passed' as const, label: 'Passed', icon: <CheckCircle2 size={16} color="var(--green)" aria-hidden /> },
    { k: 'failed' as const, label: 'Failed', icon: <XCircle size={16} color="var(--red)" aria-hidden /> },
    { k: 'blocked' as const, label: 'Blocked', icon: <CircleSlash size={16} color="var(--amber-dot)" aria-hidden /> },
    { k: 'untested' as const, label: 'Untested', icon: <CircleDashed size={16} color="var(--ink-3)" aria-hidden /> },
  ];
  const pct = (n: number) => (m.applicable ? (n / m.applicable) * 100 : 0);
  return (
    <Card title={title} actions={note ? <span className="subtle">{note}</span> : undefined}>
      <div className="grid cols-4" style={{ gap: 8, marginBottom: 16 }}>
        {tiles.map((t) => (
          <div key={t.k} className="count-tile">
            <div className="row subtle" style={{ gap: 6, color: 'var(--ink)' }}>{t.icon}{t.label}</div>
            <div className="n">{e.counts[t.k]}</div>
          </div>
        ))}
      </div>
      <div className="stacked-bar" role="img" aria-label={tiles.map((t) => `${t.label} ${e.counts[t.k]}`).join(', ')}>
        {tiles.map((t) => e.counts[t.k] > 0 && (
          <span key={t.k} style={{ flex: e.counts[t.k], background: RESULT_COLOR[t.k], color: t.k === 'passed' ? 'var(--on-passed)' : 'var(--ink)' }}>
            {pct(e.counts[t.k]) >= 12 ? `${pct(e.counts[t.k]).toFixed(1)}%` : ''}
          </span>
        ))}
      </div>
      <h3 style={{ marginTop: 16, fontSize: 20 }}>{e.counts.passed} / {m.applicable} passed</h3>
      <p className="muted">{formatPercent(m.passRate)} pass rate · {formatPercent(m.executionRate)} executed{e.counts.blocked ? ` · ${e.counts.blocked} blocked (unresolved)` : ''}</p>
      <p className="subtle" style={{ marginTop: 6 }}>Runs: {e.runSources.map((r) => r.name).join(', ') || 'none linked'} · captured {formatTime(e.capturedAt)}</p>
    </Card>
  );
}

function RiskTable({ e, projectId, compact }: { e: EvidenceSnapshot; projectId: string; compact?: boolean }) {
  const s = useAppState();
  const open = s.findings.filter((f) => f.type === 'bug' && f.projectId === projectId && isOpen(f) && !f.duplicateOf);
  return (
    <Card title="Open risk review" className="flush">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Severity</th><th>Open count</th><th>Examples</th></tr></thead>
          <tbody>
            {SEVERITIES.map((sev) => (
              <tr key={sev}>
                <td><SeverityBadge value={sev} /></td>
                <td><strong>{e.openBySeverity[sev]}</strong></td>
                <td className="subtle">{compact ? <div className="chips">{open.filter((f) => f.severity === sev).slice(0, 4).map((f) => <Link key={f.id} to={`/triage/${f.id}`}>{f.id}</Link>)}</div> : open.filter((f) => f.severity === sev).slice(0, 2).map((f) => <div key={f.id}><Link to={`/triage/${f.id}`}>{f.id}</Link> {f.title}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EvidenceStage({ releaseId }: { releaseId: string }) {
  const s = useAppState();
  const rel = s.releases.find((r) => r.id === releaseId)!;
  const live = liveEvidence(s, releaseId);
  const runs = s.runs.filter((r) => rel.runIds.includes(r.id));
  return (
    <div className="grid cols-main-side">
      <div className="stack">
        <EvidenceSnapshotCard e={live} title="Live evidence" note="Updates as runs and bugs change" />
        <RiskTable e={live} projectId={rel.projectId} />
      </div>
      <div className="stack">
        <Card title="Linked runs">
          {runs.length === 0 ? <Empty title="No runs linked" /> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
              {runs.map((r) => (
                <li key={r.id} className="spread">
                  <Link to={`/test-lab/runs/${r.id}`}>{r.name}</Link>
                  <span className={`badge ${r.status === 'active' ? 'teal' : 'neutral'}`}>{r.status === 'active' ? 'Active' : 'Completed'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Blockers">
          {live.blockers.length === 0 ? <Callout tone="good">No open critical bugs.</Callout> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>{live.blockers.map((b) => <li key={b.id}><Link to={`/triage/${b.id}`}>{b.id}</Link> {b.title}</li>)}</ul>
          )}
        </Card>
        <Card title="Decision history">
          {rel.revisions.length === 0 ? <p className="subtle">No decision saved yet.</p> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
              {[...rel.revisions].reverse().map((r) => (
                <li key={r.rev} className="spread">
                  <span>Revision {r.rev} · {personName(s, r.authorId)} · {timeAgo(r.savedAt)}</span>
                  <RecommendationBadge value={r.recommendation} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function DecisionStage({ releaseId, onReview }: { releaseId: string; onReview: () => void }) {
  const s = useAppState();
  const toast = useToast();
  const rel = s.releases.find((r) => r.id === releaseId)!;
  const draft = s.ui.releaseDrafts[releaseId] ?? EMPTY_DRAFT;
  const live = liveEvidence(s, releaseId);
  const [errors, setErrors] = useState<string[]>([]);
  const set = (patch: Partial<DecisionDraft>) => { updateReleaseDraft(releaseId, patch); setErrors([]); };
  const project = projectName(s, rel.projectId);
  const build = s.builds.find((b) => b.id === rel.buildId)!;
  const buildText = `${build.version}${rel.type === 'hotfix' ? ' (Hotfix)' : ''}`;
  const smokeRun = s.runs.find((r) => rel.runIds.includes(r.id) && /smoke/i.test(r.name));
  const blockers = live.blockers;
  const openBugs = s.findings.filter((f) => f.type === 'bug' && f.projectId === rel.projectId && isOpen(f) && !f.duplicateOf);
  const options: { v: Recommendation; d: string; disabled?: boolean }[] = [
    { v: 'ready', d: blockers.length ? 'Unavailable while critical bugs are unresolved.' : 'Meets release criteria. No known blocker risks.', disabled: blockers.length > 0 },
    { v: 'ready_with_risks', d: 'Accept known, tracked risks and release. Each risk needs a rationale and an owner.' },
    { v: 'hold', d: 'Do not release. Resolve blockers or re-evaluate.' },
  ];
  const preview = draft.recommendation ? releaseMessage({ recommendation: draft.recommendation, projectName: project, buildLabel: buildText, evidence: live, rationale: draft.rationale || '(rationale)', risks: draft.risks }) : null;

  const save = () => {
    const errs = validateDecision(draft, live);
    if (errs.length) return setErrors(errs);
    const res = saveDecision(releaseId);
    if (!res.ok) return setErrors(res.errors);
    toast(`Decision saved as revision ${res.rev}. Evidence is frozen with it.`);
  };

  return (
    <div className="grid cols-3">
      <div className="stack">
        <EvidenceSnapshotCard e={live} />
        <RiskTable e={live} projectId={rel.projectId} compact />
      </div>

      <Card>
        <div className="stack">
          {blockers.length > 0 && <Callout tone="warn"><strong>{blockers.length} critical bug{blockers.length > 1 ? 's' : ''} unresolved</strong></Callout>}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
            <legend><h2 style={{ marginBottom: 10 }}>QA recommendation</h2></legend>
            {options.map((o) => (
              <label key={o.v} className={`choice ${draft.recommendation === o.v ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}`}>
                <input type="radio" name="rec" disabled={o.disabled} checked={draft.recommendation === o.v} onChange={() => set({ recommendation: o.v })} />
                <span><strong>{RECOMMENDATION_LABEL[o.v]}</strong><div className="subtle">{o.d}</div></span>
              </label>
            ))}
          </fieldset>

          {draft.recommendation === 'ready_with_risks' && (
            <div className="stack" style={{ gap: 8 }}>
              <h3>Accepted risks</h3>
              {draft.risks.map((r, i) => (
                <div key={i} className="preview stack" style={{ gap: 6 }}>
                  <div className="spread">
                    <label className="row"><span className="sr-only">Bug</span>
                      <select className="input" value={r.findingId} onChange={(e) => set({ risks: draft.risks.map((x, j) => (j === i ? { ...x, findingId: e.target.value } : x)) })}>
                        {openBugs.map((b) => <option key={b.id} value={b.id}>{b.id} · {SEVERITY_LABEL[b.severity!]}</option>)}
                      </select>
                    </label>
                    <button className="icon-btn" aria-label="Remove risk" onClick={() => set({ risks: draft.risks.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                  </div>
                  <label className="field"><span className="sr-only">Risk owner</span>
                    <select className="input" value={r.ownerId} onChange={(e) => set({ risks: draft.risks.map((x, j) => (j === i ? { ...x, ownerId: e.target.value } : x)) })}>
                      <option value="">Risk owner…</option>
                      {s.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="field"><span className="sr-only">Why this risk is acceptable</span>
                    <input className="input" placeholder="Why is this acceptable?" value={r.rationale} onChange={(e) => set({ risks: draft.risks.map((x, j) => (j === i ? { ...x, rationale: e.target.value } : x)) })} />
                  </label>
                </div>
              ))}
              <div><button className="btn small" onClick={() => set({ risks: [...draft.risks, { findingId: blockers[0]?.id ?? openBugs[0]?.id ?? '', ownerId: '', rationale: '' }] })}><Plus size={14} aria-hidden /> Add accepted risk</button></div>
            </div>
          )}

          <div>
            <h2 style={{ marginBottom: 8 }}>Decision checklist</h2>
            <div className="stack" style={{ gap: 10 }}>
              <label className="check" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={draft.checklist.smokeLinked} onChange={(e) => set({ checklist: { ...draft.checklist, smokeLinked: e.target.checked } })} />
                <span><strong>Smoke run linked</strong><div className="subtle">{smokeRun ? <Link to={`/test-lab/runs/${smokeRun.id}`}>{smokeRun.name}</Link> : 'No smoke run linked to this release.'}</div></span>
              </label>
              <label className="check" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={draft.checklist.blockersReviewed} onChange={(e) => set({ checklist: { ...draft.checklist, blockersReviewed: e.target.checked } })} />
                <span><strong>Blockers reviewed</strong><div className="subtle">All blocker and critical issues are reviewed.</div></span>
              </label>
              <label className="check" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={draft.checklist.risksAccepted} onChange={(e) => set({ checklist: { ...draft.checklist, risksAccepted: e.target.checked } })} />
                <span><strong>Risks accepted</strong><div className="subtle">Known risks are documented and accepted (if applicable).</div></span>
              </label>
            </div>
          </div>
          <label className="field"><span className="label" style={{ fontSize: 17 }}>Rationale</span>
            <textarea className="input" rows={3} value={draft.rationale} onChange={(e) => set({ rationale: e.target.value })} />
          </label>
          {errors.length > 0 && <Callout tone="bad"><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((x) => <li key={x}>{x}</li>)}</ul></Callout>}
        </div>
      </Card>

      <Card title="Message preview">
        <div className="stack">
          <div className="row"><MessageSquare size={18} aria-hidden /><strong>{s.settings.releaseChannel}</strong></div>
          {preview ? <div className="chat-msg"><ChatText text={preview} /></div> : <Empty title="Choose a recommendation">The message is built from your decision and the evidence. Nothing is approved automatically.</Empty>}
          <div className="status-line"><CircleDashed size={16} aria-hidden /> Draft (not sent)</div>
          <div className="row">
            <button className="btn primary" onClick={save}><Save size={16} aria-hidden /> Save decision</button>
            <button className="btn outline" onClick={onReview} disabled={!rel.revisions.length}><MessageSquare size={16} aria-hidden /> Review message</button>
          </div>
          <p className="hint">Saving freezes the evidence, decision and message as a new revision. The QA recommendation is separate from business release approval.</p>
        </div>
      </Card>
    </div>
  );
}

function MessageStage({ releaseId }: { releaseId: string }) {
  const s = useAppState();
  const toast = useToast();
  const rel = s.releases.find((r) => r.id === releaseId)!;
  const [revNo, setRevNo] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const rev = rel.revisions.find((r) => r.rev === revNo) ?? rel.revisions.at(-1);
  if (!rev) return <Card><Empty title="No saved decision yet">Save a decision first. Only saved revisions can be sent.</Empty></Card>;
  const live = liveEvidence(s, releaseId);
  const changed = evidenceChanged(rev.evidence, live);
  const job = rev.sentJobId ? s.jobs.find((j) => j.id === rev.sentJobId) : undefined;
  return (
    <div className="grid cols-main-side">
      <Card title={`Revision ${rev.rev}`} actions={rel.revisions.length > 1 && (
        <label className="row"><span className="subtle">Revision</span>
          <select className="input" style={{ width: 'auto' }} value={rev.rev} onChange={(e) => setRevNo(Number(e.target.value))}>
            {[...rel.revisions].reverse().map((r) => <option key={r.rev} value={r.rev}>{r.rev} · {RECOMMENDATION_LABEL[r.recommendation]}</option>)}
          </select>
        </label>
      )}>
        <div className="stack">
          {changed && <Callout tone="warn"><AlertTriangle size={14} aria-hidden /> Evidence has changed since this revision was saved. The saved message below is unchanged; save a new revision in Decision to include the new evidence.</Callout>}
          <dl className="kv">
            <dt>Recommendation</dt><dd><RecommendationBadge value={rev.recommendation} /></dd>
            <dt>Author</dt><dd>{personName(s, rev.authorId)}</dd>
            <dt>Saved</dt><dd>{formatTime(rev.savedAt)}</dd>
            <dt>Evidence captured</dt><dd>{formatTime(rev.evidence.capturedAt)}</dd>
            <dt>Destination</dt><dd>Team chat / {rev.channel} (new channel message)</dd>
            {rev.risks.length > 0 && <><dt>Accepted risks</dt><dd>{rev.risks.map((r) => `${r.findingId} (owner ${personName(s, r.ownerId)}: ${r.rationale})`).join('; ')}</dd></>}
          </dl>
          <div className="chat-msg"><ChatText text={rev.message} /></div>
        </div>
      </Card>
      <Card title="Send">
        <div className="stack">
          {job ? (
            <>
              <div className="spread"><span>Delivery</span><JobBadge job={job} /></div>
              {job.attempts.map((a, i) => <p key={i} className="subtle">{formatTime(a.at)} · {a.detail}</p>)}
              {(job.status === 'failed' || job.status === 'unknown') && <button className="btn outline" onClick={() => void retryJob(job.id)}>Retry delivery</button>}
            </>
          ) : (
            <>
              <p className="muted">Sending posts exactly the message on the left. It will not change afterwards.</p>
              <button className="btn primary" onClick={() => setConfirming(true)}><Send size={16} aria-hidden /> Send to {rev.channel}</button>
            </>
          )}
        </div>
      </Card>
      {confirming && (
        <Dialog title="Send release message?" onClose={() => setConfirming(false)}>
          <div className="stack">
            <p>Revision {rev.rev} · {RECOMMENDATION_LABEL[rev.recommendation]} → <strong>{rev.channel}</strong></p>
            <div className="chat-msg"><ChatText text={rev.message} /></div>
            <Callout>Demo mode: this goes to the mock chat adapter only.</Callout>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirming(false)}>Cancel</button>
              <button className="btn primary" autoFocus onClick={() => { sendReleaseMessage(releaseId, rev.rev); setConfirming(false); toast('Queued for delivery.'); }}>Send</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
