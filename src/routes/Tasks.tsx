import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSetUrlParam } from '../components/useSetUrlParam';
import { AlertCircle, CalendarDays, GripVertical, KanbanSquare, Link2, List, Plus, Trash2 } from 'lucide-react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppState, type AppState } from '../data/state';
import { createTask, deleteTask, moveTaskTo, updateTask } from '../data/actions';
import { inScope, personName, projectName } from '../data/selectors';
import { columnOf, isOverdue, localDate, TASK_STATUS_LABEL, TASK_TYPE_LABEL } from '../domain/tasks';
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type ID, type Priority, type QaTask, type TaskLink, type TaskStatus, type TaskType } from '../domain/types';
import { Card, Dialog, Drawer, Empty, Field, SafeLink, useToast } from '../components/ui';

const TYPE_TONE: Record<TaskType, string> = { automation_new: 'teal', automation_update: 'info', coverage: 'lav', meeting: 'warn', other: 'neutral' };
const PRIORITY_TONE: Record<Priority, string> = { P1: 'bad', P2: 'warn', P3: 'neutral', P4: 'neutral' };
const LINK_KIND_LABEL: Record<TaskLink['kind'], string> = { suite: 'Test suite', run: 'Test run', release: 'Release', resource: 'Library link' };

function formatDue(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Linked record's label and where it opens, or undefined when it no longer exists. */
function resolveLink(s: AppState, link: TaskLink): { label: string; to?: string; href?: string } | undefined {
  if (link.kind === 'suite') {
    const x = s.suites.find((v) => v.id === link.id);
    return x && { label: x.name, to: '/test-lab/suites' };
  }
  if (link.kind === 'run') {
    const x = s.runs.find((v) => v.id === link.id);
    return x && { label: x.name, to: `/test-lab/runs/${x.id}` };
  }
  if (link.kind === 'release') {
    const x = s.releases.find((v) => v.id === link.id);
    const build = x && s.builds.find((b) => b.id === x.buildId);
    return x && { label: `${x.type === 'hotfix' ? 'Hotfix' : 'Release'} ${build?.version ?? ''}`.trim(), to: `/releases/${x.id}` };
  }
  const x = s.resources.find((v) => v.id === link.id);
  return x && { label: x.title, href: x.url };
}

function linkOptions(s: AppState, kind: TaskLink['kind'], projectId: ID): { id: ID; label: string }[] {
  const mine = (p: ID | 'all') => p === projectId || p === 'all';
  if (kind === 'suite') return s.suites.filter((x) => mine(x.projectId)).map((x) => ({ id: x.id, label: x.name }));
  if (kind === 'run') return s.runs.filter((x) => mine(x.projectId)).map((x) => ({ id: x.id, label: x.name }));
  if (kind === 'release') return s.releases.filter((x) => mine(x.projectId)).map((x) => ({ id: x.id, label: resolveLink(s, { kind, id: x.id })!.label }));
  return s.resources.filter((x) => mine(x.projectId)).map((x) => ({ id: x.id, label: x.title }));
}

export function Tasks() {
  const s = useAppState();
  const [params] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'board';
  // Kept in local state so the checkbox responds instantly; the address follows for sharing and back links.
  const [mine, setMine] = useState(params.get('mine') === '1');
  const setParam = useSetUrlParam();
  const [owner, setOwner] = useState('');
  const [type, setType] = useState<TaskType | ''>('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<ID | null>(null);
  const today = localDate();

  const visible = s.tasks
    .filter((t) => inScope(s, t))
    .filter((t) => !mine || t.ownerId === s.currentUserId)
    .filter((t) => !owner || t.ownerId === owner)
    .filter((t) => !type || t.type === type)
    .filter((t) => !q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase()));
  const overdue = visible.filter((t) => isOverdue(t, today)).length;
  const filtered = mine || owner || type || q;
  const testers = s.people.filter((p) => p.role !== 'viewer');
  const open = openId ? s.tasks.find((t) => t.id === openId) : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>QA Tasks</h1>
          <div className="meta">
            The team's own work: automation, coverage, reviews and meetings.
            {overdue > 0 && (
              <span className="badge bad">
                <AlertCircle size={14} aria-hidden /> {overdue} overdue
              </span>
            )}
          </div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden /> New task
        </button>
      </div>

      <div className="filters">
        <div className="seg" role="group" aria-label="View">
          <button className="btn small" aria-pressed={view === 'board'} onClick={() => setParam('view', null)}>
            <KanbanSquare size={15} aria-hidden /> Board
          </button>
          <button className="btn small" aria-pressed={view === 'list'} onClick={() => setParam('view', 'list')}>
            <List size={15} aria-hidden /> List
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={mine} onChange={(e) => {
              setMine(e.target.checked);
              setParam('mine', e.target.checked ? '1' : null);
            }} /> My tasks
        </label>
        <label className="sr-only" htmlFor="t-owner">Owner</label>
        <select id="t-owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Everyone</option>
          {testers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="t-type">Type</label>
        <select id="t-type" className="input" value={type} onChange={(e) => setType(e.target.value as TaskType | '')}>
          <option value="">All types</option>
          {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABEL[t]}</option>)}
        </select>
        <label className="sr-only" htmlFor="t-q">Search tasks</label>
        <input id="t-q" className="input grow" type="search" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {visible.length === 0 && filtered ? (
        <Card><Empty title="No tasks match these filters" /></Card>
      ) : view === 'board' ? (
        <Board tasks={visible} today={today} onOpen={setOpenId} />
      ) : (
        <TaskList tasks={visible} today={today} onOpen={setOpenId} />
      )}

      {creating && <TaskDialog onClose={() => setCreating(false)} />}
      {open && <TaskDrawer task={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

// ---- Board ------------------------------------------------------------------

function Board({ tasks, today, onOpen }: { tasks: QaTask[]; today: string; onOpen: (id: ID) => void }) {
  const s = useAppState();
  const [activeId, setActiveId] = useState<ID | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const title = (id: unknown) => byId.get(String(id))?.title ?? 'task';
  const placeOf = (id: unknown) => {
    const key = String(id);
    if (key.startsWith('col:')) return `the ${TASK_STATUS_LABEL[key.slice(4) as TaskStatus]} column`;
    const t = byId.get(key);
    return t ? `${TASK_STATUS_LABEL[t.status]}, near ${t.title}` : 'nowhere';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${title(active.id)} is over ${placeOf(over.id)}.` : `${title(active.id)} is not over a column.`),
    onDragEnd: ({ active, over }) => (over ? `${title(active.id)} dropped in ${placeOf(over.id)}.` : `${title(active.id)} dropped back where it was.`),
    onDragCancel: ({ active }) => `Moving ${title(active.id)} was cancelled.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const moving = byId.get(String(active.id));
    if (!moving) return;
    const overKey = String(over.id);
    if (overKey.startsWith('col:')) {
      const status = overKey.slice(4) as TaskStatus;
      if (status !== moving.status) moveTaskTo(moving.id, status);
      return;
    }
    const target = byId.get(overKey);
    if (!target || target.id === moving.id) return;
    // Within a column, moving down lands after the target; anything else lands before it.
    const column = columnOf(s.tasks, target.status).filter((t) => t.id !== moving.id);
    const after = moving.status === target.status && moving.order < target.order;
    const idx = column.findIndex((t) => t.id === target.id) + (after ? 1 : 0);
    moveTaskTo(moving.id, target.status, column[idx]?.id);
  }

  const active = activeId ? byId.get(activeId) : undefined;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'To move a task, press Space or Enter on its handle. Use the arrow keys to move it, Space or Enter to drop it, Escape to cancel.' } }}
      onDragStart={({ active: a }) => setActiveId(String(a.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="board" aria-label="Task board">
        {TASK_STATUSES.map((status) => (
          <Column key={status} status={status} tasks={columnOf(tasks, status)} today={today} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay>{active && <TaskCardBody task={active} today={today} overlay />}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, tasks, today, onOpen }: { status: TaskStatus; tasks: QaTask[]; today: string; onOpen: (id: ID) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const headingId = `col-${status}`;
  return (
    <section className={`board-col ${isOver ? 'over' : ''}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="board-col-head">
        {TASK_STATUS_LABEL[status]} <span className="badge neutral">{tasks.length}</span>
      </h2>
      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="board-list">
          {tasks.map((t) => <SortableCard key={t.id} task={t} today={today} onOpen={onOpen} />)}
          {tasks.length === 0 && <li className="board-empty">No tasks</li>}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableCard({ task, today, onOpen }: { task: QaTask; today: string; onOpen: (id: ID) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <li ref={setNodeRef} className={`task-card ${isDragging ? 'dragging' : ''}`} style={{ transform: CSS.Translate.toString(transform), transition }} {...listeners}>
      <TaskCardBody
        task={task}
        today={today}
        handle={
          <button ref={setActivatorNodeRef} className="icon-btn drag-handle" {...attributes} aria-label={`Move ${task.title}`}>
            <GripVertical size={16} aria-hidden />
          </button>
        }
        onOpen={() => onOpen(task.id)}
      />
    </li>
  );
}

function TaskCardBody({ task, today, handle, onOpen, overlay }: { task: QaTask; today: string; handle?: ReactNode; onOpen?: () => void; overlay?: boolean }) {
  const s = useAppState();
  const late = isOverdue(task, today);
  return (
    <div className={`task-card-body ${overlay ? 'overlay' : ''}`}>
      <div className="spread" style={{ gap: 6 }}>
        <span className={`badge square ${TYPE_TONE[task.type]}`}>{TASK_TYPE_LABEL[task.type]}</span>
        {handle}
      </div>
      <button className="task-title" onClick={onOpen} tabIndex={overlay ? -1 : undefined}>
        {task.title}
      </button>
      <div className="task-meta">
        <span>{personName(s, task.ownerId)}</span>
        <span className={`badge ${PRIORITY_TONE[task.priority]}`}>{task.priority}</span>
        {task.dueDate && (
          <span className={late ? 'due late' : 'due'}>
            <CalendarDays size={13} aria-hidden /> {formatDue(task.dueDate)}
            {late && <strong> · Overdue</strong>}
          </span>
        )}
        {task.link && <Link2 size={14} aria-label="Has a linked item" />}
      </div>
    </div>
  );
}

// ---- List -------------------------------------------------------------------

type SortKey = 'due' | 'priority' | 'status';

function TaskList({ tasks, today, onOpen }: { tasks: QaTask[]; today: string; onOpen: (id: ID) => void }) {
  const s = useAppState();
  const [sort, setSort] = useState<SortKey>('due');
  const cmp: Record<SortKey, (a: QaTask, b: QaTask) => number> = {
    due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
    priority: (a, b) => a.priority.localeCompare(b.priority),
    status: (a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || a.order - b.order,
  };
  const rows = [...tasks].sort((a, b) => cmp[sort](a, b) || a.title.localeCompare(b.title));
  const header = (key: SortKey, label: string) => (
    <th aria-sort={sort === key ? 'ascending' : 'none'}>
      <button className="th-btn" onClick={() => setSort(key)}>
        {label}
        {sort === key && <span aria-hidden> ↑</span>}
      </button>
    </th>
  );
  if (rows.length === 0) return <Card><Empty title="No tasks yet">Create the first one with New task.</Empty></Card>;
  return (
    <Card className="flush">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              {header('status', 'Status')}
              <th>Owner</th>
              {header('priority', 'Priority')}
              {header('due', 'Due')}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const late = isOverdue(t, today);
              return (
                <tr key={t.id}>
                  <td>
                    <button className="task-title" onClick={() => onOpen(t.id)}>{t.title}</button>
                    {s.ui.projectId === 'all' && <div className="subtle">{projectName(s, t.projectId)}</div>}
                  </td>
                  <td className="nowrap"><span className={`badge square ${TYPE_TONE[t.type]}`}>{TASK_TYPE_LABEL[t.type]}</span></td>
                  <td className="nowrap">{TASK_STATUS_LABEL[t.status]}</td>
                  <td className="nowrap">{personName(s, t.ownerId)}</td>
                  <td><span className={`badge ${PRIORITY_TONE[t.priority]}`}>{t.priority}</span></td>
                  <td className="nowrap">
                    {t.dueDate ? <span className={late ? 'due late' : 'due'}>{formatDue(t.dueDate)}{late && <strong> · Overdue</strong>}</span> : <span className="subtle">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---- Create & edit ----------------------------------------------------------

interface FormValues {
  projectId: ID;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  ownerId: ID;
  priority: Priority;
  dueDate: string;
  linkKind: TaskLink['kind'] | '';
  linkId: ID;
}

function TaskForm({ initial, submitLabel, onSubmit, onCancel, extra }: { initial: FormValues; submitLabel: string; onSubmit: (v: FormValues) => void; onCancel: () => void; extra?: ReactNode }) {
  const s = useAppState();
  const [v, setV] = useState(initial);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof FormValues>(k: K, value: FormValues[K]) => setV((x) => ({ ...x, [k]: value }));
  const titleError = touched && !v.title.trim() ? 'Add a short title.' : undefined;
  const options = v.linkKind ? linkOptions(s, v.linkKind, v.projectId) : [];
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!v.title.trim()) return;
        onSubmit(v);
      }}
    >
      <Field label="Title" required error={titleError}>{(p) => <input {...p} className="input" value={v.title} onChange={(e) => set('title', e.target.value)} />}</Field>
      <div className="form-grid fg-2">
        <Field label="Type">{(p) => <select {...p} className="input" value={v.type} onChange={(e) => set('type', e.target.value as TaskType)}>{TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_TYPE_LABEL[t]}</option>)}</select>}</Field>
        <Field label="Status">{(p) => <select {...p} className="input" value={v.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>{TASK_STATUSES.map((t) => <option key={t} value={t}>{TASK_STATUS_LABEL[t]}</option>)}</select>}</Field>
        <Field label="Owner">{(p) => <select {...p} className="input" value={v.ownerId} onChange={(e) => set('ownerId', e.target.value)}>{s.people.filter((x) => x.role !== 'viewer').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
        <Field label="Priority">{(p) => <select {...p} className="input" value={v.priority} onChange={(e) => set('priority', e.target.value as Priority)}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select>}</Field>
        <Field label="Due date" hint="Optional.">{(p) => <input {...p} className="input" type="date" value={v.dueDate} onChange={(e) => set('dueDate', e.target.value)} />}</Field>
        <Field label="Project">{(p) => <select {...p} className="input" value={v.projectId} onChange={(e) => setV((x) => ({ ...x, projectId: e.target.value, linkId: '' }))}>{s.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
      </div>
      <Field label="Description">{(p) => <textarea {...p} className="input" rows={3} value={v.description} onChange={(e) => set('description', e.target.value)} />}</Field>
      <div className="form-grid fg-2">
        <Field label="Link to">{(p) => (
          <select {...p} className="input" value={v.linkKind} onChange={(e) => setV((x) => ({ ...x, linkKind: e.target.value as FormValues['linkKind'], linkId: '' }))}>
            <option value="">Nothing</option>
            {(Object.keys(LINK_KIND_LABEL) as TaskLink['kind'][]).map((k) => <option key={k} value={k}>{LINK_KIND_LABEL[k]}</option>)}
          </select>
        )}</Field>
        {v.linkKind && (
          <Field label={LINK_KIND_LABEL[v.linkKind]}>{(p) => (
            <select {...p} className="input" value={v.linkId} onChange={(e) => set('linkId', e.target.value)}>
              <option value="">Choose…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}</Field>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {extra}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary">{submitLabel}</button>
      </div>
    </form>
  );
}

const toFields = (v: FormValues) => ({
  projectId: v.projectId,
  title: v.title,
  description: v.description.trim(),
  type: v.type,
  ownerId: v.ownerId,
  priority: v.priority,
  dueDate: v.dueDate || undefined,
  link: v.linkKind && v.linkId ? { kind: v.linkKind, id: v.linkId } : undefined,
});

function TaskDialog({ onClose }: { onClose: () => void }) {
  const s = useAppState();
  const toast = useToast();
  const projectId = s.ui.projectId === 'all' ? s.projects[0].id : s.ui.projectId;
  const initial: FormValues = { projectId, title: '', description: '', type: 'automation_new', status: 'todo', ownerId: s.currentUserId, priority: 'P3', dueDate: '', linkKind: '', linkId: '' };
  return (
    <Dialog title="New task" onClose={onClose}>
      <TaskForm
        initial={initial}
        submitLabel="Create task"
        onCancel={onClose}
        onSubmit={(v) => {
          const id = createTask(toFields(v));
          if (v.status !== 'todo') updateTask(id, { status: v.status });
          toast(`Task “${v.title.trim()}” created`);
          onClose();
        }}
      />
    </Dialog>
  );
}

function TaskDrawer({ task, onClose }: { task: QaTask; onClose: () => void }) {
  const s = useAppState();
  const toast = useToast();
  const linked = task.link && resolveLink(s, task.link);
  const initial: FormValues = {
    ...task,
    dueDate: task.dueDate ?? '',
    linkKind: task.link?.kind ?? '',
    linkId: task.link?.id ?? '',
  };
  return (
    <Drawer title={task.title} subtitle={`${projectName(s, task.projectId)} · ${TASK_STATUS_LABEL[task.status]}`} onClose={onClose}>
      {task.link && (
        <p className="row" style={{ marginTop: 0 }}>
          <Link2 size={15} aria-hidden /> {LINK_KIND_LABEL[task.link.kind]}:{' '}
          {!linked ? <span className="subtle">Linked item no longer exists</span> : linked.href ? <SafeLink href={linked.href}>{linked.label}</SafeLink> : <Link to={linked.to!}>{linked.label}</Link>}
        </p>
      )}
      <TaskForm
        key={task.updatedAt}
        initial={initial}
        submitLabel="Save"
        onCancel={onClose}
        onSubmit={(v) => {
          updateTask(task.id, { ...toFields(v), status: v.status });
          toast('Task saved');
          onClose();
        }}
        extra={
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (!confirm(`Delete “${task.title}”?`)) return;
              deleteTask(task.id);
              toast('Task deleted');
              onClose();
            }}
          >
            <Trash2 size={15} aria-hidden /> Delete
          </button>
        }
      />
    </Drawer>
  );
}
