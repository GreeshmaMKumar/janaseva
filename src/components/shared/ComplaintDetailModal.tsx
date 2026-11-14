import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { STATUS_PROGRESS_STEPS } from '../../constants/civicData';
import type { AgentLogRecord, Complaint, UserProfile } from '../../types/domain';
import {
  citizenReplyToInfoRequest,
  withdrawCitizenComplaint,
} from '../../services/firestoreService';
import {
  formatSlaRemaining,
  PriorityIndicator,
  StatusIndicator,
} from './StatusIndicator';

export function ComplaintDetailModal({
  complaint,
  agentLogs,
  currentUser,
  onClose,
  onOpenFeedback,
  onRetryAiProcessing,
}: {
  complaint: Complaint;
  agentLogs: AgentLogRecord[];
  currentUser: UserProfile;
  onClose: () => void;
  onOpenFeedback?: (c: Complaint) => void;
  onRetryAiProcessing?: (c: Complaint) => Promise<void>;
}) {
  const [clarification, setClarification] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [retryingAi, setRetryingAi] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const canWithdraw =
    complaint.citizenUid === currentUser.uid &&
    !complaint.departmentApproved &&
    (complaint.status === 'Submitted' || complaint.status === 'Under Review');

  const canRetryAi =
    Boolean(onRetryAiProcessing) &&
    complaint.citizenUid === currentUser.uid &&
    complaint.status === 'Submitted' &&
    !complaint.departmentApproved;

  const handleRetryAi = async () => {
    if (!onRetryAiProcessing) return;
    setRetryingAi(true);
    setReplyError(null);
    try {
      await onRetryAiProcessing(complaint);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'AI processing retry failed.');
    } finally {
      setRetryingAi(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    setReplyError(null);
    try {
      await withdrawCitizenComplaint({ complaint, citizen: currentUser });
      onClose();
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to withdraw complaint.');
    } finally {
      setWithdrawing(false);
    }
  };

  const complaintLogs = agentLogs.filter((l) => l.complaintId === complaint.id);
  const rawStepIdx = STATUS_PROGRESS_STEPS.indexOf(complaint.status);
  const currentStepIdx =
    rawStepIdx >= 0
      ? rawStepIdx
      : complaint.status === 'Info Requested' || complaint.status === 'Escalated'
        ? STATUS_PROGRESS_STEPS.indexOf('Assigned')
        : 0;

  const handleSendClarification = async () => {
    if (clarification.trim().length < 5) {
      setReplyError('Please enter at least 5 characters of clarification.');
      return;
    }
    setSubmittingReply(true);
    setReplyError(null);
    try {
      await citizenReplyToInfoRequest({
        complaint,
        citizen: currentUser,
        clarification,
      });
      setClarification('');
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to send clarification.');
    } finally {
      setSubmittingReply(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complaint-dossier-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-navy-900 px-6 py-4 text-white">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-teal-300">
              <span className="font-mono font-semibold tabular-nums">{complaint.complaintCode}</span>
              <span aria-hidden="true">·</span>
              <span>{complaint.ward}</span>
              <span aria-hidden="true">·</span>
              <span>{complaint.category}</span>
            </div>
            <h2 id="complaint-dossier-title" className="mt-1 text-lg font-bold text-white">
              {complaint.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close complaint dossier"
            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Status & Metadata Strip */}
          <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-5 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Current Status</p>
              <div className="mt-1">
                <StatusIndicator status={complaint.status} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">Priority Level</p>
              <div className="mt-1">
                <PriorityIndicator priority={complaint.priority} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">Department Routing</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{complaint.departmentName}</p>
              <p className="text-xs text-slate-500">
                {complaint.departmentApproved ? 'Officer Approved' : 'Pending Officer Approval'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">SLA Target</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900 tabular-nums">
                <Clock className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                <span>{formatSlaRemaining(complaint.slaDueAt, complaint.status)}</span>
              </p>
            </div>
          </div>

          {canRetryAi ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  6-Agent AI Triage Pending
                </p>
                <p className="text-xs text-amber-800">
                  This grievance is saved in Firestore under {complaint.complaintCode}, but backend
                  AI triage has not completed yet.
                </p>
              </div>
              <button
                type="button"
                disabled={retryingAi}
                onClick={handleRetryAi}
                className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
              >
                {retryingAi ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                <span>{retryingAi ? 'Running 6 AI Agents...' : 'Retry AI Processing'}</span>
              </button>
            </div>
          ) : null}

          {replyError && complaint.status !== 'Info Requested' ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {replyError}
            </div>
          ) : null}

          {/* Progress Stepper */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Resolution Progress
              </h3>
              {complaint.status === 'Escalated' || complaint.status === 'Info Requested' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Active Exception: {complaint.status}</span>
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STATUS_PROGRESS_STEPS.map((step, idx) => {
                const isDone = currentStepIdx >= idx;
                const isCurrent = complaint.status === step;
                return (
                  <div
                    key={step}
                    className={`rounded-lg border px-2.5 py-2 text-center transition-colors ${
                      isCurrent
                        ? 'border-teal-600 bg-teal-50 text-teal-900'
                        : isDone
                          ? 'border-slate-200 bg-slate-50 text-slate-800'
                          : 'border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 text-xs font-semibold">
                      {isDone ? <Check className="h-3.5 w-3.5 text-teal-700" /> : null}
                      <span>{step}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Citizen Action Banners */}
          {complaint.status === 'Info Requested' &&
          complaint.citizenUid === currentUser.uid ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                Additional Information Requested by Officer
              </p>
              <p className="mt-1 text-sm text-amber-800">
                {complaint.infoRequestMessage || 'Please provide additional details to proceed.'}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={clarification}
                  onChange={(e) => setClarification(e.target.value)}
                  placeholder="Enter landmark, house number, or clarifying detail..."
                  className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={submittingReply}
                  onClick={handleSendClarification}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60 whitespace-nowrap"
                >
                  {submittingReply ? 'Sending...' : 'Submit Clarification'}
                </button>
              </div>
              {replyError ? <p className="mt-2 text-xs text-red-700">{replyError}</p> : null}
            </div>
          ) : null}

          {complaint.status === 'Resolved' &&
          !complaint.feedbackSubmitted &&
          complaint.citizenUid === currentUser.uid &&
          onOpenFeedback ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-teal-300 bg-teal-50 p-4">
              <div>
                <p className="text-sm font-semibold text-teal-950">
                  Your grievance has been marked Resolved
                </p>
                <p className="text-xs text-teal-800">
                  Verify the field resolution evidence and submit your satisfaction rating.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenFeedback(complaint)}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
              >
                Submit Feedback
              </button>
            </div>
          ) : null}

          {/* Description & Location + Photos */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Citizen Grievance Description
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-800">
                  {complaint.description}
                </p>
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                <span>
                  {complaint.locationText} · {complaint.ward}
                </span>
              </div>
              {complaint.citizenClarification ? (
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold text-slate-500">Citizen Clarification</p>
                  <p className="mt-1 text-sm text-slate-800">{complaint.citizenClarification}</p>
                </div>
              ) : null}
              {complaint.escalationReason ? (
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold text-red-700">Escalation Note</p>
                  <p className="mt-1 text-sm text-slate-800">{complaint.escalationReason}</p>
                </div>
              ) : null}
              {complaint.resolutionNotes ? (
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold text-emerald-700">Officer Resolution Notes</p>
                  <p className="mt-1 text-sm text-slate-800">{complaint.resolutionNotes}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              {complaint.evidenceUrl || complaint.photoDataUrl ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Submitted Citizen Evidence
                  </p>
                  <img
                    src={complaint.evidenceUrl || complaint.photoDataUrl}
                    alt={`Citizen evidence for ${complaint.complaintCode}`}
                    referrerPolicy="no-referrer"
                    className="mt-2 h-48 w-full rounded-lg border border-slate-200 object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
                  No citizen photograph uploaded
                </div>
              )}

              {complaint.resolutionEvidenceUrl || complaint.resolutionPhotoDataUrl ? (
                <div>
                  <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                    Verified Resolution Evidence
                  </p>
                  <img
                    src={complaint.resolutionEvidenceUrl || complaint.resolutionPhotoDataUrl}
                    alt={`Resolution evidence for ${complaint.complaintCode}`}
                    referrerPolicy="no-referrer"
                    className="mt-2 h-48 w-full rounded-lg border border-emerald-200 object-cover"
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* 6-Agent AI Analysis Breakdown */}
          <div className="border-t border-slate-200 pt-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <h3 className="text-sm font-bold text-navy-900">
                Multi-Agent AI Orchestration Analysis
              </h3>
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">Intake &amp; Visual Summary</p>
                <p className="mt-1 text-sm text-slate-800">
                  {complaint.aiSummary || 'Pending intake summary'}
                </p>
                <p className="mt-3 text-xs font-semibold text-slate-500">Priority Assessment Rationale</p>
                <p className="mt-1 text-sm text-slate-800">
                  {complaint.aiPriorityReason || 'Standard assessment'}
                </p>
                <p className="mt-3 text-xs font-semibold text-slate-500">Department Routing Rationale</p>
                <p className="mt-1 text-sm text-slate-800">
                  {complaint.aiRoutingReason || 'Matched by municipal category'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500">
                    Recommended Field Resolution SOP
                  </p>
                  {complaint.aiEstimatedHours ? (
                    <span className="font-mono text-xs text-teal-800 tabular-nums">
                      Est. {complaint.aiEstimatedHours}h
                    </span>
                  ) : null}
                </div>
                <ol className="mt-2 space-y-1.5 text-sm text-slate-800">
                  {(complaint.aiResolutionSteps || []).map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums">
                        0{i + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          {/* Agent Execution Logs & Audit Trail */}
          <div className="grid gap-6 border-t border-slate-200 pt-5 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Agent Execution Traces ({complaintLogs.length})
              </h3>
              <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
                {complaintLogs.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">No agent traces found for this record.</p>
                ) : (
                  complaintLogs.map((log) => (
                    <div key={log.id} className="p-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-navy-900">{log.agentName}</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {log.latencyMs}ms · {log.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{log.summary}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Complaint Status Timeline ({(complaint.auditTrail || []).length})
              </h3>
              <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
                {(complaint.auditTrail || []).length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">No timeline entries recorded yet.</p>
                ) : (
                  (complaint.auditTrail || []).map((entry, idx) => (
                    <div key={idx} className="p-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-900">{entry.action}</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {new Date(entry.timestampIso).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {entry.actorName} ({entry.actorRole}) — {entry.note}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {canWithdraw ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-xs text-slate-500">
                Unapproved complaints in Submitted / Under Review state can be withdrawn by the reporter.
              </p>
              <button
                type="button"
                disabled={withdrawing}
                onClick={handleWithdraw}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{withdrawing ? 'Withdrawing...' : 'Withdraw Grievance'}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
