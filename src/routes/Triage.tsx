import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bug, CircleHelp, Download, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { useAppState } from '../data/state';
import {
  answerQuestion,
  convertQuestionToBug,
  discardLedger,
  fetchDigestData,
  prepareDigest,
  sendDigest,
  setFaults,
  typeLabel,
  updateFinding,
} from '../data/actions';
import { buildLabel, jobsForFinding, personName, projectName, scopedFindings } from '../data/selectors';
import { isAwaitingAnswer, isOpen } from '../domain/findings';
import { SEVERITY_LABEL } from '../domain/format';
import { buildDigest, ledgerDone, type FetchResult } from '../domain/digest';
import { PRIORITIES, SEVERITIES, type Finding, type FindingStatus } from '../domain/types';
import { Callout, Card, Drawer, Empty, SafeLink, SeverityBadge, STATUS_LABEL, StatusBadge, formatTime, timeAgo, useToast , ChatText } from '../components/ui';
import { JobRow } from './Capture';

const TYPE_ICON = { bug: Bug, feedback: MessageSquare, question: CircleHelp };

export function Triage({ tab }: { tab?: 'digest' }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Triage</h1>
          <div className="meta">Review findings: confirm severity, set priority, assign owners, link duplicates and chase open questions.</div>
        </div>
      </div>
      <nav className="tabs" aria-label="Triage views">
        <Link to="/triage" className={tab !== 'digest' ? 'active' : ''} aria-current={tab !== 'digest' ? 'page' : undefined}>Findings</Link>
        <Link to="/triage/digest" className={tab === 'digest' ? 'active' : ''} aria-current={tab === 'digest' ? 'page' : undefined}>Bug digest</Link>
      </nav>
      {tab === 'digest' ? <DigestView /> : <FindingsView />}
    </>
  );
}

type StatusFilter = 'active' | 'all' | FindingStatus;

