// Core domain records. Everything the UI shows is derived from these.

export type ID = string;
export type ISODate = string;

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PLATFORMS = ['Android', 'iOS', 'PC', 'Switch', 'PlayStation', 'Xbox'] as const;
export type Platform = (typeof PLATFORMS)[number];

export type FindingType = 'bug' | 'feedback' | 'question';
export type FindingStatus = 'draft' | 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Project {
  id: ID;
  name: string;
  key: string;
}

export interface Build {
  id: ID;
  projectId: ID;
  version: string;
  label?: string;
  createdAt: ISODate;
}

export interface Person {
  id: ID;
  name: string;
  role: 'viewer' | 'tester' | 'lead' | 'admin';
}

export interface Attachment {
  id: ID;
  name: string;
  type: string;
  size: number;
}

export interface ExternalRef {
  provider: 'tracker';
  externalId: string;
  url: string;
  syncedAt: ISODate;
  remoteStatus?: string;
}

export interface Finding {
  id: ID;
  type: FindingType;
  projectId: ID;
  buildId?: ID;
  title: string;
  status: FindingStatus;
  reporterId: ID;
  ownerId?: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  sessionId?: ID;
  runResultRef?: { runId: ID; caseId: ID };
  duplicateOf?: ID;
  external?: ExternalRef;
  // bug
  description?: string;
  steps?: string;
  expected?: string;
  actual?: string;
  severity?: Severity;
  priority?: Priority;
  platform?: Platform;
  device?: string;
  attachments?: Attachment[];
  // feedback
  observation?: string;
  suggestion?: string;
  category?: string;
  // question
  question?: string;
  answer?: string;
  answeredAt?: ISODate;
  convertedToId?: ID;
  convertedFromId?: ID;
}

export interface Session {
  id: ID;
  projectId: ID;
  buildId: ID;
  platform: Platform;
  ownerId: ID;
  runId?: ID;
  title: string;
  status: 'open' | 'closed';
  createdAt: ISODate;
  closedAt?: ISODate;
  channel: string;
  threadTs?: string;
}

// ---- Test Lab -------------------------------------------------------------

export interface CaseStep {
  action: string;
  expected: string;
}

export interface CaseRevision {
  rev: number;
  title: string;
  preconditions: string;
  steps: CaseStep[];
  priority: Priority;
  tags: string[];
  editedAt: ISODate;
  editedBy: ID;
}

export interface Suite {
  id: ID;
  projectId: ID;
  name: string;
  description: string;
}

export interface TestCase {
  id: ID;
  projectId: ID;
  suiteId: ID;
  revisions: CaseRevision[];
}

export const RESULTS = ['passed', 'failed', 'blocked', 'untested', 'na'] as const;
export type ResultValue = (typeof RESULTS)[number];

export interface ResultAttempt {
  result: ResultValue;
  notes: string;
  evidence: string;
  testerId: ID;
  at: ISODate;
  findingIds: ID[];
}

export interface RunCaseSnapshot {
  caseId: ID;
  suiteId: ID;
  revision: CaseRevision;
  assigneeId?: ID;
  attempts: ResultAttempt[];
}

export interface Run {
  id: ID;
  name: string;
  projectId: ID;
  buildId: ID;
  platforms: Platform[];
  assigneeIds: ID[];
  createdAt: ISODate;
  status: 'active' | 'completed';
  completedAt?: ISODate;
  incompleteAck?: { reason: string; remaining: number };
  cases: RunCaseSnapshot[];
}

// ---- Releases -------------------------------------------------------------

export type Recommendation = 'ready' | 'ready_with_risks' | 'hold';

export interface ResultCounts {
  passed: number;
  failed: number;
  blocked: number;
  untested: number;
  na: number;
}

export interface EvidenceSnapshot {
  capturedAt: ISODate;
  runIds: ID[];
  runSources: { runId: ID; name: string; capturedAt: ISODate }[];
  counts: ResultCounts;
  openBySeverity: Record<Severity, number>;
  blockers: { id: ID; title: string; severity: Severity }[];
  bugsSyncedAt?: ISODate;
}

export interface RiskAcceptance {
  findingId: ID;
  rationale: string;
  ownerId: ID;
}

export interface DecisionChecklist {
  smokeLinked: boolean;
  blockersReviewed: boolean;
  risksAccepted: boolean;
}

export interface ReleaseDecisionRevision {
  rev: number;
  savedAt: ISODate;
  authorId: ID;
  evidence: EvidenceSnapshot;
  recommendation: Recommendation;
  checklist: DecisionChecklist;
  rationale: string;
  risks: RiskAcceptance[];
  message: string;
  channel: string;
  sentJobId?: ID;
}

export interface Release {
  id: ID;
  projectId: ID;
  buildId: ID;
  type: 'release' | 'hotfix';
  environment: string;
  runIds: ID[];
  revisions: ReleaseDecisionRevision[];
}

// ---- Library --------------------------------------------------------------

export const RESOURCE_KINDS = ['Game repo', 'QA repo', 'Dashboard', 'Board', 'Documentation', 'Build'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export interface ResourceLink {
  id: ID;
  projectId: ID | 'all';
  title: string;
  url: string;
  kind: ResourceKind;
  tags: string[];
  favorite: boolean;
  description: string;
}

// ---- QA tasks -------------------------------------------------------------

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TYPES = ['automation_new', 'automation_update', 'coverage', 'meeting', 'other'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export interface TaskLink {
  kind: 'suite' | 'run' | 'release' | 'resource';
  id: ID;
}

export interface QaTask {
  id: ID;
  projectId: ID;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  ownerId: ID;
  priority: Priority;
  /** Calendar date, YYYY-MM-DD. */
  dueDate?: string;
  link?: TaskLink;
  /** Position inside its status column, starting at 0. */
  order: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  completedAt?: ISODate;
}

// ---- Integrations & delivery ---------------------------------------------

export interface Route {
  projectId: ID;
  type: FindingType;
  tracker: { enabled: boolean; list: string };
  messaging: { enabled: boolean; channel: string };
}

export type JobStatus = 'pending' | 'delivered' | 'failed' | 'unknown';

export interface DeliveryAttempt {
  at: ISODate;
  outcome: 'delivered' | 'failed' | 'timeout' | 'reconciled';
  detail: string;
}

export type JobPayload =
  | { kind: 'tracker.create'; findingId: ID; list: string }
  | { kind: 'messaging.post'; channel: string; text: string; threadTs?: string; findingId?: ID; releaseId?: ID; rev?: number; sessionId?: ID };

export interface DeliveryJob {
  id: ID;
  dedupeKey: string;
  payload: JobPayload;
  status: JobStatus;
  createdAt: ISODate;
  attempts: DeliveryAttempt[];
  result?: { externalId?: string; url?: string; ts?: string };
}

export interface AuditEvent {
  id: ID;
  at: ISODate;
  actorId: ID;
  kind: 'finding' | 'run' | 'question' | 'build' | 'delivery' | 'release' | 'digest' | 'session' | 'library' | 'task';
  title: string;
  detail: string;
  link?: string;
}
