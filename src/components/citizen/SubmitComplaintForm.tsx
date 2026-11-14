import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  COMPLAINT_CATEGORIES,
  MUNICIPAL_WARDS,
  STATUS_PROGRESS_STEPS,
} from '../../constants/civicData';
import {
  invokeProcessComplaintEndpoint,
  type AgentProgressEvent,
} from '../../services/agentApiService';
import {
  applyOrchestrationResultToComplaint,
  createInitialComplaintInFirestore,
  type InitialComplaintRecord,
} from '../../services/firestoreService';
import type {
  AgentName,
  Complaint,
  ComplaintCategory,
  Department,
  OrchestratedPlanResponse,
  UserProfile,
} from '../../types/domain';
import { compressImageToDataUrl } from '../../utils/imageCompression';
import { PriorityIndicator, StatusIndicator } from '../shared/StatusIndicator';

type AgentStepState = 'pending' | 'running' | 'Completed' | 'Warning' | 'Escalated' | 'Failed';

interface AgentStepProgress {
  stepNumber: number;
  agentName: AgentName;
  label: string;
  state: AgentStepState;
  latencyMs?: number;
  summary?: string;
}

const INITIAL_AGENT_STEPS: AgentStepProgress[] = [
  {
    stepNumber: 1,
    agentName: 'Complaint Intake Agent',
    label: 'Extract issue, location, duration, affected people & photo evidence',
    state: 'pending',
  },
  {
    stepNumber: 2,
    agentName: 'Complaint Classification Agent',
    label: 'Classify civic category, sub-issue & detect duplicates',
    state: 'pending',
  },
  {
    stepNumber: 3,
    agentName: 'Priority Assessment Agent',
    label: 'Evaluate severity, public safety, affected population & duration',
    state: 'pending',
  },
  {
    stepNumber: 4,
    agentName: 'Department Routing Agent',
    label: 'Recommend responsible department from directory & jurisdiction',
    state: 'pending',
  },
  {
    stepNumber: 5,
    agentName: 'Resolution Recommendation Agent',
    label: 'Draft practical field SOP steps from department knowledge base',
    state: 'pending',
  },
  {
    stepNumber: 6,
    agentName: 'Monitoring and Escalation Agent',
    label: 'Audit SLA deadline, reminder cadence & escalation watch',
    state: 'pending',
  },
];

