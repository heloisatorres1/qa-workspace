import { Link, useSearchParams } from 'react-router-dom';
import { useAppState } from '../data/state';
import { typeLabel } from '../data/actions';
import { latestRevision } from '../domain/runs';
import { TASK_STATUS_LABEL } from '../domain/tasks';
import { Card, Empty, SafeLink } from '../components/ui';

export function SearchPage() {
  const s = useAppState();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const has = (...parts: (string | undefined)[]) => parts.some((p) => p?.toLowerCase().includes(q));
  const findings = q ? s.findings.filter((f) => has(f.id, f.title, f.question, f.observation, f.steps)) : [];
  const cases = q ? s.cases.filter((c) => has(latestRevision(c).title, latestRevision(c).tags.join(' '))) : [];
  const runs = q ? s.runs.filter((r) => has(r.name)) : [];
  const links = q ? s.resources.filter((r) => has(r.title, r.description, r.tags.join(' '))) : [];
  const tasks = q ? s.tasks.filter((t) => has(t.title, t.description)) : [];
  const total = findings.length + cases.length + runs.length + tasks.length + links.length;
  return (
    <>
      <div className="page-head"><div><h1>Search</h1><div className="meta">{q ? `${total} result${total === 1 ? '' : 's'} for “${params.get('q')}” across all projects` : 'Type in the search box above.'}</div></div></div>
      {q && total === 0 && <Card><Empty title="Nothing found" /></Card>}
      <div className="stack">
        {findings.length > 0 && <Card title={`Findings (${findings.length})`}><ul>{findings.slice(0, 30).map((f) => <li key={f.id}><Link to={`/triage/${f.id}`}>{f.id}</Link> {f.title} <span className="subtle">· {typeLabel(f.type)}</span></li>)}</ul></Card>}
        {cases.length > 0 && <Card title={`Test cases (${cases.length})`}><ul>{cases.slice(0, 30).map((c) => <li key={c.id}><Link to="/test-lab/cases">{latestRevision(c).title}</Link></li>)}</ul></Card>}
        {runs.length > 0 && <Card title={`Runs (${runs.length})`}><ul>{runs.map((r) => <li key={r.id}><Link to={`/test-lab/runs/${r.id}`}>{r.name}</Link></li>)}</ul></Card>}
        {tasks.length > 0 && <Card title={`QA tasks (${tasks.length})`}><ul>{tasks.map((t) => <li key={t.id}><Link to={`/tasks?view=list`}>{t.title}</Link> <span className="subtle">· {TASK_STATUS_LABEL[t.status]}</span></li>)}</ul></Card>}
        {links.length > 0 && <Card title={`Library (${links.length})`}><ul>{links.map((r) => <li key={r.id}><SafeLink href={r.url}>{r.title}</SafeLink></li>)}</ul></Card>}
      </div>
    </>
  );
}
