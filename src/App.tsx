import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastHost } from './components/ui';
import { Overview } from './routes/Overview';
import { Capture } from './routes/Capture';
import { Triage } from './routes/Triage';
import { TestLab } from './routes/TestLab';
import { RunDetail } from './routes/RunDetail';
import { Releases } from './routes/Releases';
// The task board pulls in the drag-and-drop library, so it loads only when opened.
const Tasks = lazy(() => import('./routes/Tasks').then((m) => ({ default: m.Tasks })));
import { Library } from './routes/Library';
import { SettingsPage } from './routes/Settings';
import { SearchPage } from './routes/Search';
import { NotFound } from './routes/NotFound';

export function App() {
  return (
    <ToastHost>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="capture" element={<Capture />} />
            <Route path="triage" element={<Triage />} />
            <Route path="triage/digest" element={<Triage tab="digest" />} />
            <Route path="triage/:findingId" element={<Triage />} />
            <Route path="test-lab" element={<TestLab />} />
            <Route path="test-lab/:tab" element={<TestLab />} />
            <Route path="test-lab/runs/:runId" element={<RunDetail />} />
            <Route path="tasks" element={<Suspense fallback={<p className="subtle">Loading tasks…</p>}><Tasks /></Suspense>} />
            <Route path="releases" element={<Releases />} />
            <Route path="releases/:releaseId" element={<Releases />} />
            <Route path="library" element={<Library />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastHost>
  );
}
