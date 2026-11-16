import { DeliveryError, type Adapters } from './types';
import type { DeliveryAttempt, DeliveryJob, Finding, ISODate, JobPayload } from '../domain/types';
import { trackerBody } from '../domain/format';

export function newJob(id: string, dedupeKey: string, payload: JobPayload, at: ISODate): DeliveryJob {
  return { id, dedupeKey, payload, status: 'pending', createdAt: at, attempts: [] };
}

export interface JobContext {
  adapters: Adapters;
  findFinding(id: string): Finding | undefined;
  projectKey(projectId: string): string;
  now(): ISODate;
}

const attempt = (at: ISODate, outcome: DeliveryAttempt['outcome'], detail: string): DeliveryAttempt => ({ at, outcome, detail });

/**
 * Runs one delivery job once. Each job targets exactly one destination, so a
 * chat failure never causes the tracker job to run again.
 *
 * A timeout leaves the job "unknown": the remote side may have acted. The next
 * run reconciles by dedupe key before creating anything.
 */
export async function processJob(job: DeliveryJob, ctx: JobContext): Promise<DeliveryJob> {
  if (job.status === 'delivered') return job;
  const at = ctx.now();
  const p = job.payload;
  try {
    if (job.status === 'unknown') {
      const found =
        p.kind === 'tracker.create'
          ? await ctx.adapters.tracker.findByDedupeKey(job.dedupeKey)
          : await ctx.adapters.messaging.findByDedupeKey(job.dedupeKey);
      if (found) {
        return {
          ...job,
          status: 'delivered',
          result: found,
          attempts: [...job.attempts, attempt(at, 'reconciled', 'Found the earlier request on the remote side; nothing re-sent.')],
        };
      }
    }
    if (p.kind === 'tracker.create') {
      const f = ctx.findFinding(p.findingId);
      if (!f) throw new DeliveryError(`Finding ${p.findingId} no longer exists.`, 'failed');
      const res = await ctx.adapters.tracker.createTask({
        dedupeKey: job.dedupeKey,
        projectKey: ctx.projectKey(f.projectId),
        list: p.list,
        title: `${f.id} ${f.title}`,
        body: trackerBody(f),
        severity: f.severity,
        findingId: f.id,
      });
      return { ...job, status: 'delivered', result: res, attempts: [...job.attempts, attempt(at, 'delivered', `Created ${res.externalId} in ${p.list}.`)] };
    }
    const res = await ctx.adapters.messaging.post({ channel: p.channel, text: p.text, threadTs: p.threadTs, dedupeKey: job.dedupeKey });
    return {
      ...job,
      status: 'delivered',
      result: res,
      attempts: [...job.attempts, attempt(at, 'delivered', p.threadTs ? `Replied in thread on ${p.channel}.` : `Posted to ${p.channel}.`)],
    };
  } catch (err) {
    const e = err instanceof DeliveryError ? err : new DeliveryError(String((err as Error)?.message ?? err), 'failed');
    if (e.kind === 'timeout') {
      return { ...job, status: 'unknown', attempts: [...job.attempts, attempt(at, 'timeout', e.message)] };
    }
    return { ...job, status: 'failed', attempts: [...job.attempts, attempt(at, 'failed', e.message)] };
  }
}

export function deliverySummary(jobs: DeliveryJob[]): 'none' | 'pending' | 'delivered' | 'partial' | 'failed' {
  if (!jobs.length) return 'none';
  const delivered = jobs.filter((j) => j.status === 'delivered').length;
  const bad = jobs.filter((j) => j.status === 'failed' || j.status === 'unknown').length;
  if (delivered === jobs.length) return 'delivered';
  if (bad === jobs.length) return 'failed';
  if (bad > 0) return 'partial';
  return 'pending';
}
