import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useAppState } from '../data/state';
import { resetDemo, setFaults, typeLabel, updateRoute, updateSettings } from '../data/actions';
import { projectName } from '../data/selectors';
import { Callout, Card, Dialog, JobBadge, SafeLink, formatTime, useToast } from '../components/ui';
import { CATEGORIES, CONNECTORS } from '../integrations/catalog';
import { JobRow } from './Capture';

export function SettingsPage() {
  const s = useAppState();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [openList, setOpenList] = useState(s.settings.statusMapping.open.join(', '));
  const [closedList, setClosedList] = useState(s.settings.statusMapping.closed.join(', '));
  const failed = s.jobs.filter((j) => j.status === 'failed' || j.status === 'unknown');
  const split = (v: string) => v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="meta">Workspace routing, integration state and demo controls.</div>
        </div>
      </div>
      <div className="stack">
        <Card title="Integrations">
          <div className="stack">
            <Callout>Demo mode. Issue tracker and team chat use built-in mock adapters. This build cannot contact any external service, even when you press Send. Live adapters are configured on a server and are not part of the public demo.</Callout>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Integration</th><th>Mode</th><th>State</th></tr></thead>
                <tbody>
                  <tr><td>Issue tracker</td><td>Mock</td><td><span className="badge good">Connected (simulated)</span> <span className="subtle">last sync {formatTime(s.settings.lastSyncAt)}</span></td></tr>
                  <tr><td>Team chat</td><td>Mock</td><td><span className="badge good">Connected (simulated)</span></td></tr>
                  <tr><td>Draft assistant</td><td>Deterministic</td><td><span className="badge neutral">Rule-based, no model</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card title="Connectors">
          <div className="stack">
            <p className="muted">One workspace in front of the tools your team already uses. Each connector implements a provider-neutral interface, so you can swap ClickUp for Jira, or Slack for Teams, without changing how QA works here. Only the mock connectors run in this demo.</p>
            {CATEGORIES.map((cat) => (
              <div key={cat} className="table-wrap">
                <table aria-label={`${cat} connectors`}>
                  <thead><tr><th>{cat}</th><th>What syncs</th><th>Auth</th><th>Status</th></tr></thead>
                  <tbody>
                    {CONNECTORS.filter((c) => c.category === cat).map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.docsUrl ? <SafeLink href={c.docsUrl}>{c.name}</SafeLink> : c.name}</strong><div className="subtle">{c.implements}</div></td>
                        <td>{c.syncs}</td>
                        <td>{c.auth}</td>
                        <td>{c.status === 'mock' ? <span className="badge good">Active in demo</span> : <span className="badge lav">Planned</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Routing" className="flush">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Project</th><th>Type</th><th>Issue tracker list</th><th>Chat channel</th></tr></thead>
              <tbody>
                {s.routes.map((r) => (
                  <tr key={`${r.projectId}-${r.type}`}>
                    <td>{projectName(s, r.projectId)}</td>
                    <td>{typeLabel(r.type)}</td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <label className="check"><input type="checkbox" checked={r.tracker.enabled} onChange={(e) => updateRoute(r.projectId, r.type, { tracker: { ...r.tracker, enabled: e.target.checked } })} /><span className="sr-only">Send {typeLabel(r.type)} to tracker</span></label>
                        <input className="input" aria-label={`Tracker list for ${typeLabel(r.type)}`} value={r.tracker.list} disabled={!r.tracker.enabled} onChange={(e) => updateRoute(r.projectId, r.type, { tracker: { ...r.tracker, list: e.target.value } })} />
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <label className="check"><input type="checkbox" checked={r.messaging.enabled} onChange={(e) => updateRoute(r.projectId, r.type, { messaging: { ...r.messaging, enabled: e.target.checked } })} /><span className="sr-only">Post {typeLabel(r.type)} to chat</span></label>
                        <input className="input" aria-label={`Chat channel for ${typeLabel(r.type)}`} value={r.messaging.channel} disabled={!r.messaging.enabled} onChange={(e) => updateRoute(r.projectId, r.type, { messaging: { ...r.messaging, channel: e.target.value } })} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid cols-2">
          <Card title="Tracker status mapping">
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); updateSettings({ statusMapping: { open: split(openList), closed: split(closedList) } }); toast('Status mapping saved.'); }}>
              <label className="field"><span className="label">Counts as open</span><input className="input" value={openList} onChange={(e) => setOpenList(e.target.value)} /></label>
              <label className="field"><span className="label">Counts as resolved / closed</span><input className="input" value={closedList} onChange={(e) => setClosedList(e.target.value)} /></label>
              <p className="hint">Any other tracker status lands in a visible “Needs review” group in the digest instead of being guessed.</p>
              <div><button className="btn">Save mapping</button></div>
            </form>
          </Card>
          <Card title="Channels">
            <div className="form-grid">
              <label className="field"><span className="label">Default digest channel</span><input className="input" value={s.settings.digestChannel} onChange={(e) => updateSettings({ digestChannel: e.target.value })} /></label>
              <label className="field"><span className="label">Release sign-off channel</span><input className="input" value={s.settings.releaseChannel} onChange={(e) => updateSettings({ releaseChannel: e.target.value })} /></label>
            </div>
          </Card>
        </div>

        <Card title="Failure simulation">
          <div className="stack" style={{ gap: 8 }}>
            <p className="muted">One-shot faults for exploring delivery behavior. Each resets after it triggers.</p>
            <label className="check"><input type="checkbox" checked={s.remote.faults.messagingFailNext > 0} onChange={(e) => setFaults({ messagingFailNext: e.target.checked ? 1 : 0 })} /> Next chat post fails</label>
            <label className="check"><input type="checkbox" checked={s.remote.faults.trackerFailNext > 0} onChange={(e) => setFaults({ trackerFailNext: e.target.checked ? 1 : 0 })} /> Next ticket creation fails</label>
            <label className="check"><input type="checkbox" checked={s.remote.faults.trackerTimeoutNext > 0} onChange={(e) => setFaults({ trackerTimeoutNext: e.target.checked ? 1 : 0 })} /> Next ticket times out after being created (tests reconciliation)</label>
            <label className="check"><input type="checkbox" checked={s.remote.faults.listFailPage === 2} onChange={(e) => setFaults({ listFailPage: e.target.checked ? 2 : null })} /> Next digest fetch fails on page 2</label>
          </div>
        </Card>

        <Card title="Delivery log" className="flush">
          <div id="delivery" className="stack" style={{ padding: '0 20px 20px', gap: 8 }}>
            {failed.length > 0 && <Callout tone="warn">{failed.length} deliver{failed.length > 1 ? 'ies need' : 'y needs'} attention.</Callout>}
            {s.jobs.slice(0, 25).map((j) => <JobRow key={j.id} jobId={j.id} />)}
            {s.jobs.length === 0 && <p className="subtle">No deliveries yet.</p>}
            <p className="subtle">Mock remote holds {s.remote.tasks.length} tickets and {s.remote.messages.length} messages. {s.jobs.filter((j) => j.status === 'delivered').length} delivered · {s.jobs.filter((j) => j.status === 'pending').length} pending.</p>
            {s.jobs[0] && <span className="sr-only"><JobBadge job={s.jobs[0]} /></span>}
          </div>
        </Card>

        <Card title="Demo data">
          <div className="spread">
            <p className="muted">Your changes are saved in this browser. Reset restores the fictional Orbit Garden fixtures.</p>
            <button className="btn danger" onClick={() => setConfirmReset(true)}><RotateCcw size={16} aria-hidden /> Reset demo</button>
          </div>
        </Card>
      </div>
      {confirmReset && (
        <Dialog title="Reset the demo?" onClose={() => setConfirmReset(false)}>
          <div className="stack">
            <p>This replaces everything stored in this browser with the original demo data. Drafts, runs, decisions and digests you created will be lost.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="btn primary" autoFocus onClick={() => { resetDemo(); setConfirmReset(false); toast('Demo data restored.'); }}>Reset</button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
