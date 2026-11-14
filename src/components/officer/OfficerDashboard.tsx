import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Search,
  Wrench,
} from 'lucide-react';
import type { AgentLogRecord, Complaint, Department, UserProfile } from '../../types/domain';
import { EmptyState } from '../shared/EmptyState';
import {
  formatSlaRemaining,
  isComplaintOverdue,
  PriorityIndicator,
  StatusIndicator,
} from '../shared/StatusIndicator';
import { OfficerReviewDrawer } from './OfficerReviewDrawer';

export function OfficerDashboard({
  profile,
  complaints,
  departments,
  agentLogs,
  loading,
  mode,
  onInspect,
}: {
  profile: UserProfile;
  complaints: Complaint[];
  departments: Department[];
  agentLogs: AgentLogRecord[];
  loading: boolean;
  mode: 'queue' | 'escalated' | 'departments';
  onInspect: (c: Complaint) => void;
}) {
  const [filterTab, setFilterTab] = useState<'all' | 'pending_approval' | 'active' | 'resolved'>(
    'all'
  );
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewingComplaintId, setReviewingComplaintId] = useState<string | null>(null);

  const activeReviewComplaint = useMemo(
    () => complaints.find((c) => c.id === reviewingComplaintId) || null,
    [complaints, reviewingComplaintId]
  );

  const logsByComplaintId = useMemo(() => {
    const map = new Map<string, AgentLogRecord[]>();
    for (const log of agentLogs) {
      const list = map.get(log.complaintId);
      if (list) list.push(log);
      else map.set(log.complaintId, [log]);
    }
    return map;
  }, [agentLogs]);

  const pendingApprovalCount = complaints.filter(
    (c) => !c.departmentApproved && c.status !== 'Resolved' && c.status !== 'Closed'
  ).length;
  const activeCount = complaints.filter(
    (c) => c.status !== 'Resolved' && c.status !== 'Closed'
  ).length;
  const escalatedOrOverdueCount = complaints.filter(
    (c) => c.status === 'Escalated' || isComplaintOverdue(c.slaDueAt, c.status)
  ).length;
  const resolvedCount = complaints.filter(
    (c) => c.status === 'Resolved' || c.status === 'Closed'
  ).length;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return complaints.filter((c) => {
      if (mode === 'escalated') {
        if (c.status !== 'Escalated' && !isComplaintOverdue(c.slaDueAt, c.status)) return false;
      } else if (filterTab === 'pending_approval') {
        if (c.departmentApproved || c.status === 'Resolved' || c.status === 'Closed') return false;
      } else if (filterTab === 'active') {
        if (c.status === 'Resolved' || c.status === 'Closed') return false;
      } else if (filterTab === 'resolved') {
        if (c.status !== 'Resolved' && c.status !== 'Closed') return false;
      }

      if (deptFilter !== 'all' && c.departmentId !== deptFilter) return false;
      if (!q) return true;
      return (
        c.complaintCode.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.ward.toLowerCase().includes(q) ||
        c.citizenName.toLowerCase().includes(q)
      );
    });
  }, [complaints, mode, filterTab, deptFilter, searchQuery]);

  if (mode === 'departments') {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="font-display text-xl font-bold text-navy-900">
            Municipal Department Roster &amp; SLA Standards
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Active civic engineering wings and statutory turnaround commitments.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Department Name</th>
                  <th className="px-4 py-3">Primary Category</th>
                  <th className="px-4 py-3">Head Officer</th>
                  <th className="px-4 py-3 text-right">SLA Target</th>
                  <th className="px-4 py-3 text-right">Assigned Cases</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {departments.map((d) => {
                  const count = complaints.filter((c) => c.departmentId === d.id).length;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-navy-900">
                        {d.code}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{d.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{d.category}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{d.headOfficerName}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        {d.slaHours}h
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-navy-900 tabular-nums">
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Officer KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Pending Routing Approval</span>
            <ClipboardCheck className="h-4 w-4 text-amber-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-amber-700 tabular-nums">
            {loading ? '—' : pendingApprovalCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Active Open Cases</span>
            <Wrench className="h-4 w-4 text-teal-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-navy-900 tabular-nums">
            {loading ? '—' : activeCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Escalated / SLA Breach</span>
            <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-red-700 tabular-nums">
            {loading ? '—' : escalatedOrOverdueCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Resolved &amp; Closed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-emerald-700 tabular-nums">
            {loading ? '—' : resolvedCount}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        {mode === 'queue' ? (
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'all', label: 'All Assigned' },
                { id: 'pending_approval', label: 'Needs Approval' },
                { id: 'active', label: 'In Progress' },
                { id: 'resolved', label: 'Resolved' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  filterTab === tab.id
                    ? 'bg-white text-navy-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <h2 className="font-display text-base font-bold text-red-800">
              Escalated &amp; SLA-Overdue Grievances
            </h2>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, title, citizen..."
              className="w-full rounded-lg border border-slate-300 py-1.5 pr-3 pl-9 text-sm text-slate-900 focus:border-teal-600 focus:outline-none sm:w-56"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Officer Queue Table */}
      {loading ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Complaints in Queue"
          description={
            mode === 'escalated'
              ? 'No grievances are currently escalated or breaching SLA timelines.'
              : 'No complaints match the current department or status filter.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Complaint ID</th>
                  <th className="px-4 py-3">Grievance &amp; Reporter</th>
                  <th className="px-4 py-3">AI Category &amp; Priority</th>
                  <th className="px-4 py-3">AI Pipeline Status</th>
                  <th className="px-4 py-3">Department Routing</th>
                  <th className="px-4 py-3">SLA &amp; Status</th>
                  <th className="px-4 py-3 text-right">Officer Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((c) => {
                  const overdue = isComplaintOverdue(c.slaDueAt, c.status);
                  const logs = logsByComplaintId.get(c.id) || [];
                  const agentStepLogs = logs.filter((l) => l.agentName !== 'Central Orchestrator');
                  const failedAgents = agentStepLogs.filter((l) => l.status === 'Failed').length;
                  const escalatedAgents = agentStepLogs.filter((l) => l.status === 'Escalated').length;
                  const warningAgents = agentStepLogs.filter((l) => l.status === 'Warning').length;
                  const orchLog = logs.find((l) => l.agentName === 'Central Orchestrator');
                  const statusTone =
                    failedAgents > 0
                      ? 'text-red-700'
                      : escalatedAgents > 0
                        ? 'text-red-700'
                        : warningAgents > 0
                          ? 'text-amber-700'
                          : 'text-emerald-700';
                  const statusLabel =
                    logs.length > 0
                      ? failedAgents > 0
                        ? `${failedAgents} Agent Failed (${agentStepLogs.length}/6)`
                        : escalatedAgents > 0
                          ? `${agentStepLogs.length}/6 Run · Escalated`
                          : warningAgents > 0
                            ? `${agentStepLogs.length}/6 Run · Warning`
                            : `${agentStepLogs.length}/6 Agents Completed`
                      : c.aiExecutionSummary || 'Triaged (Awaiting Trace Sync)';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3.5 align-top font-mono text-xs font-semibold text-navy-900 tabular-nums whitespace-nowrap">
                        {c.complaintCode}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-semibold text-slate-900">{c.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {c.citizenName} · {c.locationText} · {c.ward}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="text-xs font-medium text-slate-800">{c.aiCategory}</p>
                        <div className="mt-1">
                          <PriorityIndicator priority={c.priority} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs">
                        <p className={`font-semibold ${statusTone}`}>{statusLabel}</p>
                        {orchLog ? (
                          <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                            Pipeline: {orchLog.latencyMs}ms
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs">
                        <p className="font-semibold text-slate-900">{c.departmentName}</p>
                        <p
                          className={`mt-0.5 font-medium ${
                            c.departmentApproved ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {c.departmentApproved ? 'Approved' : 'Awaiting Approval'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        <StatusIndicator status={c.status} />
                        <p
                          className={`mt-1 flex items-center gap-1 font-mono text-xs tabular-nums ${
                            overdue ? 'font-semibold text-red-700' : 'text-slate-500'
                          }`}
                        >
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          <span>{formatSlaRemaining(c.slaDueAt, c.status)}</span>
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onInspect(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Dossier</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setReviewingComplaintId(c.id)}
                            className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800"
                          >
                            Take Action
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReviewComplaint ? (
        <OfficerReviewDrawer
          complaint={activeReviewComplaint}
          departments={departments}
          agentLogs={logsByComplaintId.get(activeReviewComplaint.id) || []}
          officer={profile}
          onClose={() => setReviewingComplaintId(null)}
        />
      ) : null}
    </div>
  );
}
