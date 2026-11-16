import { useState } from 'react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useAppState } from '../data/state';
import { deleteResource, isSafeUrl, saveResource, uid } from '../data/actions';
import { projectName } from '../data/selectors';
import { RESOURCE_KINDS, type ResourceKind, type ResourceLink } from '../domain/types';
import { Card, Dialog, Empty, Field, SafeLink } from '../components/ui';

export function Library() {
  const s = useAppState();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ResourceKind | ''>('');
  const [tag, setTag] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [editing, setEditing] = useState<ResourceLink | 'new' | null>(null);
  const items = s.resources
    .filter((r) => s.ui.projectId === 'all' || r.projectId === 'all' || r.projectId === s.ui.projectId)
    .filter((r) => !kind || r.kind === kind)
    .filter((r) => !tag || r.tags.includes(tag))
    .filter((r) => !favOnly || r.favorite)
    .filter((r) => !q || `${r.title} ${r.description} ${r.tags.join(' ')} ${r.url}`.toLowerCase().includes(q.toLowerCase()));
  const tags = [...new Set(s.resources.flatMap((r) => r.tags))].sort();
  const groups = RESOURCE_KINDS.map((k) => [k, items.filter((r) => r.kind === k)] as const).filter(([, l]) => l.length);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <div className="meta">Repos, dashboards, boards, docs and builds in one place. Links open in a new tab.</div>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> Add link</button>
      </div>
      <div className="filters">
        <label className="sr-only" htmlFor="l-q">Search links</label>
        <input id="l-q" className="input grow" type="search" placeholder="Search links" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="l-kind">Kind</label>
        <select id="l-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind | '')}>
          <option value="">All kinds</option>
          {RESOURCE_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <label className="sr-only" htmlFor="l-tag">Tag</label>
        <select id="l-tag" className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} /> Favorites</label>
      </div>
      {groups.length === 0 ? <Card><Empty title="No links match" /></Card> : (
        <div className="stack">
          {groups.map(([k, list]) => (
            <Card key={k} title={k} className="flush">
              <div className="table-wrap">
                <table>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id}>
                        <td style={{ width: 40 }}>
                          <button className="icon-btn" aria-pressed={r.favorite} aria-label={r.favorite ? `Remove ${r.title} from favorites` : `Add ${r.title} to favorites`} onClick={() => saveResource({ ...r, favorite: !r.favorite })}>
                            <Star size={17} fill={r.favorite ? '#d98a00' : 'none'} color={r.favorite ? '#d98a00' : 'currentColor'} />
                          </button>
                        </td>
                        <td>
                          <SafeLink href={r.url}><strong>{r.title}</strong></SafeLink>
                          <div className="subtle">{r.description}</div>
                        </td>
                        <td className="nowrap subtle">{projectName(s, r.projectId)}</td>
                        <td><div className="chips">{r.tags.map((t) => <button key={t} className="badge neutral square" style={{ border: 0, cursor: 'pointer' }} onClick={() => setTag(t)}>{t}</button>)}</div></td>
                        <td className="nowrap" style={{ width: 90 }}>
                          <button className="icon-btn" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}><Pencil size={16} /></button>
                          <button className="icon-btn" aria-label={`Delete ${r.title}`} onClick={() => { if (confirm(`Delete “${r.title}”?`)) deleteResource(r.id); }}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <ResourceDialog initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ResourceDialog({ initial, onClose }: { initial?: ResourceLink; onClose: () => void }) {
  const s = useAppState();
  const [r, setR] = useState<ResourceLink>(
    initial ?? { id: uid('res'), projectId: s.ui.projectId, title: '', url: 'https://', kind: 'Documentation', tags: [], favorite: false, description: '' },
  );
  const [tags, setTags] = useState(r.tags.join(', '));
  const urlError = r.url && r.url !== 'https://' && !isSafeUrl(r.url) ? 'Only http:// and https:// links are allowed.' : undefined;
  const valid = r.title.trim() && isSafeUrl(r.url);
  return (
    <Dialog title={initial ? 'Edit link' : 'Add link'} onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); if (!valid) return; saveResource({ ...r, title: r.title.trim(), tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }); onClose(); }}>
        <Field label="Title" required>{(p) => <input {...p} className="input" value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} />}</Field>
        <Field label="URL" required error={urlError}>{(p) => <input {...p} className="input" type="url" value={r.url} onChange={(e) => setR({ ...r, url: e.target.value.trim() })} />}</Field>
        <div className="form-grid fg-2">
          <Field label="Kind">{(p) => <select {...p} className="input" value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as ResourceKind })}>{RESOURCE_KINDS.map((k) => <option key={k}>{k}</option>)}</select>}</Field>
          <Field label="Project">{(p) => <select {...p} className="input" value={r.projectId} onChange={(e) => setR({ ...r, projectId: e.target.value })}>{s.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}<option value="all">All projects</option></select>}</Field>
        </div>
        <Field label="Tags" hint="Comma separated.">{(p) => <input {...p} className="input" value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>
        <Field label="Description">{(p) => <input {...p} className="input" value={r.description} onChange={(e) => setR({ ...r, description: e.target.value })} />}</Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid}>Save</button></div>
      </form>
    </Dialog>
  );
}
