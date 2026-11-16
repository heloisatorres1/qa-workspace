import type { Finding, Severity } from './types';

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/**
 * Escapes user text for chat messages: control characters are encoded and
 * broadcast mentions are neutralised so a report can never ping a channel.
 */
export function escapeChat(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@(channel|here|everyone)\b/gi, '@​$1');
}

export function trackerBody(f: Finding): string {
  const parts: string[] = [];
  if (f.type === 'bug') {
    if (f.description) parts.push(f.description);
    parts.push(`Steps to reproduce\n${f.steps ?? ''}`);
    parts.push(`Expected result\n${f.expected ?? ''}`);
    parts.push(`Actual result\n${f.actual ?? ''}`);
    const env = [f.platform, f.device].filter(Boolean).join(' · ');
    if (env) parts.push(`Environment\n${env}`);
  } else if (f.type === 'feedback') {
    parts.push(`Observation\n${f.observation ?? ''}`);
    if (f.suggestion) parts.push(`Suggested improvement\n${f.suggestion}`);
  } else {
    parts.push(`Question\n${f.question ?? ''}`);
  }
  if (f.attachments?.length) parts.push(`Attachments\n${f.attachments.map((a) => a.name).join('\n')}`);
  return parts.join('\n\n');
}

export function chatSummary(f: Finding, projectName: string, buildVersion?: string): string {
  const tags = [
    f.severity ? SEVERITY_LABEL[f.severity] : undefined,
    f.priority,
    projectName,
    buildVersion,
    f.platform,
  ].filter(Boolean);
  const kind = f.type === 'bug' ? 'Bug' : f.type === 'feedback' ? 'Feedback' : 'Question';
  const lines = [`*${kind} ${f.id}: ${escapeChat(f.title)}*`, tags.join(' · ')];
  if (f.type === 'question' && f.question) lines.push(escapeChat(f.question));
  if (f.type === 'feedback' && f.observation) lines.push(escapeChat(f.observation));
  return lines.join('\n');
}
