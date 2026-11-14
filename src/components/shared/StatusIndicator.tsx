import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSearch,
  HelpCircle,
  ShieldAlert,
  UserCheck,
  Wrench,
} from 'lucide-react';
import type { ComplaintPriority, ComplaintStatus } from '../../types/domain';

export function StatusIndicator({ status }: { status: ComplaintStatus }) {
  const map: Record<
    ComplaintStatus,
    { colorClass: string; Icon: typeof Clock; label: string }
  > = {
    Submitted: { colorClass: 'text-slate-700', Icon: Clock, label: 'Submitted' },
    'Under Review': { colorClass: 'text-navy-800', Icon: FileSearch, label: 'Under Review' },
    Assigned: { colorClass: 'text-teal-700', Icon: UserCheck, label: 'Assigned' },
    'In Progress': { colorClass: 'text-teal-700', Icon: Wrench, label: 'In Progress' },
    'Info Requested': { colorClass: 'text-amber-700', Icon: HelpCircle, label: 'Info Requested' },
    Escalated: { colorClass: 'text-red-700', Icon: ShieldAlert, label: 'Escalated' },
    Resolved: { colorClass: 'text-emerald-700', Icon: CheckCircle2, label: 'Resolved' },
    Closed: { colorClass: 'text-slate-600', Icon: CheckCircle2, label: 'Closed' },
  };

  const cfg = map[status] || map.Submitted;
  const Icon = cfg.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${cfg.colorClass}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}

export function PriorityIndicator({ priority }: { priority: ComplaintPriority }) {
  const map: Record<ComplaintPriority, { colorClass: string; label: string }> = {
    Low: { colorClass: 'text-slate-600', label: 'Low' },
    Medium: { colorClass: 'text-teal-700', label: 'Medium' },
    High: { colorClass: 'text-amber-700', label: 'High' },
    Critical: { colorClass: 'text-red-700', label: 'Critical' },
  };
  const cfg = map[priority] || map.Medium;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${cfg.colorClass}`}>
      {priority === 'Critical' || priority === 'High' ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      <span>{cfg.label}</span>
    </span>
  );
}

export function isComplaintOverdue(slaDueAt: string, status: ComplaintStatus): boolean {
  if (status === 'Resolved' || status === 'Closed') return false;
  const due = Date.parse(slaDueAt);
  if (Number.isNaN(due)) return false;
  return Date.now() > due;
}

export function formatSlaRemaining(slaDueAt: string, status: ComplaintStatus): string {
  if (status === 'Resolved' || status === 'Closed') return 'Completed';
  const due = Date.parse(slaDueAt);
  if (Number.isNaN(due)) return 'Standard SLA';
  const diffHours = Math.round((due - Date.now()) / 3600000);
  if (diffHours < 0) return `Overdue by ${Math.abs(diffHours)}h`;
  if (diffHours === 0) return 'Due <1h';
  return `${diffHours}h remaining`;
}