export function SubmitComplaintForm({
  citizen,
  departments,
  recentComplaints,
  onSubmitted,
}: {
  citizen: UserProfile;
  departments: Department[];
  recentComplaints?: Complaint[];
  onSubmitted: (complaintCode: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ComplaintCategory>('Road maintenance');
  const [ward, setWard] = useState(citizen.ward || MUNICIPAL_WARDS[0]);
  const [locationText, setLocationText] = useState('');
  const [description, setDescription] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [photoFileName, setPhotoFileName] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [activeStage, setActiveStage] = useState<string>('');
  const [agentSteps, setAgentSteps] = useState<AgentStepProgress[]>(INITIAL_AGENT_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Preserved if Firestore save succeeds but /api/process-complaint fails, so Retry never duplicates records
  const [pendingComplaint, setPendingComplaint] = useState<InitialComplaintRecord | null>(null);

  const [receipt, setReceipt] = useState<{
    complaintId: string;
    complaintCode: string;
    plan: OrchestratedPlanResponse;
    submittedAtIso: string;
  } | null>(null);

  const liveReceiptComplaint = useMemo(
    () =>
      receipt
        ? (recentComplaints || []).find((c) => c.id === receipt.complaintId) || null
        : null,
    [recentComplaints, receipt]
  );

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoDataUrl(compressed);
      setPhotoFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process photograph.');
    }
  };

  const applyProgressEvent = (evt: AgentProgressEvent) => {
    setAgentSteps((prev) =>
      prev.map((step) => {
        if (step.stepNumber !== evt.stepNumber && step.agentName !== evt.agentName) {
          return step;
        }
        if (evt.type === 'agent_started') {
          setActiveStage(`Running Agent ${evt.stepNumber}/6: ${evt.agentName}...`);
          return { ...step, state: 'running', summary: evt.action };
        }
        return {
          ...step,
          state: evt.status || 'Completed',
          latencyMs: evt.latencyMs,
          summary: evt.summary,
        };
      })
    );
  };

  const runBackendProcessing = async (savedRecord: InitialComplaintRecord) => {
    setSubmitting(true);
    setError(null);
    setSuccessBanner(null);
    setAgentSteps(INITIAL_AGENT_STEPS);
    setActiveStage(
      `Complaint ${savedRecord.complaintCode} saved. Calling /api/process-complaint...`
    );

    try {
      const response = await invokeProcessComplaintEndpoint({
        complaintId: savedRecord.complaintId,
        complaint: savedRecord.complaintPayload,
        departments,
        recentComplaints,
        onProgress: applyProgressEvent,
      });

      const aiPlan = response.result;

      // Sync final trace statuses in case stream finished in single JSON response
      setAgentSteps((prev) =>
        prev.map((step) => {
          const trace = aiPlan.traces.find((t) => t.agentName === step.agentName);
          if (!trace) return step;
          return {
            ...step,
            state: trace.status,
            latencyMs: trace.latencyMs,
            summary: trace.summary,
          };
        })
      );

      if (!response.persistedByServer) {
        setActiveStage(
          `Persisting AI triage results & 7 agent logs for ${savedRecord.complaintCode} to Firestore...`
        );
        await applyOrchestrationResultToComplaint({
          complaintId: savedRecord.complaintId,
          complaintCode: savedRecord.complaintCode,
          citizen,
          title: savedRecord.complaintPayload.title,
          ward: savedRecord.complaintPayload.ward,
          userSelectedCategory: savedRecord.complaintPayload.category,
          departments,
          aiPlan,
          existingAuditTrail: savedRecord.auditTrail,
        });
      }

      setPendingComplaint(null);
      setReceipt({
        complaintId: savedRecord.complaintId,
        complaintCode: savedRecord.complaintCode,
        plan: aiPlan,
        submittedAtIso: new Date().toISOString(),
      });
      setSuccessBanner(
        `Complaint ${savedRecord.complaintCode} registered in Firestore and triaged by all 6 JANASEVA AI agents.`
      );
      setTitle('');
      setLocationText('');
      setDescription('');
      setPhotoDataUrl('');
      setPhotoFileName('');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Backend AI processing failed unexpectedly.';
      setError(msg);
      setAgentSteps((prev) =>
        prev.map((s) => (s.state === 'running' ? { ...s, state: 'Failed' } : s))
      );
    } finally {
      setSubmitting(false);
      setActiveStage('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (departments.length === 0) {
      setError(
        'Municipal department directory is not initialized yet. An administrator must sign in once to seed departments.'
      );
      return;
    }
    if (title.trim().length < 5) {
      setError('Please enter a concise complaint title (at least 5 characters).');
      return;
    }
    if (locationText.trim().length < 3) {
      setError('Please provide an exact street address or landmark (at least 3 characters).');
      return;
    }
    if (description.trim().length < 15) {
      setError('Please describe the civic issue in detail (at least 15 characters).');
      return;
    }

    // If the complaint was already saved to Firestore on an earlier failed attempt, retry processing it
    if (pendingComplaint) {
      await runBackendProcessing(pendingComplaint);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessBanner(null);
    setAgentSteps(INITIAL_AGENT_STEPS);
    setActiveStage('Step 1: Saving grievance record in Firestore & generating unique ID...');

    try {
      const saved = await createInitialComplaintInFirestore({
        citizen,
        title: title.trim(),
        description: description.trim(),
        locationText: locationText.trim(),
        ward,
        userSelectedCategory: category,
        photoDataUrl: photoDataUrl || undefined,
        departments,
      });

      setPendingComplaint(saved);
      await runBackendProcessing(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save complaint to Firestore.');
      setSubmitting(false);
      setActiveStage('');
    }
  };

  const handleRetryAiProcessing = async () => {
    if (!pendingComplaint || submitting) return;
    await runBackendProcessing(pendingComplaint);
  };

  if (receipt) {
    const liveStatus = liveReceiptComplaint?.status || 'Under Review';
    const liveDeptApproved = liveReceiptComplaint?.departmentApproved || false;
    const liveDeptName = liveReceiptComplaint?.departmentName || receipt.plan.departmentName;
    const liveTimeline =
      liveReceiptComplaint?.auditTrail && liveReceiptComplaint.auditTrail.length > 0
        ? liveReceiptComplaint.auditTrail
        : [
            {
              timestampIso: receipt.submittedAtIso,
              actorUid: citizen.uid,
              actorName: citizen.fullName,
              actorRole: citizen.role,
              action: 'Complaint submitted by citizen',
              note: `Registered ${receipt.complaintCode} in Firestore.`,
            },
            {
              timestampIso: new Date().toISOString(),
              actorUid: citizen.uid,
              actorName: citizen.fullName,
              actorRole: citizen.role,
              action: 'AI 6-agent triage completed (awaiting officer approval)',
              note: `Classified as ${receipt.plan.aiCategory} (${receipt.plan.priority}); recommended ${receipt.plan.departmentName}.`,
            },
          ];
    const currentStepIdx = STATUS_PROGRESS_STEPS.indexOf(liveStatus);

    return (
      <div className="space-y-6">
        {successBanner ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
            <div>
              <p className="font-semibold">Submission &amp; AI Triage Complete</p>
              <p className="mt-0.5 text-xs text-teal-800">{successBanner}</p>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-wide text-teal-700 uppercase">
                  Grievance Registered &amp; AI Triaged
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold text-navy-900">
                  Complaint ID:{' '}
                  <span className="font-mono text-teal-700 tabular-nums">
                    {receipt.complaintCode}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Firestore Document ID:{' '}
                  <span className="font-mono tabular-nums">{receipt.complaintId}</span> · Processed
                  by 6 Gemini AI agents in{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {receipt.plan.totalLatencyMs}ms
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
              <p className="text-xs font-semibold text-slate-500">Live Tracking Status</p>
              <div className="mt-1 flex items-center gap-3">
                <StatusIndicator status={liveStatus} />
                <span className="text-xs text-slate-500">·</span>
                <PriorityIndicator priority={liveReceiptComplaint?.priority || receipt.plan.priority} />
              </div>
            </div>
          </div>

          {/* Real-time Status Stepper */}
          <div className="mt-6">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Tracking Progress
            </h3>
            <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STATUS_PROGRESS_STEPS.map((step, idx) => {
                const isDone = currentStepIdx >= idx;
                const isCurrent = liveStatus === step;
                return (
                  <div
                    key={step}
                    className={`rounded-lg border px-2.5 py-2 text-center ${
                      isCurrent
                        ? 'border-teal-600 bg-teal-50 text-teal-950 font-semibold'
                        : isDone
                          ? 'border-slate-200 bg-slate-50 text-slate-800'
                          : 'border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    <span className="text-xs">{step}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">AI Classification</p>
                <p className="mt-0.5 text-sm font-semibold text-navy-900">
                  {receipt.plan.aiCategory} · {receipt.plan.subIssueType}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Priority Assessment</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {receipt.plan.priority} — {receipt.plan.aiPriorityReason}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  Recommended Department ({liveDeptApproved ? 'Officer Approved' : 'Awaiting Officer Approval'})
                </p>
                <p className="mt-0.5 text-sm font-semibold text-teal-800">{liveDeptName}</p>
                <p className="mt-0.5 text-xs text-slate-600">{receipt.plan.aiRoutingReason}</p>
              </div>
              {receipt.plan.intakeDetails ? (
                <div className="border-t border-slate-200 pt-2.5 text-xs text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-700">Duration:</span>{' '}
                    {receipt.plan.intakeDetails.duration} ·{' '}
                    <span className="font-semibold text-slate-700">Affected:</span>{' '}
                    {receipt.plan.intakeDetails.affectedPeople}
                  </p>
                </div>
              ) : null}
              {receipt.plan.isPotentialDuplicate &&
              (receipt.plan.potentialDuplicates || []).length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                  <span className="font-semibold">Potential Similar Complaints Flagged:</span>{' '}
                  {receipt.plan.potentialDuplicates?.join(', ')}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">
                Recommended Field Resolution Steps (Est. {receipt.plan.aiEstimatedHours}h)
              </p>
              <ol className="space-y-1.5 text-sm text-slate-800">
                {receipt.plan.aiResolutionSteps.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums">
                      0{i + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {receipt.plan.reminderSchedule ? (
                <div className="border-t border-slate-200 pt-2.5 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">SLA Monitoring Watch:</span>{' '}
                  {receipt.plan.reminderSchedule}
                </div>
              ) : null}
            </div>
          </div>

          {/* Complaint Status Timeline */}
          <div className="mt-6 border-t border-slate-200 pt-5">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Complaint Status Timeline
            </h3>
            <ol className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {liveTimeline.map((entry, idx) => (
                <li key={idx} className="flex flex-wrap items-start justify-between gap-2 p-3 text-xs">
                  <div>
                    <p className="font-semibold text-navy-900">{entry.action}</p>
                    <p className="mt-0.5 text-slate-600">
                      {entry.actorName} ({entry.actorRole}) — {entry.note}
                    </p>
                  </div>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {new Date(entry.timestampIso).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onSubmitted(receipt.complaintCode)}
              className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
            >
              Open Tracking &amp; Status Timeline
            </button>
            <button
              type="button"
              onClick={() => {
                setReceipt(null);
                setSuccessBanner(null);
                setAgentSteps(INITIAL_AGENT_STEPS);
              }}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Submit Another Grievance
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 sm:p-8 lg:col-span-7"
      >
        <div className="border-b border-slate-200 pb-4">
          <h2 className="font-display text-xl font-bold text-navy-900">
            Register New Civic Grievance
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Your complaint is saved to Firestore immediately with a unique tracking ID, then
            analyzed sequentially by all six JANASEVA AI agents via the backend pipeline.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">AI Backend Processing Error</p>
                <p className="mt-0.5 text-xs text-red-800">{error}</p>
                {pendingComplaint ? (
                  <p className="mt-1.5 font-mono text-xs font-semibold text-navy-900 tabular-nums">
                    Saved Complaint ID: {pendingComplaint.complaintCode} ({pendingComplaint.complaintId})
                  </p>
                ) : null}
              </div>
            </div>
            {pendingComplaint ? (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleRetryAiProcessing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Retry AI Processing</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSubmitted(pendingComplaint.complaintCode)}
                  className="rounded-lg border border-red-300 bg-white px-3.5 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
                >
                  View Saved Ticket in Tracker
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Complaint Subject / Title
          </label>
          <input
            type="text"
            required
            disabled={submitting || Boolean(pendingComplaint)}
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Collapsed manhole cover and waterlogging near KR Market Gate 2"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Primary Civic Category
            </label>
            <select
              disabled={submitting || Boolean(pendingComplaint)}
              value={category}
              onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
            >
              {COMPLAINT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Municipal Ward</label>
            <select
              disabled={submitting || Boolean(pendingComplaint)}
              value={ward}
              onChange={(e) => setWard(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
            >
              {MUNICIPAL_WARDS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Exact Street Address &amp; Landmark
          </label>
          <input
            type="text"
            required
            disabled={submitting || Boolean(pendingComplaint)}
            maxLength={280}
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="e.g., 14th Cross Road, opposite Government Primary School, Indiranagar"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Detailed Grievance Description
          </label>
          <textarea
            rows={4}
            required
            disabled={submitting || Boolean(pendingComplaint)}
            maxLength={3800}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe severity, duration of issue, traffic or safety impact, and nearby vulnerable sites..."
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700">
            Site Photograph Evidence (Recommended for Multimodal AI Inspection)
          </label>
          {photoDataUrl ? (
            <div className="mt-2 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2 pb-2">
                <span className="truncate text-xs font-medium text-slate-700">
                  {photoFileName || 'Compressed photo attached'}
                </span>
                <button
                  type="button"
                  disabled={submitting || Boolean(pendingComplaint)}
                  onClick={() => {
                    setPhotoDataUrl('');
                    setPhotoFileName('');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              </div>
              <img
                src={photoDataUrl}
                alt="Complaint evidence preview"
                className="h-44 w-full rounded-md object-cover"
              />
            </div>
          ) : (
            <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-6 text-center transition-colors hover:border-teal-600 hover:bg-teal-50/40">
              <ImagePlus className="h-6 w-6 text-teal-700" aria-hidden="true" />
              <span className="mt-2 text-sm font-semibold text-slate-800">
                Upload Site Photograph
              </span>
              <span className="mt-0.5 text-xs text-slate-500">
                JPEG, PNG, or WebP · Automatically compressed for secure storage
              </span>
              <input
                type="file"
                accept="image/*"
                disabled={submitting || Boolean(pendingComplaint)}
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </label>
          )}
        </div>

        {submitting ? (
          <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-teal-700" />
            <div>
              <p className="font-semibold">AI Multi-Agent Orchestration Active</p>
              <p className="text-xs text-teal-800">{activeStage}</p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          {pendingComplaint ? (
            <span className="font-mono text-xs text-slate-600 tabular-nums">
              Ticket {pendingComplaint.complaintCode} saved in Firestore
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              6-agent sequential Gemini pipeline
            </span>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-navy-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
          >
            {submitting
              ? 'Processing with AI Agents...'
              : pendingComplaint
                ? 'Retry AI Processing'
                : 'Submit Complaint'}
          </button>
        </div>
      </form>

      {/* Right Rail: Live 6-Agent Execution Progress */}
      <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-navy-900">
              6-Agent Execution Progress
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Live status streamed from <span className="font-mono">/api/process-complaint</span>
            </p>
          </div>
          {pendingComplaint ? (
            <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums">
              {pendingComplaint.complaintCode}
            </span>
          ) : null}
        </div>

        <ol className="divide-y divide-slate-200">
          {agentSteps.map((step) => {
            const isRunning = step.state === 'running';
            const isFailed = step.state === 'Failed';
            const isDone =
              step.state === 'Completed' ||
              step.state === 'Warning' ||
              step.state === 'Escalated';

            return (
              <li key={step.stepNumber} className="py-3 first:pt-1 last:pb-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">
                      {isRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
                      ) : isFailed ? (
                        <AlertCircle className="h-4 w-4 text-red-700" />
                      ) : isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      ) : (
                        <Clock className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-navy-900">
                        <span className="font-mono text-teal-700 tabular-nums">
                          0{step.stepNumber}.
                        </span>{' '}
                        {step.agentName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{step.label}</p>
                      {step.summary ? (
                        <p className="mt-1 text-xs text-slate-700">{step.summary}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-xs tabular-nums">
                    <span
                      className={
                        isRunning
                          ? 'font-semibold text-teal-700'
                          : isFailed
                            ? 'font-semibold text-red-700'
                            : isDone
                              ? 'font-semibold text-emerald-700'
                              : 'text-slate-400'
                      }
                    >
                      {step.state === 'pending'
                        ? 'Queued'
                        : step.state === 'running'
                          ? 'Running'
                          : step.state}
                    </span>
                    {typeof step.latencyMs === 'number' ? (
                      <p className="text-slate-500">{step.latencyMs}ms</p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}
