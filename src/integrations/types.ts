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
