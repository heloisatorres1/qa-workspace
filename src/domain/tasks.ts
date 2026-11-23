// Rules for the QA team's own work items (not bugs).
import type { ID, ISODate, QaTask, TaskStatus, TaskType } from './types';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', in_review: 'In review', done: 'Done' };

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  automation_new: 'New automation',
  automation_update: 'Update automation',
  coverage: 'Test coverage',
  meeting: 'Meeting / review',
  other: 'Other',
};

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Overdue: due date before today and not done. Due today is still on time. */
export function isOverdue(task: QaTask, today: string = localDate()): boolean {
  return !!task.dueDate && task.status !== 'done' && task.dueDate < today;
}

export function columnOf(tasks: QaTask[], status: TaskStatus): QaTask[] {
  return tasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order);
}

/** Moves a task to `status` at position `index`, renumbering the columns it leaves and enters. */
export function moveTask(tasks: QaTask[], id: ID, status: TaskStatus, index: number, now: ISODate): QaTask[] {
  const moving = tasks.find((t) => t.id === id);
  if (!moving) return tasks;
  const target = columnOf(tasks, status).filter((t) => t.id !== id);
  const at = Math.max(0, Math.min(index, target.length));
  const statusChanged = moving.status !== status;
  const moved: QaTask = {
    ...moving,
    status,
    updatedAt: statusChanged ? now : moving.updatedAt,
    completedAt: status === 'done' ? (statusChanged ? now : moving.completedAt) : undefined,
  };
  target.splice(at, 0, moved);
  const orders = new Map<ID, QaTask>();
  target.forEach((t, i) => orders.set(t.id, { ...t, order: i }));
  if (statusChanged) columnOf(tasks, moving.status).filter((t) => t.id !== id).forEach((t, i) => orders.set(t.id, { ...t, order: i }));
  return tasks.map((t) => orders.get(t.id) ?? t);
}
