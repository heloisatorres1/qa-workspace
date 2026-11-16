import { useSyncExternalStore } from 'react';
import type {
  AuditEvent,
  Build,
  DeliveryJob,
  Finding,
  FindingType,
  ID,
  ISODate,
  Person,
  Project,
  Release,
  ResourceLink,
  Route,
  Run,
  Session,
  Suite,
  TestCase,
} from '../domain/types';
import type { DigestLedger, StatusMapping } from '../domain/digest';
import type { DecisionDraft } from '../domain/release';
import type { MockRemote } from '../integrations/mock';

export interface CaptureDraft {
  type: FindingType;
  fields: Partial<Finding>;
  destinations: { tracker: boolean; messaging: boolean };
  postInThread: boolean;
  /** Set when editing a saved draft record. */
  draftId?: ID;
}

export interface AppState {
  version: number;
  seededAt: ISODate;
  currentUserId: ID;
  projects: Project[];
  builds: Build[];
  people: Person[];
  findings: Finding[];
  sessions: Session[];
  suites: Suite[];
  cases: TestCase[];
  runs: Run[];
  releases: Release[];
  resources: ResourceLink[];
  routes: Route[];
  jobs: DeliveryJob[];
  events: AuditEvent[];
  ledgers: DigestLedger[];
  remote: MockRemote;
  settings: { statusMapping: StatusMapping; digestChannel: string; releaseChannel: string; lastSyncAt: ISODate };
  ui: {
    projectId: ID | 'all';
    buildId: ID | null;
    captureDraft: CaptureDraft | null;
    releaseDrafts: Record<ID, DecisionDraft>;
  };
}

export const STORAGE_KEY = 'checkpoint.demo.v1';
export const SCHEMA_VERSION = 1;

type Listener = () => void;

export interface Store {
  get(): AppState;
  set(update: (s: AppState) => AppState): void;
  replace(next: AppState): void;
  subscribe(l: Listener): () => void;
}

export function createStore(initial: AppState, persist?: (s: AppState) => void): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());
  return {
    get: () => state,
    set(update) {
      state = update(state);
      persist?.(state);
      emit();
    },
    replace(next) {
      state = next;
      persist?.(state);
      emit();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function loadPersisted(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    return parsed.version === SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function persist(s: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable (private mode, quota). The demo keeps working in memory.
  }
}

let active: Store | null = null;
export function setActiveStore(s: Store) {
  active = s;
}
export function store(): Store {
  if (!active) throw new Error('Store not initialised');
  return active;
}

export function useAppState(): AppState {
  const s = store();
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}
