import { AlertTriangle, CheckCircle2, Clock, Layers } from 'lucide-react';
import { COMPLAINT_CATEGORIES } from '../../constants/civicData';
import type { Complaint, Department, FeedbackRecord, UserProfile } from '../../types/domain';
import { isComplaintOverdue } from '../shared/StatusIndicator';
import { FirestoreDiagnosticsCard } from './FirestoreDiagnosticsCard';

export function AdminDashboard({
  complaints,
  departments,
  feedbackList,
  adminUser,
  loading,
  onInspect,
}: {
  complaints: Complaint[];
  departments: Department[];
  feedbackList: FeedbackRecord[];
  adminUser: UserProfile;
  loading: boolean;
  onInspect: (c: Complaint) => void;
}) {
  const total = complaints.length;
  const resolved = complaints.filter(
    (c) => c.status === 'Resolved' || c.status === 'Closed'
  ).length;
  const pending = total - resolved;
  const overdue = complaints.filter((c) => isComplaintOverdue(c.slaDueAt, c.status)).length;

  const categoryCounts = COMPLAINT_CATEGORIES.map((cat) => {
    const items = complaints.filter((c) => c.category === cat);
    const catResolved = items.filter(
      (c) => c.status === 'Resolved' || c.status === 'Closed'
    ).length;
    return {
      category: cat,
      total: items.length,
      resolved: catResolved,
      pending: items.length - catResolved,
    };
  });

  const maxCatCount = Math.max(1, ...categoryCounts.map((c) => c.total));

  const priorityCounts = (['Critical', 'High', 'Medium', 'Low'] as const).map((p) => ({
    priority: p,
    count: complaints.filter((c) => c.priority === p).length,
  }));

  const deptStats = departments.map((dept) => {
    const deptComplaints = complaints.filter((c) => c.departmentId === dept.id);
    const deptResolved = deptComplaints.filter(
      (c) => c.status === 'Resolved' || c.status === 'Closed'
    ).length;
    const deptPending = deptComplaints.length - deptResolved;
    const deptOverdue = deptComplaints.filter((c) =>
      isComplaintOverdue(c.slaDueAt, c.status)
    ).length;
    const deptFeedback = feedbackList.filter((f) => f.departmentId === dept.id);
    const avgRating =
      deptFeedback.length > 0
        ? (deptFeedback.reduce((acc, f) => acc + f.rating, 0) / deptFeedback.length).toFixed(1)
        : '—';

    return {
      dept,
      total: deptComplaints.length,
      pending: deptPending,
      resolved: deptResolved,
      overdue: deptOverdue,
      avgRating,
      ratingCount: deptFeedback.length,
    };
  });

  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Executive 4-KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Complaints</span>
            <Layers className="h-4 w-4 text-navy-800" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-navy-900 tabular-nums">
            {loading ? '—' : total}
          </p>
          <p className="mt-1 text-xs text-slate-500">All wards &amp; categories</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Pending Complaints</span>
            <Clock className="h-4 w-4 text-amber-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-amber-700 tabular-nums">
            {loading ? '—' : pending}
          </p>
          <p className="mt-1 text-xs text-slate-500">Awaiting resolution or review</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Resolved Complaints</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-emerald-700 tabular-nums">
            {loading ? '—' : resolved}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
            {resolutionRate}% closure rate
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Overdue Complaints</span>
            <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-red-700 tabular-nums">
            {loading ? '—' : overdue}
          </p>
          <p className="mt-1 text-xs text-slate-500">Past SLA deadline</p>
        </div>
      </div>

      {/* Category Chart & Priority Breakdown */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-navy-900">
                Complaint Volume by Civic Category
              </h2>
              <p className="text-xs text-slate-500">
                Pending vs. resolved distribution across the 5 municipal infrastructure wings
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-navy-900" />
                <span>Pending</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-600" />
                <span>Resolved</span>
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {categoryCounts.map((item) => {
              const pendingPct = (item.pending / maxCatCount) * 100;
              const resolvedPct = (item.resolved / maxCatCount) * 100;
              return (
                <div key={item.category} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.category}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {item.total} total · {item.pending} pending · {item.resolved} resolved
                    </span>
                  </div>
                  <div className="flex h-5 w-full overflow-hidden rounded-md bg-slate-100">
                    {item.pending > 0 ? (
                      <div
                        style={{ width: `${Math.max(4, pendingPct)}%` }}
                        className="bg-navy-900 transition-all"
                        title={`Pending: ${item.pending}`}
                      />
                    ) : null}
                    {item.resolved > 0 ? (
                      <div
                        style={{ width: `${Math.max(4, resolvedPct)}%` }}
                        className="bg-teal-600 transition-all"
                        title={`Resolved: ${item.resolved}`}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Priority SVG Distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-4">
          <h2 className="font-display text-base font-bold text-navy-900">
            Priority Triage Distribution
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            AI Priority Assessment breakdown
          </p>

          <div className="mt-6 space-y-4">
            {priorityCounts.map((item) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              const barColor =
                item.priority === 'Critical'
                  ? 'bg-red-600'
                  : item.priority === 'High'
                    ? 'bg-amber-600'
                    : item.priority === 'Medium'
                      ? 'bg-teal-600'
                      : 'bg-slate-400';
              return (
                <div key={item.priority} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.priority}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full rounded-full ${barColor}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold text-slate-500">Citizen Satisfaction</p>
            <p className="mt-1 font-display text-2xl font-bold text-navy-900 tabular-nums">
              {feedbackList.length > 0
                ? `${(
                    feedbackList.reduce((acc, f) => acc + f.rating, 0) / feedbackList.length
                  ).toFixed(1)} / 5.0`
                : 'No ratings yet'}
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              Across {feedbackList.length} verified feedback submissions
            </p>
          </div>
        </div>
      </div>

      {/* Department-wise Statistics Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-display text-base font-bold text-navy-900">
            Department-Wise Operational Statistics
          </h2>
          <p className="text-xs text-slate-500">
            Live workload, SLA adherence, and citizen feedback per municipal department
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Head Officer</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Pending</th>
                <th className="px-4 py-3 text-right">Resolved</th>
                <th className="px-4 py-3 text-right">Overdue</th>
                <th className="px-4 py-3 text-right">Avg Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {deptStats.map((row) => (
                <tr key={row.dept.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-semibold text-navy-900">
                    {row.dept.name}
                    <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                      {row.dept.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{row.dept.category}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{row.dept.headOfficerName}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                    {row.total}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-amber-700 tabular-nums">
                    {row.pending}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-emerald-700 tabular-nums">
                    {row.resolved}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-red-700 tabular-nums">
                    {row.overdue}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                    {row.avgRating === '—' ? '—' : `${row.avgRating} (${row.ratingCount})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overdue Attention Queue */}
      {overdue > 0 ? (
        <div className="overflow-hidden rounded-xl border border-red-200 bg-white">
          <div className="border-b border-red-200 bg-red-50 px-6 py-4">
            <h2 className="font-display text-base font-bold text-red-900">
              SLA-Breached Grievances Requiring Immediate Oversight ({overdue})
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {complaints
              .filter((c) => isComplaintOverdue(c.slaDueAt, c.status))
              .slice(0, 6)
              .map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-red-700 tabular-nums">
                      {c.complaintCode} · {c.departmentName}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onInspect(c)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-slate-50"
                  >
                    Inspect Dossier
                  </button>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {/* Administrator-Only Live Firestore Connection Diagnostics */}
      <FirestoreDiagnosticsCard adminUser={adminUser} departments={departments} />
    </div>
  );
}
