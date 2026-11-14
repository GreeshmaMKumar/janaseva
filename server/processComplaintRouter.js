import express from 'express';
import fs from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { orchestrateComplaintPipeline } from './ai/orchestrator.ts';
import { processComplaint } from './orchestrator.js';

const firebaseConfig = JSON.parse(
  fs.readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8')
);

const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId: firebaseConfig.projectId,
    });

const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
const router = express.Router();

const RATE_WINDOW_MS = 60_000;
const MAX_PROCESS_PER_WINDOW = 20;
const processTimestamps = [];
const inFlightComplaintIds = new Set();

function checkRateLimit() {
  const now = Date.now();
  while (processTimestamps.length > 0 && now - processTimestamps[0] > RATE_WINDOW_MS) {
    processTimestamps.shift();
  }
  if (processTimestamps.length >= MAX_PROCESS_PER_WINDOW) {
    return false;
  }
  processTimestamps.push(now);
  return true;
}

function normalizeCategory(raw) {
  const value = String(raw || '').toLowerCase();
  if (value.includes('sanit') || value.includes('waste') || value.includes('garbage')) return 'Sanitation';
  if (value.includes('light') || value.includes('lamp') || value.includes('pole')) return 'Street lighting';
  if (value.includes('water') || value.includes('pipe') || value.includes('supply')) return 'Water supply';
  if (value.includes('drain') || value.includes('sewer') || value.includes('flood')) return 'Drainage';
  return 'Road maintenance';
}

function normalizePriority(raw) {
  const value = String(raw || '').toLowerCase();
  if (value === 'critical') return 'Critical';
  if (value === 'high') return 'High';
  if (value === 'low') return 'Low';
  return 'Medium';
}

