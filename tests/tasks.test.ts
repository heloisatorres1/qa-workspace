import { columnOf, isOverdue, localDate, moveTask } from '../src/domain/tasks';
import { createTask, deleteTask, moveTaskTo, updateTask } from '../src/data/actions';
import { createStore, loadPersisted, setActiveStore, store, STORAGE_KEY } from '../src/data/state';
import { seed } from '../src/data/fixtures';
import type { QaTask } from '../src/domain/types';

const NOW = '2026-11-20T10:00:00.000Z';
const t = (id: string, status: QaTask['status'], order: number, extra: Partial<QaTask> = {}): QaTask => ({
  id,
  projectId: 'og',
  title: id,
  description: '',
  type: 'other',
  status,
  ownerId: 'u-alex',
  priority: 'P3',
  order,
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});

describe('isOverdue', () => {
  const today = '2026-11-20';
  it('is overdue when the due date has passed and the task is not done', () => {
    expect(isOverdue(t('a', 'todo', 0, { dueDate: '2026-11-19' }), today)).toBe(true);
    expect(isOverdue(t('a', 'in_review', 0, { dueDate: '2026-11-01' }), today)).toBe(true);
  });
  it('is never overdue when done, due today, or without a due date', () => {
    expect(isOverdue(t('a', 'done', 0, { dueDate: '2026-11-19' }), today)).toBe(false);
    expect(isOverdue(t('a', 'todo', 0, { dueDate: today }), today)).toBe(false);
    expect(isOverdue(t('a', 'todo', 0), today)).toBe(false);
  });
  it('formats the local calendar date', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('moveTask', () => {
  const base = [t('a', 'todo', 0), t('b', 'todo', 1), t('c', 'todo', 2), t('d', 'in_progress', 0)];

  it('moves a task to another column at the given position and renumbers both columns', () => {
    const next = moveTask(base, 'b', 'in_progress', 0, NOW);
    expect(columnOf(next, 'todo').map((x) => [x.id, x.order])).toEqual([['a', 0], ['c', 1]]);
    expect(columnOf(next, 'in_progress').map((x) => [x.id, x.order])).toEqual([['b', 0], ['d', 1]]);
  });

  it('reorders inside the same column', () => {
    const next = moveTask(base, 'a', 'todo', 2, NOW);
    expect(columnOf(next, 'todo').map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('drops into an empty column and clamps the position', () => {
    const next = moveTask(base, 'c', 'in_review', 99, NOW);
    expect(columnOf(next, 'in_review').map((x) => [x.id, x.order])).toEqual([['c', 0]]);
  });

  it('sets completedAt when moved to done and clears it when moved out', () => {
    const done = moveTask(base, 'a', 'done', 0, NOW);
    expect(done.find((x) => x.id === 'a')!.completedAt).toBe(NOW);
    const back = moveTask(done, 'a', 'todo', 0, NOW);
    expect(back.find((x) => x.id === 'a')!.completedAt).toBeUndefined();
  });

  it('leaves the list unchanged for an unknown id', () => {
    expect(moveTask(base, 'zzz', 'done', 0, NOW)).toBe(base);
  });
});

describe('task actions and saved data', () => {
  beforeEach(() => setActiveStore(createStore(seed(new Date('2026-11-16T12:00:00Z')))));

  it('keeps old saved demo data and adds the example tasks', () => {
    const old = seed(new Date('2026-11-16T12:00:00Z')) as Partial<ReturnType<typeof seed>>;
    delete old.tasks;
    old.findings = old.findings!.slice(0, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    const loaded = loadPersisted()!;
    expect(loaded.findings).toHaveLength(1);
    expect(loaded.tasks.length).toBeGreaterThanOrEqual(10);
    localStorage.removeItem(STORAGE_KEY);
  });

  it('creates a task at the top of To do and logs it', () => {
    const id = createTask({ projectId: 'og', title: '  Automate login  ', description: '', type: 'automation_new', ownerId: 'u-sam', priority: 'P2' });
    const s = store().get();
    const task = s.tasks.find((x) => x.id === id)!;
    expect(task).toMatchObject({ title: 'Automate login', status: 'todo', order: 0 });
    expect(columnOf(s.tasks.filter((x) => x.projectId === 'og'), 'todo')[0].id).toBe(id);
    expect(s.events[0]).toMatchObject({ kind: 'task', title: 'Task created' });
  });

  it('moves before another task, and logs completion when moved to Done', () => {
    moveTaskTo('task-1', 'in_progress', 'task-6');
    expect(columnOf(store().get().tasks, 'in_progress').map((x) => x.id).slice(0, 2)).toEqual(['task-5', 'task-1']);
    moveTaskTo('task-1', 'done');
    const s = store().get();
    expect(columnOf(s.tasks, 'done').at(-1)!.id).toBe('task-1');
    expect(s.events[0]).toMatchObject({ kind: 'task', title: 'Task completed' });
  });

  it('edits and deletes a task', () => {
    updateTask('task-2', { title: 'Renamed', status: 'done' });
    expect(store().get().tasks.find((x) => x.id === 'task-2')).toMatchObject({ title: 'Renamed', status: 'done' });
    deleteTask('task-2');
    expect(store().get().tasks.some((x) => x.id === 'task-2')).toBe(false);
  });
});
