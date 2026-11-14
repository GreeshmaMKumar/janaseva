import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { COMPLAINT_STATUSES } from '../../constants/civicData';
import type { Complaint, ComplaintStatus } from '../../types/domain';
import { EmptyState } from '../shared/EmptyState';
import {
  formatSlaRemaining,
  PriorityIndicator,
  StatusIndicator,
} from '../shared/StatusIndicator';

export function TrackComplaints({
  complaints,
  highlightedCode,
  onClearHighlight,
  onInspect,
  onGiveFeedback,
  onGoSubmit,
  onRetryAiProcessing,
}: {
  complaints: Complaint[];
  highlightedCode?: string | null;
  onClearHighlight?: () => void;
  onInspect: (c: Complaint) => void;
  onGiveFeedback: (c: Complaint) => void;
  onGoSubmit: () => void;
  onRetryAiProcessing?: (c: Complaint) => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | ComplaintStatus>('All');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);

  const prevSnapshotRef = useRef<Map<string, { status: ComplaintStatus; approved: boolean }>>(
    new Map()
  );

  // Real-time officer approval & status-change notification via Firestore onSnapshot updates
  useEffect(() => {
    const prev = prevSnapshotRef.current;
    if (prev.size > 0) {
      for (const c of complaints) {
        const old = prev.get(c.id);
        if (old) {
          if (!old.approved && c.departmentApproved) {
            setLiveNotice(
              `${c.complaintCode}: Officer approved assignment to ${c.departmentName} (Status: ${c.status}).`
            );
          } else if (old.status !== c.status) {
            setLiveNotice(
              `${c.complaintCode}: Status updated in real time from "${old.status}" to "${c.status}".`
            );
          }
        }
      }
    }
    const next = new Map<string, { status: ComplaintStatus; approved: boolean }>();
    for (const c of complaints) {
      next.set(c.id, { status: c.status, approved: Boolean(c.departmentApproved) });
    }
    prevSnapshotRef.current = next;
  }, [complaints]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return complaints.filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.complaintCode.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.locationText.toLowerCase().includes(q) ||
        c.departmentName.toLowerCase().includes(q)
      );
    });
  }, [complaints, searchQuery, statusFilter]);

  const handleRetryRow = async (c: Complaint) => {
    if (!onRetryAiProcessing || retryingId) return;
    setRetryingId(c.id);
    setRetryError(null);
    try {
      await onRetryAiProcessing(c);
      setLiveNotice(
        `${c.complaintCode}: 6-agent Gemini AI triage completed and saved to Firestore.`
      );
    } catch (err) {
      setRetryError(
        err instanceof Error
          ? `${c.complaintCode}: ${err.message}`
          : `${c.complaintCode}: AI retry failed.`
      );
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {highlightedCode ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-700" />
            <p>
              Tracking <span className="font-mono font-semibold tabular-nums">{highlightedCode}</span>{' '}
              in real time. Officer approvals and status changes appear here automatically.
            </p>
          </div>
          {onClearHighlight ? (
            <button
              type="button"
              onClick={onClearHighlight}
              aria-label="Dismiss tracking notice"
              className="rounded p-1 text-teal-800 hover:bg-teal-100"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {liveNotice ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-700" />
            <p className="font-medium">{liveNotice}</p>
          </div>
          <button
            type="button"
            onClick={() => setLiveNotice(null)}
            aria-label="Dismiss status update notification"
            className="rounded p-1 text-teal-800 hover:bg-teal-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {retryError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-700" />
            <p>{retryError}</p>
          </div>
          <button
            type="button"
            onClick={() => setRetryError(null)}
            aria-label="Dismiss error"
            className="rounded p-1 text-red-800 hover:bg-red-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Complaint ID (JNS-...), title, location, or department..."
            className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="citizen-status-filter" className="text-xs font-semibold text-slate-600">
            Status
          </label>
          <select
            id="citizen-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | ComplaintStatus)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          >
            <option value="All">All Statuses</option>
            {COMPLAINT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No Matching Grievances"
          description={
            complaints.length === 0
              ? 'You have not submitted any civic complaints yet. Submit a grievance to receive a tracking ID and AI triage report.'
              : 'No complaints match your current search or status filter.'
          }
          action={
            complaints.length === 0 ? (
              <button
                type="button"
                onClick={onGoSubmit}
                className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
              >
                Submit First Complaint
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Complaint ID</th>
                  <th className="px-4 py-3">Issue &amp; Location</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status &amp; Timeline</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((c) => {
                  const latestEvent =
                    c.auditTrail && c.auditTrail.length > 0
                      ? c.auditTrail[c.auditTrail.length - 1]
                      : null;
                  const isHighlighted = highlightedCode === c.complaintCode;

                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors hover:bg-slate-50/80 ${
                        isHighlighted ? 'bg-teal-50/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5 align-top font-mono text-xs font-semibold text-navy-900 tabular-nums whitespace-nowrap">
                        {c.complaintCode}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-semibold text-slate-900">{c.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {c.locationText} · {c.ward}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs text-slate-700 whitespace-nowrap">
                        {c.category}
                      </td>
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        <PriorityIndicator priority={c.priority} />
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs">
                        <p className="font-medium text-slate-900">{c.departmentName}</p>
                        <p className="text-slate-500">
                          {c.departmentApproved ? 'Officer Approved' : 'AI Suggested'} ·{' '}
                          {formatSlaRemaining(c.slaDueAt, c.status)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <StatusIndicator status={c.status} />
                        {latestEvent ? (
                          <p className="mt-1 max-w-xs text-xs text-slate-500">
                            {latestEvent.action} ·{' '}
                            <span className="font-mono tabular-nums">
                              {new Date(latestEvent.timestampIso).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {c.status === 'Submitted' &&
                          !c.departmentApproved &&
                          onRetryAiProcessing ? (
                            <button
                              type="button"
                              disabled={retryingId === c.id}
                              onClick={() => handleRetryRow(c)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                            >
                              {retryingId === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5" />
                              )}
                              <span>{retryingId === c.id ? 'Retrying...' : 'Retry AI'}</span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onInspect(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-navy-900 hover:bg-slate-100"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Timeline &amp; Dossier</span>
                          </button>
                          {c.status === 'Resolved' && !c.feedbackSubmitted ? (
                            <button
                              type="button"
                              onClick={() => onGiveFeedback(c)}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                            >
                              <MessageSquarePlus className="h-3.5 w-3.5" />
                              <span>Feedback</span>
                            </button>
                          ) : null}
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
    </div>
  );
}
