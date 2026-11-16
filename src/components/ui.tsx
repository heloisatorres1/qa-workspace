import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  ExternalLink as ExternalIcon,
  Info,
  Inbox,
  Loader2,
  MinusCircle,
  X,
  XCircle,
} from 'lucide-react';
import type { DeliveryJob, FindingStatus, Recommendation, ResultValue, Severity } from '../domain/types';
import { SEVERITY_LABEL } from '../domain/format';
import { RECOMMENDATION_LABEL } from '../domain/release';

export function SeverityBadge({ value }: { value?: Severity }) {
  if (!value) return <span className="badge neutral">No severity</span>;
  return (
    <span className={`badge ${value}`}>
      <span className="dot" aria-hidden />
      {SEVERITY_LABEL[value]}
    </span>
  );
}

export const RESULT_LABEL: Record<ResultValue, string> = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked', untested: 'Untested', na: 'Not applicable' };
const RESULT_ICON: Record<ResultValue, ReactNode> = {
  passed: <CheckCircle2 size={14} aria-hidden />,
  failed: <XCircle size={14} aria-hidden />,
  blocked: <CircleSlash size={14} aria-hidden />,
  untested: <CircleDashed size={14} aria-hidden />,
  na: <MinusCircle size={14} aria-hidden />,
};
export function ResultBadge({ value }: { value: ResultValue }) {
  return (
    <span className={`badge ${value}`}>
      {RESULT_ICON[value]}
      {RESULT_LABEL[value]}
    </span>
  );
}

export const STATUS_LABEL: Record<FindingStatus, string> = { draft: 'Draft', open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };
export function StatusBadge({ value }: { value: FindingStatus }) {
  const cls = value === 'draft' ? 'lav' : value === 'open' ? 'info' : value === 'in_progress' ? 'teal' : 'neutral';
  return <span className={`badge ${cls} square`}>{STATUS_LABEL[value]}</span>;
}

export function RecommendationBadge({ value }: { value: Recommendation }) {
  const cls = value === 'ready' ? 'good' : value === 'hold' ? 'bad' : 'warn';
  return <span className={`badge ${cls}`}>{RECOMMENDATION_LABEL[value]}</span>;
}

export function JobBadge({ job }: { job: DeliveryJob }) {
  switch (job.status) {
    case 'pending':
      return (
        <span className="badge neutral">
          <Loader2 size={13} className="spin" aria-hidden /> Saved · pending delivery
        </span>
      );
    case 'delivered':
      return (
        <span className="badge good">
          <CheckCircle2 size={13} aria-hidden /> Delivered
        </span>
      );
    case 'failed':
      return (
        <span className="badge bad">
          <XCircle size={13} aria-hidden /> Failed
        </span>
      );
    case 'unknown':
      return (
        <span className="badge warn">
          <AlertTriangle size={13} aria-hidden /> Uncertain · check before resending
        </span>
      );
  }
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  const Icon = tone === 'info' ? Info : tone === 'good' ? CheckCircle2 : tone === 'bad' ? AlertCircle : AlertTriangle;
  return (
    <div className={`callout ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={32} aria-hidden />}
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Card({ title, actions, children, className = '', titleId }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; titleId?: string }) {
  return (
    <section className={`card ${className}`} aria-labelledby={titleId}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2 id={titleId}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-err` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden>
            {' '}*
          </span>
        )}
        {required && <span className="sr-only"> (required to submit)</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error-text" id={`${id}-err`}>
          <AlertCircle size={14} aria-hidden /> {error}
        </span>
      )}
    </div>
  );
}

export function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  let ok = false;
  try {
    ok = ['http:', 'https:'].includes(new URL(href).protocol);
  } catch {
    ok = false;
  }
  if (!ok) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="row" style={{ display: 'inline-flex', gap: 4 }}>
      {children}
      <ExternalIcon size={13} aria-hidden />
      <span className="sr-only">(external link, opens in a new tab)</span>
    </a>
  );
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// ---- Overlays -----------------------------------------------------------

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

function useFocusOnOpen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  return ref;
}

export function Drawer({ title, subtitle, onClose, children }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  const ref = useFocusOnOpen();
  const id = useId();
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref}>
        <div className="drawer-head">
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <div className="subtle">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close panel">
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  const ref = useFocusOnOpen();
  const id = useId();
  return (
    <>
      <div className="dialog-backdrop" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} ref={ref}>
        <div className="spread" style={{ marginBottom: 14 }}>
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ---- Toasts -------------------------------------------------------------

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Donut({ segments, size = 150, label, sub }: { segments: { value: number; color: string; label: string }[]; size?: number; label: string; sub: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f2" strokeWidth={22} />
      {segments.map((s) => {
        const len = (s.value / total) * c;
        const el = (
          <circle
            key={s.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={22}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x="50%" y="48%" textAnchor="middle" fontSize="28" fontWeight="700" fill="#172b3a">
        {label}
      </text>
      <text x="50%" y="64%" textAnchor="middle" fontSize="13" fill="#4a5c6a">
        {sub}
      </text>
    </svg>
  );
}

export const RESULT_COLOR: Record<ResultValue, string> = { passed: '#16897e', failed: '#e5675d', blocked: '#e8a93a', untested: '#d5dade', na: '#eef0f2' };

/**
 * Renders the small chat markup subset used in previews: *bold* and
 * <url|label> links. Text is already escaped for chat, so entities are
 * decoded for display and everything renders as plain React text.
 */
export function ChatText({ text }: { text: string }) {
  const decode = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return (
    <>
      {text.split('\n').map((line, i) => (
        <div key={i}>
          {line.split(/(\*[^*\n]+\*|<https?:[^|>]+\|[^>]+>)/g).map((part, j) => {
            if (/^\*[^*]+\*$/.test(part)) return <b key={j}>{decode(part.slice(1, -1))}</b>;
            const link = part.match(/^<(https?:[^|>]+)\|([^>]+)>$/);
            if (link) return <a key={j} href={link[1]} target="_blank" rel="noopener noreferrer">{decode(link[2])}</a>;
            return <span key={j}>{decode(part)}</span>;
          })}
          {line === '' && ' '}
        </div>
      ))}
    </>
  );
}