function FindingsView() {
  const s = useAppState();
  const [params, setParams] = useSearchParams();
  const { findingId } = useParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const severity = params.get('severity') ?? '';
  const status = (params.get('status') ?? 'active') as StatusFilter;
  const owner = params.get('owner') ?? '';
  const build = params.get('build') ?? '';
  const awaiting = params.get('awaiting') === '1';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const all = scopedFindings(s);
  const rows = all
    .filter((f) => (status === 'active' ? isOpen(f) : status === 'all' ? true : f.status === status))
    .filter((f) => !type || f.type === type)
    .filter((f) => !severity || f.severity === severity)
    .filter((f) => !owner || f.ownerId === owner)
    .filter((f) => !build || f.buildId === build)
    .filter((f) => !awaiting || isAwaitingAnswer(f))
    .filter((f) => !q || `${f.id} ${f.title} ${f.question ?? ''} ${f.observation ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (SEVERITIES.indexOf(a.severity ?? 'low') - SEVERITIES.indexOf(b.severity ?? 'low')) || b.updatedAt.localeCompare(a.updatedAt));
  const unanswered = all.filter(isAwaitingAnswer);
  const builds = s.builds.filter((b) => s.ui.projectId === 'all' || b.projectId === s.ui.projectId);
  const selected = findingId ? s.findings.find((f) => f.id === findingId) : undefined;

  return (
    <>
      {unanswered.length > 0 && !awaiting && (
        <div style={{ marginBottom: 16 }}>
          <Callout>
            {unanswered.length} question{unanswered.length > 1 ? 's are' : ' is'} waiting for an answer.{' '}
            <button className="link-btn" onClick={() => setParams({ type: 'question', awaiting: '1' })}>Show them</button>
          </Callout>
        </div>
      )}
      <div className="filters" role="group" aria-label="Filters">
        <label className="sr-only" htmlFor="f-q">Search findings</label>
        <input id="f-q" className="input grow" type="search" placeholder="Search by ID or text" value={q} onChange={(e) => setParam('q', e.target.value)} />
        <Select id="f-type" label="Type" value={type} onChange={(v) => setParam('type', v)} options={[['', 'All types'], ['bug', 'Bugs'], ['feedback', 'Feedback'], ['question', 'Questions']]} />
        <Select id="f-sev" label="Severity" value={severity} onChange={(v) => setParam('severity', v)} options={[['', 'Any severity'], ...SEVERITIES.map((x) => [x, SEVERITY_LABEL[x]] as [string, string])]} />
        <Select id="f-status" label="Status" value={status} onChange={(v) => setParam('status', v === 'active' ? '' : v)} options={[['active', 'Open + in progress'], ['all', 'Any status'], ...(['draft', 'open', 'in_progress', 'resolved', 'closed'] as FindingStatus[]).map((x) => [x, STATUS_LABEL[x]] as [string, string])]} />
        <Select id="f-build" label="Build" value={build} onChange={(v) => setParam('build', v)} options={[['', 'Any build'], ...builds.map((b) => [b.id, `${projectName(s, b.projectId)} ${b.version}`] as [string, string])]} />
        <Select id="f-owner" label="Owner" value={owner} onChange={(v) => setParam('owner', v)} options={[['', 'Any owner'], ...s.people.map((p) => [p.id, p.name] as [string, string])]} />
        {awaiting && <button className="btn small" onClick={() => setParam('awaiting', '')}>Awaiting answers ✕</button>}
        {(q || type || severity || owner || build || awaiting || status !== 'active') && <button className="btn ghost small" onClick={() => setParams({}, { replace: true })}>Reset filters</button>}
      </div>
      <Card className="flush" title={`${rows.length} finding${rows.length === 1 ? '' : 's'}`} actions={<span className="subtle">{s.ui.projectId === 'all' ? 'All projects' : projectName(s, s.ui.projectId)} · tracker synced {timeAgo(s.settings.lastSyncAt)}</span>}>
        {rows.length === 0 ? (
          <Empty title="No findings match these filters" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>ID</th><th>Finding</th><th>Severity</th><th>Priority</th><th>Status</th><th>Owner</th><th>Source</th></tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const Icon = TYPE_ICON[f.type];
                  return (
                    <tr key={f.id} className={`clickable ${f.id === findingId ? 'selected' : ''}`} onClick={() => navigate(`/triage/${f.id}?${params}`)}>
                      <td className="nowrap"><Link to={`/triage/${f.id}?${params}`} onClick={(e) => e.stopPropagation()}>{f.id}</Link></td>
                      <td>
                        <span className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                          <Icon size={16} aria-label={typeLabel(f.type)} style={{ flex: 'none', marginTop: 3, color: 'var(--ink-3)' }} />
                          <span>
                            {f.title}
                            {f.duplicateOf && <span className="subtle"> · duplicate of {f.duplicateOf}</span>}
                            {isAwaitingAnswer(f) && <span className="badge warn" style={{ marginLeft: 6 }}>Awaiting answer</span>}
                          </span>
                        </span>
                      </td>
                      <td>{f.type === 'bug' ? <SeverityBadge value={f.severity} /> : <span className="subtle">—</span>}</td>
                      <td>{f.priority ? <span className="badge lav square">{f.priority}</span> : <span className="subtle">—</span>}</td>
                      <td><StatusBadge value={f.status} /></td>
                      <td className="nowrap">{personName(s, f.ownerId)}</td>
                      <td className="nowrap subtle">{f.external ? `${f.external.externalId} · ${timeAgo(f.external.syncedAt)}` : 'QA Workspace'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {selected && <FindingDrawer f={selected} onClose={() => navigate(`/triage?${params}`)} />}
    </>
  );
}

function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </>
  );
}

function FindingDrawer({ f, onClose }: { f: Finding; onClose: () => void }) {
  const s = useAppState();
  const toast = useToast();
  const navigate = useNavigate();
  const [answer, setAnswer] = useState('');
  const jobs = jobsForFinding(s, f.id);
  const session = s.sessions.find((x) => x.id === f.sessionId);
  const sameProjectBugs = s.findings.filter((x) => x.type === f.type && x.projectId === f.projectId && x.id !== f.id && x.status !== 'draft');

  return (
    <Drawer title={`${f.id} · ${f.title}`} subtitle={`${typeLabel(f.type)} · ${projectName(s, f.projectId)} · ${f.buildId ? `Build ${buildLabel(s, f.buildId)}` : 'No build'}`} onClose={onClose}>
      <div className="form-grid fg-2">
        {f.type === 'bug' && (
          <>
            <label className="field"><span className="label">Severity</span>
              <select className="input" value={f.severity ?? ''} onChange={(e) => updateFinding(f.id, { severity: e.target.value as Finding['severity'] })}>
                {SEVERITIES.map((x) => <option key={x} value={x}>{SEVERITY_LABEL[x]}</option>)}
              </select>
            </label>
            <label className="field"><span className="label">Priority</span>
              <select className="input" value={f.priority ?? ''} onChange={(e) => updateFinding(f.id, { priority: e.target.value as Finding['priority'] })}>
                {PRIORITIES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="field"><span className="label">Status</span>
          <select className="input" value={f.status} onChange={(e) => updateFinding(f.id, { status: e.target.value as FindingStatus })}>
            {(['draft', 'open', 'in_progress', 'resolved', 'closed'] as FindingStatus[]).map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">Owner</span>
          <select className="input" value={f.ownerId ?? ''} onChange={(e) => updateFinding(f.id, { ownerId: e.target.value || undefined })}>
            <option value="">Unassigned</option>
            {s.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}><span className="label">Duplicate of</span>
          <select className="input" value={f.duplicateOf ?? ''} onChange={(e) => updateFinding(f.id, { duplicateOf: e.target.value || undefined, ...(e.target.value ? { status: 'closed' as const } : {}) })}>
            <option value="">Not a duplicate</option>
            {sameProjectBugs.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.title}</option>)}
          </select>
        </label>
      </div>
      {f.duplicateOf && <Callout>Marked as a duplicate of <Link to={`/triage/${f.duplicateOf}`}>{f.duplicateOf}</Link>. Duplicates are excluded from counts and release evidence.</Callout>}

      {f.type === 'bug' && (
        <dl className="kv">
          {f.description && <><dt>Description</dt><dd>{f.description}</dd></>}
          <dt>Steps</dt><dd className="pre">{f.steps || '—'}</dd>
          <dt>Expected</dt><dd>{f.expected || '—'}</dd>
          <dt>Actual</dt><dd>{f.actual || '—'}</dd>
          <dt>Environment</dt><dd>{[f.platform, f.device].filter(Boolean).join(' · ') || '—'}</dd>
          {!!f.attachments?.length && <><dt>Attachments</dt><dd>{f.attachments.map((a) => a.name).join(', ')}</dd></>}
        </dl>
      )}
      {f.type === 'feedback' && (
        <dl className="kv">
          <dt>Observation</dt><dd>{f.observation}</dd>
          <dt>Suggestion</dt><dd>{f.suggestion || '—'}</dd>
          <dt>Category</dt><dd>{f.category || '—'}</dd>
        </dl>
      )}
      {f.type === 'question' && (
        <div className="stack">
          <dl className="kv">
            <dt>Question</dt><dd>{f.question}</dd>
            <dt>Asked</dt><dd>{formatTime(f.createdAt)} by {personName(s, f.reporterId)}</dd>
            <dt>Answer from</dt><dd>{personName(s, f.ownerId)}</dd>
            {f.answer && <><dt>Answer</dt><dd>{f.answer}</dd><dt>Resolved</dt><dd>{formatTime(f.answeredAt!)}</dd></>}
          </dl>
          {!f.answer && f.status !== 'draft' && (
            <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!answer.trim()) return; answerQuestion(f.id, answer); setAnswer(''); toast(`Answer recorded on ${f.id}.`); }}>
              <label className="field"><span className="label">Record the answer</span>
                <textarea className="input" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
              </label>
              <div><button className="btn primary" disabled={!answer.trim()}>Save answer</button></div>
            </form>
          )}
          {f.convertedToId ? (
            <Callout>Converted to bug <Link to={`/triage/${f.convertedToId}`}>{f.convertedToId}</Link>.</Callout>
          ) : (
            <div>
              <button className="btn" onClick={() => { const d = convertQuestionToBug(f.id); toast(`Bug draft ${d.id} created from ${f.id}. Review it in Capture.`); navigate('/capture'); }}>Convert to bug…</button>
              <p className="hint" style={{ marginTop: 6 }}>Creates a linked bug draft for you to complete. The question stays as it is.</p>
            </div>
          )}
        </div>
      )}
      {f.convertedFromId && <Callout>Created from question <Link to={`/triage/${f.convertedFromId}`}>{f.convertedFromId}</Link>.</Callout>}

      <hr className="divider" style={{ margin: 0 }} />
      <dl className="kv">
        <dt>Reporter</dt><dd>{personName(s, f.reporterId)} · {formatTime(f.createdAt)}</dd>
        <dt>Session</dt><dd>{session ? `${session.title} (${session.status})` : 'Standalone'}</dd>
        {f.runResultRef && <><dt>Run result</dt><dd><Link to={`/test-lab/runs/${f.runResultRef.runId}`}>{s.runs.find((r) => r.id === f.runResultRef!.runId)?.name ?? f.runResultRef.runId}</Link></dd></>}
        <dt>Tracker</dt>
        <dd>{f.external ? <><SafeLink href={f.external.url}>{f.external.externalId}</SafeLink> <span className="subtle">· remote status “{f.external.remoteStatus ?? 'unknown'}” · synced {timeAgo(f.external.syncedAt)}</span></> : 'Not in the tracker'}</dd>
      </dl>
      <div className="stack" style={{ gap: 8 }}>
        <h3>Deliveries</h3>
        {jobs.length ? jobs.map((j) => <JobRow key={j.id} jobId={j.id} />) : <p className="subtle">No deliveries recorded for this finding.</p>}
      </div>
    </Drawer>
  );
}

// ---- Digest -----------------------------------------------------------------

function DigestView() {
  const s = useAppState();
  const toast = useToast();
  const [scope, setScope] = useState<string>(s.ui.projectId);
  const [channel, setChannel] = useState(s.settings.digestChannel);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(s.ledgers.find((l) => !ledgerDone(l))?.id ?? null);
  const [sending, setSending] = useState(false);
  const project = s.projects.find((p) => p.id === scope);
  const scopeLabel = project ? project.name : 'All projects';
  const digest = useMemo(() => (result ? buildDigest(result.items, s.settings.statusMapping) : null), [result, s.settings.statusMapping]);
  const ledger = ledgerId ? s.ledgers.find((l) => l.id === ledgerId) : undefined;
  const stale = result && Date.now() - new Date(result.fetchedAt).getTime() > 15 * 60_000;

  const doFetch = async () => {
    setFetching(true);
    setLedgerId(null);
    try {
      setResult(await fetchDigestData(project?.key));
    } finally {
      setFetching(false);
    }
  };

  const doSend = async () => {
    if (!ledger) return;
    setSending(true);
    const next = await sendDigest(ledger.id);
    setSending(false);
    toast(ledgerDone(next) ? 'Digest posted (mock).' : 'Digest stopped at a failed message. Resume to continue from there.');
  };

  return (
    <div className="grid cols-main-side">
      <div className="stack">
        <Card title="Open bug digest" actions={<span className="subtle">Manual only. Nothing is scheduled.</span>}>
          <div className="form-grid fg-2" style={{ marginBottom: 16 }}>
            <label className="field"><span className="label">Scope</span>
              <select className="input" value={scope} onChange={(e) => { setScope(e.target.value); setResult(null); setLedgerId(null); }}>
                {s.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="all">All projects</option>
              </select>
            </label>
            <label className="field"><span className="label">Post to</span>
              <input className="input" value={channel} onChange={(e) => setChannel(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <button className="btn primary" onClick={doFetch} disabled={fetching}>
              {fetching ? <RefreshCw size={16} className="spin" aria-hidden /> : <Download size={16} aria-hidden />} {result ? 'Fetch again' : 'Fetch open bugs'}
            </button>
            <label className="check subtle"><input type="checkbox" checked={s.remote.faults.listFailPage === 2} onChange={(e) => setFaults({ listFailPage: e.target.checked ? 2 : null })} /> Demo: fail page 2 of the next fetch</label>
          </div>

          {result && (
            <div className="stack" style={{ marginTop: 16 }}>
              {!result.complete ? (
                <Callout tone="bad">
                  Partial fetch: {result.error} {result.items.length} bugs from {result.pages} page{result.pages === 1 ? '' : 's'} were read. A partial digest cannot be published. Fetch again.
                </Callout>
              ) : (
                <Callout tone="good">
                  Fetched {result.pages} pages at {formatTime(result.fetchedAt)}. {result.items.length} unique tracker items{result.duplicatesRemoved ? `, ${result.duplicatesRemoved} duplicate${result.duplicatesRemoved > 1 ? 's' : ''} across pages removed` : ''}.
                </Callout>
              )}
              {stale && <Callout tone="warn">This data is more than 15 minutes old. Fetch again before sending.</Callout>}
              {digest && result.complete && (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Severity</th><th>Open</th><th>Bugs</th></tr></thead>
                      <tbody>
                        {SEVERITIES.map((sev) => (
                          <tr key={sev}>
                            <td><SeverityBadge value={sev} /></td>
                            <td><strong>{digest.groups[sev].length}</strong></td>
                            <td>
                              <div className="chips">
                                {digest.groups[sev].map((t) => <SafeLink key={t.externalId} href={t.url}>{t.externalId}</SafeLink>)}
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr><td><strong>Total</strong></td><td><strong>{digest.total}</strong></td><td className="subtle">{digest.excludedClosed} resolved/closed excluded by status mapping</td></tr>
                      </tbody>
                    </table>
                  </div>
                  {digest.unmapped.length > 0 && (
                    <Callout tone="warn">
                      <strong>Needs review ({digest.unmapped.length}):</strong> not counted until mapped in Settings.
                      <ul style={{ margin: '6px 0 0' }}>
                        {digest.unmapped.map((u) => <li key={u.task.externalId}><SafeLink href={u.task.url}>{u.task.externalId}</SafeLink> {u.task.title} · {u.reason}</li>)}
                      </ul>
                    </Callout>
                  )}
                  <div>
                    <button className="btn outline" onClick={() => setLedgerId(prepareDigest(result, scopeLabel, channel).id)} disabled={!!stale}>Prepare message preview</button>
                  </div>
                </>
              )}
            </div>
          )}
          {!result && <p className="subtle" style={{ marginTop: 12 }}>Reads every page from the issue tracker (mock), de-duplicates by tracker ID and groups open bugs by severity using the status mapping in Settings.</p>}
        </Card>

        <Card title="Digest history" className="flush">
          {s.ledgers.length === 0 ? <Empty title="No digests prepared yet" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Prepared</th><th>Scope</th><th>Channel</th><th>Sent</th><th><span className="sr-only">Open</span></th></tr></thead>
                <tbody>
                  {s.ledgers.map((l) => (
                    <tr key={l.id}>
                      <td className="nowrap">{formatTime(l.createdAt)}</td>
                      <td>{l.scopeLabel}</td>
                      <td>{l.channel}</td>
                      <td>{l.entries.filter((e) => e.status === 'sent').length} / {l.entries.length}</td>
                      <td><button className="btn small" onClick={() => setLedgerId(l.id)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Message preview">
        {!ledger ? (
          <Empty title="Nothing to preview yet">Fetch open bugs, then prepare the preview. You will see the parent message and every thread reply before anything is sent.</Empty>
        ) : (
          <div className="stack">
            <div className="row"><strong>{ledger.channel}</strong><span className="subtle">· data fetched {formatTime(ledger.fetchedAt)}</span></div>
            {ledger.entries.map((e) => (
              <div key={e.index} className="stack" style={{ gap: 4 }}>
                <div className={`chat-msg ${e.role === 'reply' ? 'chat-reply' : ''}`}><ChatText text={e.text} /></div>
                <div className="row subtle" style={{ marginLeft: e.role === 'reply' ? 18 : 0 }}>
                  {e.role === 'parent' ? 'Parent message' : `Thread reply ${e.index}`} ·{' '}
                  {e.status === 'sent' ? <span className="badge good">Sent</span> : e.status === 'failed' ? <span className="badge bad">Failed: {e.error}</span> : <span className="badge neutral">Not sent</span>}
                </div>
              </div>
            ))}
            {ledgerDone(ledger) ? (
              <Callout tone="good">All {ledger.entries.length} messages sent (mock).</Callout>
            ) : (
              <>
                <label className="check subtle"><input type="checkbox" checked={s.remote.faults.messagingFailNext > 0} onChange={(e) => setFaults({ messagingFailNext: e.target.checked ? 1 : 0 })} /> Demo: next chat post fails</label>
                <div className="row">
                  <button className="btn primary" onClick={doSend} disabled={sending}>
                    <Send size={16} aria-hidden /> {ledger.entries.some((e) => e.status === 'sent') ? 'Resume sending' : `Send ${ledger.entries.length} messages`}
                  </button>
                  {!ledger.entries.some((e) => e.status === 'sent') && <button className="btn ghost" onClick={() => { discardLedger(ledger.id); setLedgerId(null); }}>Discard</button>}
                </div>
                <p className="hint">Messages already sent are never posted again. Resuming continues from the first unsent message.</p>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
