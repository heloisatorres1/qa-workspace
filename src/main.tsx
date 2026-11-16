import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createStore, loadPersisted, persist, setActiveStore } from './data/state';
import { seed } from './data/fixtures';
import { processPending } from './data/actions';
import './styles/app.css';

const initial = loadPersisted() ?? seed();
setActiveStore(createStore(initial, persist));
// Resume deliveries that were queued before a refresh.
void processPending();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
