// Provider-neutral integration boundary. Domain code depends on these
// interfaces only; the demo ships mock implementations.

export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly kind: 'failed' | 'timeout' | 'rate_limited',
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}

export interface RemoteTask {
  externalId: string;
  dedupeKey?: string;
  projectKey: string;
  list: string;
  title: string;
  status: string;
  severity: string;
  url: string;
  updatedAt: string;
  findingId?: string;
}

export interface TaskPage {
  items: RemoteTask[];
  nextCursor?: string;
}

export interface IssueTracker {
  readonly name: string;
  createTask(input: { dedupeKey: string; projectKey: string; list: string; title: string; body: string; severity?: string; findingId: string }): Promise<{ externalId: string; url: string }>;
  /** Used to reconcile an ambiguous timeout before creating again. */
  findByDedupeKey(key: string): Promise<{ externalId: string; url: string } | null>;
  listTasks(input: { projectKey?: string; cursor?: string }): Promise<TaskPage>;
}

export interface TeamMessaging {
  readonly name: string;
  readonly maxMessageChars: number;
  post(input: { channel: string; text: string; threadTs?: string; dedupeKey: string }): Promise<{ ts: string }>;
  findByDedupeKey(key: string): Promise<{ ts: string } | null>;
}

export interface Adapters {
  tracker: IssueTracker;
  messaging: TeamMessaging;
}

// --- Planned connector boundaries (no implementation in the demo) ---

export interface RemoteCase {
  externalId: string;
  title: string;
  section?: string;
  steps: string;
  expected: string;
  updatedAt: string;
}

export interface RemoteResult {
  caseExternalId: string;
  status: 'passed' | 'failed' | 'blocked' | 'untested' | 'na';
  comment?: string;
  defects?: string[];
  elapsedSeconds?: number;
}

/** Test case management tools such as TestRail, Zephyr Scale, Xray or Qase. */
export interface TestManagement {
  readonly name: string;
  listCases(input: { projectKey: string; suiteKey?: string; cursor?: string }): Promise<{ items: RemoteCase[]; nextCursor?: string }>;
  createRun(input: { projectKey: string; name: string; caseIds: string[]; dedupeKey: string }): Promise<{ externalId: string; url: string }>;
  /** Results are appended, never overwritten, matching the local attempt history. */
  addResults(input: { runExternalId: string; results: RemoteResult[]; dedupeKey: string }): Promise<void>;
}

/** Read-only sources for the Library and build picker: docs, boards, dashboards, builds. */
export interface LinkSource {
  readonly name: string;
  listLinks(input: { cursor?: string }): Promise<{ items: { title: string; url: string; tags: string[] }[]; nextCursor?: string }>;
}
