import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Box, Bug, FileText, Mail, MessageCircle, Play, Plus, Ticket } from 'lucide-react';
import { useAppState } from '../data/state';
import { buildLabel, currentRelease, personName, projectName, scopedFindings, scopedRuns } from '../data/selectors';
import { isAwaitingAnswer, isOpen } from '../domain/findings';
import { countResults, formatPercent, runMetrics } from '../domain/metrics';
import { runProgress } from '../domain/runs';
import { SEVERITIES, type DeliveryJob } from '../domain/types';
import { evidenceChanged } from '../domain/release';
import { liveEvidence } from '../data/actions';
import { Card, Donut, Empty, RESULT_COLOR, RecommendationBadge, SeverityBadge, timeAgo, formatTime } from '../components/ui';

const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2, P4: 3 };

export function Overview() {
  const s = useAppState();
  const findings = scopedFindings(s);
  const openBugs = findings.filter((f) => f.type === 'bug' && isOpen(f) && !f.duplicateOf);
  const critical = openBugs.filter((f) => f.severity === 'critical');
  const activeRuns = scopedRuns(s).filter((r) => r.status === 'active');
  const awaiting = findings.filter(isAwaitingAnswer);
  const release = currentRelease(s);
  const scopeTitle = s.ui.projectId === 'all' ? 'All projects' : `${projectName(s, s.ui.projectId)} · Build ${buildLabel(s, s.ui.buildId ?? undefined)}`;

  const queue = [...openBugs]
    .sort((a, b) => SEVERITIES.indexOf(a.severity!) - SEVERITIES.indexOf(b.severity!) || PRIORITY_ORDER[a.priority ?? 'P4'] - PRIORITY_ORDER[b.priority ?? 'P4'])
    .slice(0, 5);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Quality at a glance</h1>
          <div className="meta">
            {scopeTitle} <span className="badge demo">Demo data</span>
          </div>
        </div>
        <Link to="/capture" className="btn primary lg">
          <Plus size={18} aria-hidden /> New report
        </Link>
      </div>

      <div className="grid cols-4 stats" style={{ marginBottom: 20 }}>
        <Stat to="/triage?type=bug" icon={<Bug size={26} />} bg="var(--neutral-soft)" color="var(--ink)" label="Open bugs" value={openBugs.length} />
        <Stat to="/triage?type=bug&severity=critical" icon={<AlertTriangle size={26} />} bg="var(--red-soft)" color="var(--red)" label="Critical" value={critical.length} />
        <Stat to="/test-lab/runs" icon={<Play size={26} />} bg="var(--teal-soft)" color="var(--teal)" label="Active runs" value={activeRuns.length} />
        <Stat to="/triage?type=question&awaiting=1" icon={<MessageCircle size={26} />} bg="var(--lavender)" color="var(--lavender-ink)" label="Awaiting answers" value={awaiting.length} />
      </div>

      <div className="grid cols-main-side" style={{ marginBottom: 20 }}>
        {release ? <ReadinessCard releaseId={release.id} /> : <Card title="Release readiness"><Empty title="No release for this build">Create runs and link them to a release in Releases.</Empty></Card>}
        <Card title="Active test runs" actions={<Link className="link-btn" to="/test-lab/runs">View all <ArrowRight size={15} aria-hidden /></Link>}>
          {activeRuns.length === 0 ? (
            <Empty title="No active runs">Start one from Test Lab.</Empty>
          ) : (
            <div className="stack">
              {[...activeRuns]
                .sort((a, b) => runProgress(b).executed / b.cases.length - runProgress(a).executed / a.cases.length)
                .slice(0, 2)
                .map((r) => {
                  const p = runProgress(r);
                  const pct = p.executionRate === null ? 0 : Math.round(p.executionRate * 100);
                  return (
                    <div key={r.id} className="row" style={{ alignItems: 'flex-start', gap: 14, flexWrap: 'nowrap' }}>
                      <span className="tl-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
                        <Play size={18} aria-hidden />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: "block" }}>{r.name}</strong>
                        <div className="spread subtle" style={{ marginBottom: 6 }}>
                          <span>Build {buildLabel(s, r.buildId)} · {p.executed} / {p.applicable} executed</span>
                          <strong style={{ color: "var(--ink)" }}>{pct}%</strong>
                        </div>
                        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.name} execution`}>
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <Link to={`/test-lab/runs/${r.id}`} className="btn outline small">
                        Continue run
                      </Link>
                    </div>
                  );
                })}
              {activeRuns.length > 2 && <p className="subtle">+{activeRuns.length - 2} more active run{activeRuns.length - 2 > 1 ? 's' : ''}</p>}
            </div>
          )}
        </Card>
      </div>

      <div className="grid cols-main-side" style={{ marginBottom: 20 }}>
        <Card className="flush" title="Priority queue" actions={<Link className="link-btn" to="/triage?type=bug">View all <ArrowRight size={15} aria-hidden /></Link>}>
          {queue.length === 0 ? (
            <Empty title="No open bugs in this scope" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Report</th>
                    <th>Severity</th>
                    <th>Priority</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((f) => (
                    <tr key={f.id}>
                      <td className="nowrap">
                        <Link to={`/triage/${f.id}`}>{f.id}</Link>
                      </td>
                      <td>{f.title}</td>
                      <td>
                        <SeverityBadge value={f.severity} />
                      </td>
                      <td>
                        <span className="badge lav square">{f.priority}</span>
                      </td>
                      <td className="nowrap">{personName(s, f.ownerId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Recent activity">
          <ul className="timeline">
            {s.events.slice(0, 4).map((e) => (
              <li key={e.id}>
                <span className="tl-icon" aria-hidden>
                  {e.kind === 'run' ? <Play size={17} /> : e.kind === 'finding' ? <Bug size={17} /> : e.kind === 'question' ? <MessageCircle size={17} /> : e.kind === 'build' ? <Box size={17} /> : <FileText size={17} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <strong>{e.link ? <Link to={e.link} style={{ color: 'inherit' }}>{e.title}</Link> : e.title}</strong>
                  <div className="subtle">{e.detail}</div>
                </div>
                <span className="subtle nowrap">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <DeliveryActivity />
    </>
  );
}

function Stat({ to, icon, bg, color, label, value }: { to: string; icon: React.ReactNode; bg: string; color: string; label: string; value: number }) {
  return (
    <Link to={to} className="card stat">
      <span className="stat-icon" style={{ background: bg, color }} aria-hidden>
        {icon}
      </span>
      <span>
        <span className="stat-label">{label}</span>
        <span className="stat-value" style={{ display: 'block' }}>
          {value}
        </span>
      </span>
    </Link>
  );
}

function ReadinessCard({ releaseId }: { releaseId: string }) {
  const s = useAppState();
  const rel = s.releases.find((r) => r.id === releaseId)!;
  const runs = s.runs.filter((r) => rel.runIds.includes(r.id));
  const c = countResults(runs);
  const m = runMetrics(c);
  const latest = rel.revisions.at(-1);
  const live = liveEvidence(s, rel.id);
  const stale = latest ? evidenceChanged(latest.evidence, live) : true;
  const build = s.builds.find((b) => b.id === rel.buildId)!;
  const pct = (n: number) => (m.applicable ? `${((n / m.applicable) * 100).toFixed(1)}%` : '—');
  const rows = [
    { k: 'passed', label: 'Passed', n: c.passed },
    { k: 'failed', label: 'Failed', n: c.failed },
    { k: 'blocked', label: 'Blocked', n: c.blocked },
    { k: 'untested', label: 'Untested', n: c.untested },
  ] as const;
  return (
    <Card title="Release readiness">
      <div className="grid cols-2" style={{ alignItems: 'center' }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="subtle" style={{ fontWeight: 600, color: 'var(--ink)' }}>
            Build
          </div>
          <div className="row" style={{ gap: 14 }}>
            <span style={{ fontSize: 30, fontWeight: 700 }}>{build.version}</span>
            {latest && !stale ? (
              <RecommendationBadge value={latest.recommendation} />
            ) : (
              <span className="badge warn">
                <span className="dot" aria-hidden /> Needs review
              </span>
            )}
          </div>
          <p className="muted">
            {latest && !stale
              ? `Decision saved ${timeAgo(latest.savedAt)} (revision ${latest.rev}). ${live.blockers.length} critical blocker${live.blockers.length === 1 ? '' : 's'} open.`
              : latest
                ? 'Evidence changed since the last saved decision. Review it again before release.'
                : `${m.executed} of ${m.applicable} cases executed, ${live.blockers.length} critical bug${live.blockers.length === 1 ? '' : 's'} open. No QA decision saved yet.`}
          </p>
          <div>
            <Link to={`/releases/${rel.id}`} className="btn outline">
              Review release <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
        <div>
          <h3 style={{ marginBottom: 10 }}>Test distribution</h3>
          <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
            <Donut segments={rows.map((r) => ({ value: r.n, color: RESULT_COLOR[r.k], label: r.label }))} label={String(m.applicable)} sub="tests" size={140} />
            <div className="legend">
              {rows.map((r) => (
                <FragmentRow key={r.k} color={RESULT_COLOR[r.k]} label={r.label} n={r.n} pct={pct(r.n)} />
              ))}
            </div>
          </div>
          <p className="subtle" style={{ marginTop: 8 }}>
            Pass rate {formatPercent(m.passRate)} · Executed {formatPercent(m.executionRate)}
          </p>
        </div>
      </div>
    </Card>
  );
}

function FragmentRow({ color, label, n, pct }: { color: string; label: string; n: number; pct: string }) {
  return (
    <>
      <span className="swatch" style={{ background: color }} aria-hidden />
      <span>{label}</span>
      <strong style={{ textAlign: 'right' }}>{n}</strong>
      <span className="subtle">({pct})</span>
    </>
  );
}

function DeliveryActivity() {
  const s = useAppState();
  type Item = { at: string; title: string; detail: string; icon: React.ReactNode; bg: string; color: string };
  const fromJob = (j: DeliveryJob): Item => {
    const last = j.attempts.at(-1);
    const isTicket = j.payload.kind === 'tracker.create';
    const ok = j.status === 'delivered';
    return {
      at: last?.at ?? j.createdAt,
      title: isTicket ? (ok ? 'Ticket created' : j.status === 'pending' ? 'Ticket pending' : 'Ticket needs attention') : ok ? 'Message delivered' : j.status === 'pending' ? 'Message pending' : 'Message needs attention',
      detail: last?.detail ?? 'Saved locally, waiting for delivery.',
      icon: isTicket ? <Ticket size={22} /> : <Mail size={22} />,
      bg: ok ? (isTicket ? 'var(--teal-soft)' : 'var(--lavender)') : j.status === 'pending' ? 'var(--neutral-soft)' : 'var(--red-soft)',
      color: ok ? (isTicket ? 'var(--teal)' : 'var(--lavender-ink)') : j.status === 'pending' ? 'var(--ink-2)' : 'var(--red)',
    };
  };
  const items: Item[] = [
    ...s.jobs.map(fromJob),
    ...s.ledgers.map((l) => {
      const sent = l.entries.filter((e) => e.status === 'sent').length;
      return {
        at: l.createdAt,
        title: sent === 0 ? 'Digest draft' : sent === l.entries.length ? 'Digest posted' : 'Digest partially posted',
        detail: `${l.scopeLabel}: ${sent} of ${l.entries.length} messages sent.`,
        icon: <FileText size={22} />,
        bg: 'var(--teal-soft)',
        color: 'var(--teal)',
      };
    }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);

  return (
    <Card title="Delivery activity" actions={<Link className="link-btn" to="/settings#delivery">Delivery log <ArrowRight size={15} aria-hidden /></Link>}>
      {items.length === 0 ? (
        <Empty title="Nothing delivered yet" />
      ) : (
        <div className="flow">
          {items.map((it, i) => (
            <FlowCell key={i} item={it} last={i === items.length - 1} />
          ))}
        </div>
      )}
    </Card>
  );
}

function FlowCell({ item, last }: { item: { at: string; title: string; detail: string; icon: React.ReactNode; bg: string; color: string }; last: boolean }) {
  return (
    <>
      <div className="flow-item">
        <span className="flow-icon" style={{ background: item.bg, color: item.color }} aria-hidden>
          {item.icon}
        </span>
        <div>
          <strong>{item.title}</strong>
          <div className="subtle">{item.detail}</div>
          <div className="subtle">{formatTime(item.at)}</div>
        </div>
      </div>
      {!last && (
        <span className="flow-arrow subtle" aria-hidden>
          <ArrowRight size={20} />
        </span>
      )}
    </>
  );
}
