import { useEffect, useState, type ChangeEvent } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  HelpCircle,
  ImagePlus,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { COMPLAINT_STATUSES } from '../../constants/civicData';
import { officerUpdateComplaint } from '../../services/firestoreService';
import type {
  AgentLogRecord,
  AgentName,
  Complaint,
  ComplaintPriority,
  ComplaintStatus,
  Department,
  UserProfile,
} from '../../types/domain';
import { compressImageToDataUrl } from '../../utils/imageCompression';
import { PriorityIndicator, StatusIndicator } from '../shared/StatusIndicator';

const AGENT_DISPLAY_ORDER: AgentName[] = [
  'Central Orchestrator',
  'Complaint Intake Agent',
  'Complaint Classification Agent',
  'Priority Assessment Agent',
  'Department Routing Agent',
  'Resolution Recommendation Agent',
  'Monitoring and Escalation Agent',
];

export function OfficerReviewDrawer({
  complaint,
  departments,
  agentLogs = [],
  officer,
  onClose,
}: {
  complaint: Complaint;
  departments: Department[];
  agentLogs?: AgentLogRecord[];
  officer: UserProfile;
  onClose: () => void;
}) {
  const [selectedDeptId, setSelectedDeptId] = useState(complaint.departmentId);
  const [selectedPriority, setSelectedPriority] = useState<ComplaintPriority>(complaint.priority);
  const [selectedStatus, setSelectedStatus] = useState<ComplaintStatus>(complaint.status);
  const [resolutionNotes, setResolutionNotes] = useState(complaint.resolutionNotes || '');
  const [resolutionPhoto, setResolutionPhoto] = useState(
    complaint.resolutionEvidenceUrl || complaint.resolutionPhotoDataUrl || ''
  );
  const [infoMessage, setInfoMessage] = useState(complaint.infoRequestMessage || '');
  const [escalationReason, setEscalationReason] = useState(complaint.escalationReason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDeptId(complaint.departmentId);
    setSelectedPriority(complaint.priority);
    setSelectedStatus(complaint.status);
  }, [complaint.departmentId, complaint.priority, complaint.status]);

  const isClosed = complaint.status === 'Closed' && officer.role !== 'admin';

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressImageToDataUrl(file);
      setResolutionPhoto(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process resolution evidence.');
    }
  };

  const handleApproveRouting = async () => {
    const dept = departments.find((d) => d.id === selectedDeptId) || departments[0];
    if (!dept) return;
    setSaving(true);
    setError(null);
    try {
      const modified = dept.id !== complaint.departmentId;
      const nextStatus: ComplaintStatus =
        complaint.status === 'Submitted' || complaint.status === 'Under Review'
          ? 'Assigned'
          : complaint.status;
      await officerUpdateComplaint({
        complaint,
        officer,
        updates: {
          departmentId: dept.id,
          departmentName: dept.name,
          departmentHeadUid: dept.headOfficerUid || officer.uid,
          departmentApproved: true,
          assignedOfficerUid: officer.uid,
          assignedOfficerName: officer.fullName,
          priority: selectedPriority,
          status: nextStatus,
        },
        auditAction: modified
          ? 'Officer modified & approved department assignment'
          : 'Officer approved AI department routing',
        auditNote: `Assigned to ${dept.name} (Priority: ${selectedPriority}) by ${officer.fullName}.`,
      });
      setSelectedStatus(nextStatus);
      setFeedbackBanner(
        `Assignment approved for ${dept.name} (Status: ${nextStatus}). Firestore & citizen tracking updated.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve routing.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async () => {
    setSaving(true);
    setError(null);
    try {
      await officerUpdateComplaint({
        complaint,
        officer,
        updates: {
          status: selectedStatus,
          priority: selectedPriority,
          assignedOfficerUid: complaint.assignedOfficerUid || officer.uid,
          assignedOfficerName: complaint.assignedOfficerName || officer.fullName,
          resolutionNotes: resolutionNotes.trim(),
          resolutionPhotoDataUrl: resolutionPhoto,
        },
        auditAction: `Officer updated status to ${selectedStatus}`,
        auditNote: resolutionNotes.trim()
          ? `Status -> ${selectedStatus}. Notes: ${resolutionNotes.trim().slice(0, 200)}`
          : `Status updated from ${complaint.status} to ${selectedStatus}.`,
      });
      setFeedbackBanner(
        `Complaint status updated to ${selectedStatus}. Citizen tracking timeline synced in Firestore.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  const handleResolveWithEvidence = async () => {
    if (resolutionNotes.trim().length < 5) {
      setError('Please provide brief resolution notes before marking Resolved.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await officerUpdateComplaint({
        complaint,
        officer,
        updates: {
          departmentApproved: true,
          assignedOfficerUid: complaint.assignedOfficerUid || officer.uid,
          assignedOfficerName: complaint.assignedOfficerName || officer.fullName,
          status: 'Resolved',
          resolutionNotes: resolutionNotes.trim(),
          resolutionPhotoDataUrl: resolutionPhoto,
        },
        auditAction: 'Officer resolved complaint with evidence',
        auditNote: `${resolutionNotes.trim().slice(0, 240)}${resolutionPhoto ? ' (Resolution photograph attached)' : ''}`,
      });
      setSelectedStatus('Resolved');
      setFeedbackBanner('Complaint marked Resolved with field evidence.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve complaint.');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestInfo = async () => {
    if (infoMessage.trim().length < 5) {
      setError('Enter a clear question or missing detail request for the citizen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await officerUpdateComplaint({
        complaint,
        officer,
        updates: {
          status: 'Info Requested',
          infoRequestMessage: infoMessage.trim(),
        },
        auditAction: 'Officer requested additional information',
        auditNote: infoMessage.trim().slice(0, 240),
      });
      setSelectedStatus('Info Requested');
      setFeedbackBanner('Information request dispatched to citizen.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request information.');
    } finally {
      setSaving(false);
    }
  };

  const handleEscalate = async () => {
    if (escalationReason.trim().length < 5) {
      setError('Please state a specific reason for escalating this complaint.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await officerUpdateComplaint({
        complaint,
        officer,
        updates: {
          status: 'Escalated',
          priority: 'Critical',
          escalationReason: escalationReason.trim(),
        },
        auditAction: 'Officer escalated unresolved complaint',
        auditNote: escalationReason.trim().slice(0, 240),
      });
      setSelectedStatus('Escalated');
      setSelectedPriority('Critical');
      setFeedbackBanner('Complaint escalated to senior municipal supervision.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to escalate complaint.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-navy-950/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="officer-drawer-title"
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-navy-900 px-6 py-4 text-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-teal-300">
              <span className="font-mono font-semibold tabular-nums">
                {complaint.complaintCode}
              </span>
              <span aria-hidden="true">·</span>
              <span>{complaint.ward}</span>
            </div>
            <h2 id="officer-drawer-title" className="mt-1 truncate text-lg font-bold">
              {complaint.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close officer action drawer"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </div>
          ) : null}
          {feedbackBanner ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-900">
              {feedbackBanner}
            </div>
          ) : null}

          {isClosed ? (
            <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 text-xs text-slate-700">
              This grievance is Closed after citizen verification. Only Administrators may reopen closed tickets.
            </div>
          ) : null}

          {/* Citizen Evidence & AI Summary */}
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <StatusIndicator status={complaint.status} />
                <PriorityIndicator priority={complaint.priority} />
              </div>
              <p className="text-xs font-semibold text-slate-500">Description &amp; Location</p>
              <p className="text-sm text-slate-800">{complaint.description}</p>
              <p className="text-xs text-slate-600">
                Location: {complaint.locationText} · Reporter: {complaint.citizenName}
              </p>
              {complaint.citizenClarification ? (
                <p className="text-xs text-teal-800">
                  Citizen Clarification: {complaint.citizenClarification}
                </p>
              ) : null}
            </div>
            <div>
              {complaint.evidenceUrl || complaint.photoDataUrl ? (
                <img
                  src={complaint.evidenceUrl || complaint.photoDataUrl}
                  alt="Citizen complaint photo"
                  referrerPolicy="no-referrer"
                  className="h-44 w-full rounded-lg border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-xs text-slate-500">
                  No citizen photo submitted
                </div>
              )}
            </div>
          </div>

          {/* AI Analysis Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-xs font-bold tracking-wide text-navy-900 uppercase">
              AI Classification &amp; Routing Recommendation
            </h3>
            <p className="mt-2 text-sm text-slate-800">
              <span className="font-semibold">AI Category:</span> {complaint.aiCategory} ·{' '}
              <span className="font-semibold">Priority Rationale:</span>{' '}
              {complaint.aiPriorityReason}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Routing Rationale: {complaint.aiRoutingReason}
            </p>
            {(complaint.aiResolutionSteps || []).length > 0 ? (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-xs font-semibold text-slate-500">AI Field SOP Steps</p>
                <ol className="mt-1 space-y-1 text-xs text-slate-700">
                  {(complaint.aiResolutionSteps || []).map((s, idx) => (
                    <li key={idx}>
                      {idx + 1}. {s}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {complaint.aiReminderSchedule ? (
              <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Monitoring Schedule:</span>{' '}
                {complaint.aiReminderSchedule} (Auto-close disabled)
              </p>
            ) : null}
          </div>

          {/* 6-Agent Pipeline Execution Status Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold tracking-wide text-navy-900 uppercase">
                6-Agent Pipeline Execution Status
              </h3>
              <span className="text-xs font-medium text-slate-600">
                {complaint.aiExecutionSummary || `${agentLogs.length} execution traces recorded`}
              </span>
            </div>
            {agentLogs.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                No detailed agent logs available for this record yet.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
                {[...agentLogs]
                  .sort(
                    (a, b) =>
                      AGENT_DISPLAY_ORDER.indexOf(a.agentName) -
                      AGENT_DISPLAY_ORDER.indexOf(b.agentName)
                  )
                  .map((log) => (
                    <div key={log.id} className="p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-navy-900">{log.agentName}</span>
                        <span
                          className={`font-mono font-semibold tabular-nums ${
                            log.status === 'Failed' || log.status === 'Escalated'
                              ? 'text-red-700'
                              : log.status === 'Warning'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {log.status} · {log.latencyMs}ms
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-600">{log.summary}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Action 1: Approve or Modify Department Assignment */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-navy-900">
                1. Approve or Modify Department Assignment
              </h3>
              <span className="text-xs font-semibold text-slate-600">
                {complaint.departmentApproved ? 'Approved' : 'Approval Required'}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600">
                  Assigned Department
                </label>
                <select
                  disabled={isClosed}
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">
                  Priority Override
                </label>
                <select
                  disabled={isClosed}
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value as ComplaintPriority)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  {(['Low', 'Medium', 'High', 'Critical'] as ComplaintPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              disabled={saving || isClosed}
              onClick={handleApproveRouting}
              className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" />
              <span>Approve Assignment &amp; Claim Case</span>
            </button>
          </div>

          {/* Action 2: Update Status & Upload Resolution Evidence */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-bold text-navy-900">
              2. Field Progress &amp; Resolution Evidence
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600">Status</label>
                <select
                  disabled={isClosed}
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as ComplaintStatus)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                >
                  {COMPLAINT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Field Work / Resolution Notes
              </label>
              <textarea
                rows={3}
                disabled={isClosed}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Document crew dispatched, repairs completed, or work order details..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600">
                Resolution Evidence Photograph
              </label>
              {resolutionPhoto ? (
                <div className="mt-1.5 rounded-lg border border-slate-200 p-2">
                  <div className="flex justify-end pb-1">
                    <button
                      type="button"
                      disabled={isClosed}
                      onClick={() => setResolutionPhoto('')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                  <img
                    src={resolutionPhoto}
                    alt="Resolution evidence"
                    className="h-36 w-full rounded object-cover"
                  />
                </div>
              ) : (
                <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-700 hover:border-teal-600">
                  <ImagePlus className="h-4 w-4 text-teal-700" />
                  <span>Upload Post-Repair Photograph</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isClosed}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={saving || isClosed}
                onClick={handleUpdateStatus}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Save Status Update
              </button>
              <button
                type="button"
                disabled={saving || isClosed}
                onClick={handleResolveWithEvidence}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Mark Resolved with Evidence</span>
              </button>
            </div>
          </div>

          {/* Action 3: Request Info & Escalate */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase">
                <HelpCircle className="h-4 w-4" />
                <span>Request Additional Info</span>
              </h3>
              <textarea
                rows={2}
                disabled={isClosed}
                value={infoMessage}
                onChange={(e) => setInfoMessage(e.target.value)}
                placeholder="Ask citizen for landmark, pole number, or timing..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              />
              <button
                type="button"
                disabled={saving || isClosed}
                onClick={handleRequestInfo}
                className="w-full rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
              >
                Send Info Request
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-red-800 uppercase">
                <AlertOctagon className="h-4 w-4" />
                <span>Escalate Unresolved Case</span>
              </h3>
              <textarea
                rows={2}
                disabled={isClosed}
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder="Reason for senior escalation or SLA breach..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
              />
              <button
                type="button"
                disabled={saving || isClosed}
                onClick={handleEscalate}
                className="w-full rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                Escalate Complaint
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
