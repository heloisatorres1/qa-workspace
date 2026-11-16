import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Camera, FlaskConical, Folder, Home, Layers, Menu, Package, Search, Settings } from 'lucide-react';
import { useAppState } from '../data/state';
import { setScope } from '../data/actions';

const NAV = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/capture', label: 'Capture', icon: Camera },
  { to: '/triage', label: 'Triage', icon: Layers },
  { to: '/test-lab', label: 'Test Lab', icon: FlaskConical },
  { to: '/releases', label: 'Releases', icon: Package },
  { to: '/library', label: 'Library', icon: Folder },
];

export function Layout() {
  const s = useAppState();
  const [navOpen, setNavOpen] = useState(false);
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => setNavOpen(false), [loc.pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const builds = s.builds.filter((b) => s.ui.projectId !== 'all' && b.projectId === s.ui.projectId);

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink to="/" className="brand">
          <strong>QA Workspace</strong>
          <span>QA workspace</span>
        </NavLink>
        <nav className="nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={20} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <nav className="nav nav-bottom" aria-label="Workspace">
          <NavLink to="/settings">
            <Settings size={20} aria-hidden /> Settings
          </NavLink>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
            <Menu size={22} />
          </button>
          <label htmlFor="scope-project">Project</label>
          <select
            id="scope-project"
            className="input"
            style={{ width: 'auto', minWidth: 170 }}
            value={s.ui.projectId}
            onChange={(e) => {
              const pid = e.target.value;
              const latest = s.builds.filter((b) => b.projectId === pid).at(-1);
              setScope(pid, latest?.id ?? null);
            }}
          >
            {s.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="all">All projects</option>
          </select>
          {s.ui.projectId !== 'all' && (
            <>
              <label htmlFor="scope-build">Build</label>
              <select id="scope-build" className="input" style={{ width: 'auto' }} value={s.ui.buildId ?? ''} onChange={(e) => setScope(s.ui.projectId, e.target.value || null)}>
                {builds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.version}
                    {b.label ? ` (${b.label})` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search size={17} aria-hidden />
            <label htmlFor="global-search" className="sr-only">
              Search findings, cases, runs and links
            </label>
            <input ref={search} id="global-search" type="search" placeholder="Search findings, tests, runs, links…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="kbd" aria-hidden>
              Ctrl K
            </span>
          </form>
          <span className="badge demo" title="Demo mode: mock integrations, fictional data. Nothing leaves this browser.">
            Demo
          </span>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