function buildPlanFromLegacyOrchestrator(legacyResult, complaint, departments, startTime) {
  const matchedDept =
    departments.find((d) =>
      String(d.name || '')
        .toLowerCase()
        .includes(String(legacyResult?.routing?.department || '').toLowerCase().split(' ')[0])
    ) ||
    departments.find((d) => d.category === normalizeCategory(legacyResult?.classification?.category)) ||
    departments[0] || {
      id: complaint.departmentId || 'dept-roads',
      name: legacyResult?.routing?.department || complaint.departmentName || 'Directorate of Roads & Highways',
      slaHours: 48,
      headOfficerName: 'Municipal Duty Officer',
    };

  const priority = normalizePriority(
    legacyResult?.priority?.level || legacyResult?.priority?.priority || complaint.priority
  );
  const aiCategory = normalizeCategory(
    legacyResult?.classification?.category || complaint.category
  );
  const slaHours = Number(matchedDept.slaHours) || 48;
  const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();
  const totalLatencyMs = Date.now() - startTime;
  const steps = Array.isArray(legacyResult?.resolution?.steps)
    ? legacyResult.resolution.steps.map((s) => String(s).slice(0, 290)).slice(0, 10)
    : Array.isArray(legacyResult?.resolution?.nextSteps)
      ? legacyResult.resolution.nextSteps.map((s) => String(s).slice(0, 290)).slice(0, 10)
      : ['Dispatch field inspection team and document site conditions.'];

  const perStepMs = Math.round(totalLatencyMs / 6);
  const traces = [
    {
      agentName: 'Central Orchestrator',
      action: 'Sequential 6-agent pipeline orchestration',
      status: 'Completed',
      latencyMs: totalLatencyMs,
      inputSummary: `${complaint.title} | ${complaint.ward}`,
      summary: `Executed 6 agents sequentially in ${totalLatencyMs}ms. Routed to ${matchedDept.name}; awaiting officer approval.`,
      outputData: { aiCategory, priority, departmentId: matchedDept.id, requiresOfficerApproval: true },
    },
    {
      agentName: 'Complaint Intake Agent',
      action: 'Structured intake extraction',
      status: 'Completed',
      latencyMs: perStepMs,
      summary: String(legacyResult?.intake?.summary || legacyResult?.intake?.issue || complaint.description).slice(0, 900),
      outputData: legacyResult?.intake || {},
    },
    {
      agentName: 'Complaint Classification Agent',
      action: 'Category & duplicate classification',
      status: 'Completed',
      latencyMs: perStepMs,
      summary: `Classified as ${aiCategory}.`,
      outputData: legacyResult?.classification || {},
    },
    {
      agentName: 'Priority Assessment Agent',
      action: 'Severity & urgency assessment',
      status: priority === 'Critical' ? 'Escalated' : 'Completed',
      latencyMs: perStepMs,
      summary: String(legacyResult?.priority?.reasoning || `Assigned ${priority} priority.`).slice(0, 900),
      outputData: legacyResult?.priority || {},
    },
    {
      agentName: 'Department Routing Agent',
      action: 'Department jurisdiction routing',
      status: 'Completed',
      latencyMs: perStepMs,
      summary: String(legacyResult?.routing?.reasoning || `Recommended ${matchedDept.name}.`).slice(0, 900),
      outputData: legacyResult?.routing || {},
    },
    {
      agentName: 'Resolution Recommendation Agent',
      action: 'Field SOP resolution planning',
      status: 'Completed',
      latencyMs: perStepMs,
      summary: `Prepared ${steps.length} field SOP steps.`,
      outputData: legacyResult?.resolution || {},
    },
    {
      agentName: 'Monitoring and Escalation Agent',
      action: 'SLA & escalation watch',
      status: priority === 'Critical' ? 'Escalated' : 'Completed',
      latencyMs: perStepMs,
      summary: String(legacyResult?.monitoring?.recommendation || `Monitoring ${slaHours}h SLA.`).slice(0, 900),
      outputData: legacyResult?.monitoring || {},
    },
  ];

  return {
    intakeValid: true,
    intakeDetails: {
      issue: String(legacyResult?.intake?.issue || complaint.title || ''),
      location: String(legacyResult?.intake?.location || complaint.locationText || ''),
      duration: String(legacyResult?.intake?.duration || 'Not specified'),
      affectedPeople: String(legacyResult?.intake?.affectedPeople || 'Local residents'),
      evidence: String(legacyResult?.intake?.evidence || 'Citizen report'),
    },
    aiSummary: String(legacyResult?.intake?.summary || complaint.description || '').slice(0, 1900),
    visualObservation: complaint.photoDataUrl ? 'Site photograph attached' : 'No photographic evidence attached',
    aiCategory,
    subIssueType: String(legacyResult?.classification?.subcategory || 'Municipal grievance').slice(0, 120),
    recurringSignature: `${String(complaint.ward || 'ward').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${aiCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 120),
    isPotentialDuplicate: Boolean(legacyResult?.classification?.potentialDuplicate),
    potentialDuplicates: [],
    priority,
    aiPriorityReason: String(legacyResult?.priority?.reasoning || `Assessed as ${priority} severity.`).slice(0, 950),
    departmentId: matchedDept.id,
    departmentName: matchedDept.name,
    aiRoutingReason: String(legacyResult?.routing?.reasoning || `Routed to ${matchedDept.name}.`).slice(0, 950),
    aiResolutionSteps: steps,
    aiEstimatedHours: Math.max(1, Math.min(720, Math.round(Number(legacyResult?.resolution?.estimatedHours) || slaHours))),
    requiredResources: String(legacyResult?.resolution?.resources || 'Municipal field inspection crew'),
    slaDueAt,
    requiresImmediateEscalation: priority === 'Critical',
    escalationWatchNote: String(legacyResult?.monitoring?.escalationNote || `Awaiting officer approval; SLA ${slaHours}h.`).slice(0, 950),
    reminderSchedule: String(legacyResult?.monitoring?.reminder || `Remind assigned officer at 50% and 80% of ${slaHours}h SLA window.`).slice(0, 300),
    slaCheckStatus: priority === 'Critical' ? 'Immediate Escalation' : 'Watch',
    requiresOfficerApproval: true,
    autoCloseAllowed: false,
    executionSummary: {
      totalAgentsPlanned: 6,
      executedCount: 6,
      completedCount: priority === 'Critical' ? 4 : 6,
      warningCount: 0,
      escalatedCount: priority === 'Critical' ? 2 : 0,
      failedCount: 0,
      overallStatus: priority === 'Critical' ? 'Escalated' : 'Completed',
    },
    traces,
    totalLatencyMs,
  };
}

router.post('/process-complaint', async (req, res) => {
  const {
    complaintId,
    complaint: fallbackComplaint,
    departments: suppliedDepartments,
    recentComplaints: suppliedRecent,
    stream,
  } = req.body ?? {};

  if (!complaintId || typeof complaintId !== 'string' || !complaintId.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Complaint ID required',
    });
  }

  const cleanComplaintId = complaintId.trim();

  if (inFlightComplaintIds.has(cleanComplaintId)) {
    return res.status(429).json({
      success: false,
      error: `Complaint ${cleanComplaintId} is already being processed by JANASEVA AI. Please wait for the active run to finish.`,
    });
  }

  if (!checkRateLimit()) {
    return res.status(429).json({
      success: false,
      error: 'AI processing rate limit reached (max 20 runs per minute). Please wait briefly and retry.',
    });
  }

  const wantsStream =
    Boolean(stream) || String(req.headers.accept || '').includes('text/event-stream');

  const sendSse = (eventName, payload) => {
    if (!wantsStream || res.writableEnded) return;
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  inFlightComplaintIds.add(cleanComplaintId);

  try {
    let adminAvailable = false;
    let complaint = null;
    let departments = Array.isArray(suppliedDepartments) ? suppliedDepartments : [];
    const recentComplaints = Array.isArray(suppliedRecent) ? suppliedRecent.slice(0, 20) : [];
    const ref = db.collection('complaints').doc(cleanComplaintId);

    try {
      const snapshot = await ref.get();
      adminAvailable = true;
      if (snapshot.exists) {
        complaint = {
          ...(fallbackComplaint || {}),
          ...snapshot.data(),
        };
      } else if (fallbackComplaint) {
        complaint = fallbackComplaint;
      } else {
        inFlightComplaintIds.delete(cleanComplaintId);
        return res.status(404).json({
          success: false,
          error: 'Complaint not found',
        });
      }

      if (departments.length === 0) {
        const deptSnap = await db.collection('departments').get();
        departments = deptSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    } catch (adminReadErr) {
      adminAvailable = false;
      console.warn(
        `[/api/process-complaint] Firebase Admin read unavailable (${
          adminReadErr instanceof Error ? adminReadErr.message : String(adminReadErr)
        }); using authenticated request complaint payload.`
      );
      if (!fallbackComplaint) {
        inFlightComplaintIds.delete(cleanComplaintId);
        return res.status(503).json({
          success: false,
          error:
            'Server Firestore Admin credentials are unavailable and no complaint payload was supplied.',
        });
      }
      complaint = fallbackComplaint;
    }

    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      sendSse('started', {
        complaintId: cleanComplaintId,
        complaintCode: complaint.complaintCode || cleanComplaintId,
        totalSteps: 6,
      });
    }

    const startTime = Date.now();
    let result;

    if (departments.length > 0 && complaint.title && complaint.description && complaint.ward) {
      result = await orchestrateComplaintPipeline({
        intake: {
          title: String(complaint.title).trim(),
          description: String(complaint.description).trim(),
          locationText: String(complaint.locationText || complaint.location || 'Municipal area').trim(),
          ward: String(complaint.ward).trim(),
          userSelectedCategory: String(complaint.category || 'Road maintenance'),
          photoDataUrl:
            typeof complaint.photoDataUrl === 'string' && complaint.photoDataUrl.startsWith('data:')
              ? complaint.photoDataUrl
              : undefined,
        },
        departments: departments.map((d) => ({
          id: d.id,
          name: d.name || d.departmentName || 'Municipal Department',
          code: d.code || 'CIVIC',
          category: d.category || 'Road maintenance',
          serviceArea: d.serviceArea || 'All Municipal Wards',
          slaHours: Number(d.slaHours) || 48,
          headOfficerName: d.headOfficerName || 'Duty Officer',
        })),
        recentComplaints,
        onProgress: wantsStream ? (evt) => sendSse('progress', evt) : undefined,
      });
    } else {
      const legacy = await processComplaint(complaint);
      result = buildPlanFromLegacyOrchestrator(legacy, complaint, departments, startTime);
    }

    let persistedByServer = false;
    if (adminAvailable) {
      try {
        const matchedDept =
          departments.find((d) => d.id === result.departmentId) || departments[0];
        const existingTrail = Array.isArray(complaint.auditTrail) ? complaint.auditTrail : [];
        const newAuditEntry = {
          timestampIso: new Date().toISOString(),
          actorUid: complaint.citizenUid || 'system',
          actorName: complaint.citizenName || 'JANASEVA AI Orchestrator',
          actorRole: 'citizen',
          action: 'AI 6-agent triage completed (awaiting officer approval)',
          note: `Classified as ${result.aiCategory} (${result.priority}) and recommended ${result.departmentName}.`,
        };

        await ref.update({
          category: result.aiCategory,
          aiCategory: result.aiCategory,
          priority: result.priority,
          status: 'Under Review',
          departmentId: result.departmentId,
          department: result.departmentName.slice(0, 120),
          departmentName: result.departmentName.slice(0, 120),
          departmentHeadUid: matchedDept?.headOfficerUid || complaint.departmentHeadUid || '',
          assignedOfficerName: (matchedDept?.headOfficerName || complaint.assignedOfficerName || 'Duty Officer').slice(0, 100),
          escalationReason: result.requiresImmediateEscalation
            ? result.escalationWatchNote.slice(0, 1000)
            : '',
          aiSummary: result.aiSummary.slice(0, 2000),
          aiIntakeValid: result.intakeValid,
          aiSubIssueType: (result.subIssueType || '').slice(0, 120),
          aiPotentialDuplicates: (result.potentialDuplicates || [])
            .map((id) => String(id).slice(0, 32))
            .slice(0, 5),
          aiPriorityReason: result.aiPriorityReason.slice(0, 1000),
          aiRoutingReason: result.aiRoutingReason.slice(0, 1000),
          aiResolutionSteps: (result.aiResolutionSteps || [])
            .map((s) => String(s).slice(0, 290))
            .slice(0, 10),
          aiEstimatedHours: result.aiEstimatedHours,
          aiReminderSchedule: (result.reminderSchedule || '').slice(0, 300),
          aiExecutionSummary: result.executionSummary
            ? `${result.executionSummary.overallStatus}: ${result.executionSummary.completedCount}/${result.executionSummary.totalAgentsPlanned} completed, ${result.executionSummary.failedCount} failed (${result.totalLatencyMs}ms)`.slice(
                0,
                240
              )
            : `Completed (${result.totalLatencyMs}ms)`,
          recurringSignature: (result.recurringSignature || '').slice(0, 120),
          slaDueAt: result.slaDueAt,
          auditTrail: [...existingTrail.slice(-28), newAuditEntry],
          updatedAt: new Date(),
        });

        const batch = db.batch();
        const complaintCode = complaint.complaintCode || cleanComplaintId;
        const actorUid = complaint.citizenUid || 'system';
        result.traces.forEach((trace, idx) => {
          const logRef = db.collection('agent_logs').doc(`agl_${cleanComplaintId}_${idx}_${Date.now()}`);
          batch.set(logRef, {
            complaintId: cleanComplaintId,
            complaintCode,
            actorUid,
            agentName: trace.agentName,
            action: String(trace.action || '').slice(0, 120),
            input: String(trace.inputSummary || complaint.title || '').slice(0, 500),
            output: trace.outputData || { summary: String(trace.summary || '').slice(0, 500) },
            status: trace.status,
            latencyMs: Math.max(0, Math.round(Number(trace.latencyMs) || 0)),
            summary: String(trace.summary || '').slice(0, 1000),
            outputData: trace.outputData || {},
            timestamp: new Date(),
            createdAt: new Date(),
          });
        });
        await batch.commit();
        persistedByServer = true;
      } catch (adminWriteErr) {
        console.warn(
          `[/api/process-complaint] Firebase Admin write skipped (${
            adminWriteErr instanceof Error ? adminWriteErr.message : String(adminWriteErr)
          }); returning AI results for authenticated client persistence.`
        );
        persistedByServer = false;
      }
    }

    const responsePayload = {
      success: true,
      complaintId: cleanComplaintId,
      persistedByServer,
      result,
    };

    if (wantsStream) {
      sendSse('complete', responsePayload);
      return res.end();
    }

    return res.json(responsePayload);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Complaint processing failed';
    console.error('[/api/process-complaint] Error:', error);
    if (wantsStream) {
      sendSse('error', { success: false, error: message });
      return res.end();
    }
    return res.status(500).json({
      success: false,
      error: message,
    });
  } finally {
    inFlightComplaintIds.delete(cleanComplaintId);
  }
});

export default router;
