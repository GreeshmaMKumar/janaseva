import { ArrowRight, CheckCircle2, Clock, FileText, HelpCircle } from 'lucide-react';
import type { Complaint, UserProfile } from '../../types/domain';
import { EmptyState } from '../shared/EmptyState';
import { PriorityIndicator, StatusIndicator } from '../shared/StatusIndicator';

export function CitizenDashboard({
  profile,
  complaints,
  loading,
  onGoSubmit,
  onGoTrack,
  onInspect,
  onOpenFeedback,
}: {
  profile: UserProfile;
  complaints: Complaint[];
  loading: boolean;
  onGoSubmit: () => void;
  onGoTrack: () => void;
  onInspect: (c: Complaint) => void;
  onOpenFeedback: (c: Complaint) => void;
}) {
  const myComplaints = complaints.filter((c) => c.citizenUid === profile.uid);
  const activeCount = myComplaints.filter(
    (c) => c.status !== 'Resolved' && c.status !== 'Closed'
  ).length;
  const infoRequested = myComplaints.filter((c) => c.status === 'Info Requested');
  const awaitingFeedback = myComplaints.filter(
    (c) => c.status === 'Resolved' && !c.feedbackSubmitted
  );
  const resolvedCount = myComplaints.filter(
    (c) => c.status === 'Resolved' || c.status === 'Closed'
  ).length;

  return (
    <div className="space-y-8">
      {/* Header Welcome Strip */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-700 uppercase">
            Citizen Grievance Desk
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy-900">
            Welcome, {profile.fullName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {profile.ward || 'Municipal Zone'} · {profile.city || 'Civic Network'}
          </p>
        </div>
        <button
          type="button"
          onClick={onGoSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 whitespace-nowrap shrink-0"
        >
          <span>Submit New Complaint</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Submitted</span>
            <FileText className="h-4 w-4 text-navy-800" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-navy-900 tabular-nums">
            {loading ? '—' : myComplaints.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Active In Progress</span>
            <Clock className="h-4 w-4 text-teal-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-teal-700 tabular-nums">
            {loading ? '—' : activeCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Action / Info Needed</span>
            <HelpCircle className="h-4 w-4 text-amber-700" aria-hidden="true" />
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-amber-700 tabular-nums">
            {loading ? '—' : infoRequested.length}
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

      {/* Action Required Alerts */}
      {infoRequested.length > 0 || awaitingFeedback.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {infoRequested.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-amber-900 tabular-nums">
                  {c.complaintCode} · Info Requested
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{c.title}</p>
              </div>
              <button
                type="button"
                onClick={() => onInspect(c)}
                className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 whitespace-nowrap"
              >
                Reply Now
              </button>
            </div>
          ))}
          {awaitingFeedback.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-teal-300 bg-teal-50 p-4"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-teal-900 tabular-nums">
                  {c.complaintCode} · Awaiting Citizen Verification
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{c.title}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenFeedback(c)}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
              >
                Rate Resolution
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Recent Complaints Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-navy-900">Recent Grievances</h2>
          {myComplaints.length > 0 ? (
            <button
              type="button"
              onClick={onGoTrack}
              className="text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              View All ({myComplaints.length})
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-11 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : myComplaints.length === 0 ? (
          <EmptyState
            title="No Grievances Submitted Yet"
            description="Report civic issues such as road damage, sanitation delays, streetlight outages, water supply disruption, or drainage flooding."
            action={
              <button
                type="button"
                onClick={onGoSubmit}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                File First Complaint
              </button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3">Complaint ID</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Assigned Wing</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Dossier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {myComplaints.slice(0, 6).map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-navy-900 tabular-nums whitespace-nowrap">
                        {c.complaintCode}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{c.title}</p>
                        <p className="text-xs text-slate-500">
                          {c.category} · {c.ward}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PriorityIndicator priority={c.priority} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{c.departmentName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusIndicator status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspect(c)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-navy-900 hover:bg-slate-100"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
