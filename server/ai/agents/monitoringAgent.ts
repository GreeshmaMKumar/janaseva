import { Type, ThinkingLevel } from '@google/genai';
import {
  callGeminiWithGuard,
  GEMINI_MODEL,
  getGeminiClient,
  safeParseJsonObject,
  type AgentTrace,
} from '../geminiClient.ts';
import type { ClassificationOutput } from './classificationAgent.ts';
import type { PriorityOutput } from './priorityAgent.ts';
import type { RoutingOutput } from './routingAgent.ts';
import type { ResolutionOutput } from './resolutionAgent.ts';

export interface MonitoringIntakeOutput {
  requiresImmediateEscalation: boolean;
  escalationWatchNote: string;
  reminderSchedule: string;
  slaCheckStatus: 'Nominal' | 'Watch' | 'Immediate Escalation';
  autoCloseAllowed: false;
}

export interface BatchMonitorComplaint {
  id: string;
  complaintCode: string;
  category: string;
  priority: string;
  status: string;
  ward: string;
  departmentName: string;
  slaDueAt: string;
  recurringSignature?: string;
  createdAtIso?: string;
}

export interface BatchMonitoringAnalysis {
  overallRiskSummary: string;
  escalationRecommendations: Array<{
    complaintId: string;
    complaintCode: string;
    reason: string;
    recommendedAction: string;
  }>;
  recurringHotspots: Array<{
    signature: string;
    ward: string;
    category: string;
    count: number;
    rootCauseHypothesis: string;
    preventiveRecommendation: string;
  }>;
}

const MONITORING_INTAKE_SYSTEM_INSTRUCTION = `You are AGENT 6 (Monitoring and Escalation Agent) for JANASEVA AI.
Your sole responsibility is auditing complaint status, configured SLA deadlines, and recommending automated officer reminders and escalation triggers.

CRITICAL GOVERNANCE RULES:
1. NEVER automatically close a complaint. Only Government Officers or verified Citizen feedback can close grievances.
2. Flag "requiresImmediateEscalation: true" only when Priority is Critical, public safety danger is imminent, or deadline is already breached.
3. Always provide a concrete "reminderSchedule" for the assigned department officer.
Respond strictly in JSON.`;

const BATCH_MONITORING_SYSTEM_INSTRUCTION = `You are AGENT 6 (Monitoring and Escalation Agent) for JANASEVA AI executing a portfolio SLA & recurring hotspot audit.
Check complaint statuses against slaDueAt timestamps. Recommend reminders and human-approved escalations for overdue or stalled Critical/High cases.
NEVER recommend automatic closure of unresolved complaints. Only reference complaintId and complaintCode values present in the input JSON. Respond strictly in JSON.`;

function validateMonitoringIntake(
  raw: Record<string, unknown>,
  priority: PriorityOutput
): MonitoringIntakeOutput {
  const rawStatus = String(raw.slaCheckStatus || '').trim();
  const slaCheckStatus: MonitoringIntakeOutput['slaCheckStatus'] =
    rawStatus === 'Immediate Escalation' || rawStatus === 'Watch' || rawStatus === 'Nominal'
      ? rawStatus
      : priority.priority === 'Critical'
        ? 'Immediate Escalation'
        : priority.priority === 'High'
          ? 'Watch'
          : 'Nominal';

  return {
    requiresImmediateEscalation:
      Boolean(raw.requiresImmediateEscalation) || slaCheckStatus === 'Immediate Escalation',
    escalationWatchNote: String(
      raw.escalationWatchNote || `Monitoring ${priority.recommendedSlaHours}h SLA deadline; awaiting officer action.`
    )
      .trim()
      .slice(0, 600),
    reminderSchedule: String(
      raw.reminderSchedule ||
        `Dispatch officer reminder at 50% and 80% of ${priority.recommendedSlaHours}h SLA window.`
    )
      .trim()
      .slice(0, 300),
    slaCheckStatus,
    autoCloseAllowed: false,
  };
}

export async function runMonitoringIntakeCheck(params: {
  title: string;
  ward: string;
  slaDueAtIso: string;
  classification: ClassificationOutput;
  priority: PriorityOutput;
  routing: RoutingOutput;
  resolution: ResolutionOutput;
}): Promise<{ output: MonitoringIntakeOutput; trace: AgentTrace }> {
  const start = Date.now();
  const ai = getGeminiClient();

  const prompt = `Audit SLA deadlines and recommend officer reminders/escalation triggers for this newly triaged complaint (current status: "Under Review", pending officer approval; do NOT auto-close):

- Title: ${params.title}
- Ward: ${params.ward}
- Category: ${params.classification.aiCategory}
- Priority: ${params.priority.priority} (Safety Risk: ${params.priority.publicSafetyRisk})
- Recommended Department: ${params.routing.departmentName}
- Estimated Field Hours: ${params.resolution.estimatedHours}h
- Configured SLA Deadline: ${params.slaDueAtIso} (${params.priority.recommendedSlaHours}h window)`;

  const response = await callGeminiWithGuard('Monitoring and Escalation Agent', () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: MONITORING_INTAKE_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            requiresImmediateEscalation: { type: Type.BOOLEAN },
            escalationWatchNote: { type: Type.STRING },
            reminderSchedule: { type: Type.STRING },
            slaCheckStatus: {
              type: Type.STRING,
              enum: ['Nominal', 'Watch', 'Immediate Escalation'],
            },
          },
          required: [
            'requiresImmediateEscalation',
            'escalationWatchNote',
            'reminderSchedule',
            'slaCheckStatus',
          ],
        },
      },
    })
  );

  const raw = safeParseJsonObject(response.text, 'Monitoring and Escalation Agent');
  const output = validateMonitoringIntake(raw, params.priority);

  return {
    output,
    trace: {
      agentName: 'Monitoring and Escalation Agent',
      action: 'SLA deadline audit & reminder/escalation check',
      status: output.requiresImmediateEscalation ? 'Escalated' : 'Completed',
      latencyMs: Date.now() - start,
      inputSummary: `Status: Under Review | SLA: ${params.priority.recommendedSlaHours}h | Est: ${params.resolution.estimatedHours}h`.slice(
        0,
        500
      ),
      summary: `${output.slaCheckStatus}: ${output.escalationWatchNote} Reminder: ${output.reminderSchedule}`.slice(
        0,
        950
      ),
      outputData: { ...output },
    },
  };
}

export async function runBatchMonitoringAnalysis(
  complaints: BatchMonitorComplaint[],
  nowIso: string
): Promise<{ analysis: BatchMonitoringAnalysis; trace: AgentTrace }> {
  const start = Date.now();
  const ai = getGeminiClient();

  const validIds = new Set(complaints.map((c) => c.id));
  const compactData = complaints.slice(0, 60).map((c) => ({
    id: c.id,
    code: c.complaintCode,
    cat: c.category,
    prio: c.priority,
    status: c.status,
    ward: c.ward,
    dept: c.departmentName,
    slaDueAt: c.slaDueAt,
    sig: c.recurringSignature || 'none',
  }));

  const prompt = `Current timestamp: ${nowIso}.
Analyze the following municipal complaints to identify overdue SLAs, reminder/escalation recommendations, and recurring ward hotspots:

Complaints JSON:
${JSON.stringify(compactData)}`;

  const response = await callGeminiWithGuard('Monitoring and Escalation Agent', () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: BATCH_MONITORING_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallRiskSummary: { type: Type.STRING },
            escalationRecommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  complaintId: { type: Type.STRING },
                  complaintCode: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  recommendedAction: { type: Type.STRING },
                },
                required: ['complaintId', 'complaintCode', 'reason', 'recommendedAction'],
              },
            },
            recurringHotspots: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  signature: { type: Type.STRING },
                  ward: { type: Type.STRING },
                  category: { type: Type.STRING },
                  count: { type: Type.INTEGER },
                  rootCauseHypothesis: { type: Type.STRING },
                  preventiveRecommendation: { type: Type.STRING },
                },
                required: [
                  'signature',
                  'ward',
                  'category',
                  'count',
                  'rootCauseHypothesis',
                  'preventiveRecommendation',
                ],
              },
            },
          },
          required: ['overallRiskSummary', 'escalationRecommendations', 'recurringHotspots'],
        },
      },
    })
  );

  const raw = safeParseJsonObject(response.text, 'Monitoring and Escalation Agent');
  const rawEscalations = Array.isArray(raw.escalationRecommendations)
    ? raw.escalationRecommendations
    : [];
  const rawHotspots = Array.isArray(raw.recurringHotspots) ? raw.recurringHotspots : [];

  const analysis: BatchMonitoringAnalysis = {
    overallRiskSummary: String(
      raw.overallRiskSummary || 'Portfolio SLA audit completed without critical anomalies.'
    ).slice(0, 950),
    escalationRecommendations: rawEscalations
      .map((item) => item as Record<string, unknown>)
      .filter((item) => validIds.has(String(item.complaintId || '')))
      .slice(0, 20)
      .map((item) => ({
        complaintId: String(item.complaintId),
        complaintCode: String(item.complaintCode || ''),
        reason: String(item.reason || '').slice(0, 400),
        recommendedAction: String(item.recommendedAction || '').slice(0, 400),
      })),
    recurringHotspots: rawHotspots
      .map((item) => item as Record<string, unknown>)
      .slice(0, 15)
      .map((item) => ({
        signature: String(item.signature || ''),
        ward: String(item.ward || ''),
        category: String(item.category || ''),
        count: Math.max(1, Math.round(Number(item.count) || 1)),
        rootCauseHypothesis: String(item.rootCauseHypothesis || '').slice(0, 400),
        preventiveRecommendation: String(item.preventiveRecommendation || '').slice(0, 400),
      })),
  };

  return {
    analysis,
    trace: {
      agentName: 'Monitoring and Escalation Agent',
      action: 'Portfolio SLA audit & recurring hotspot scan',
      status: analysis.escalationRecommendations.length > 0 ? 'Warning' : 'Completed',
      latencyMs: Date.now() - start,
      inputSummary: `Audited ${compactData.length} complaints at ${nowIso}`.slice(0, 500),
      summary: analysis.overallRiskSummary,
      outputData: {
        escalationCount: analysis.escalationRecommendations.length,
        hotspotCount: analysis.recurringHotspots.length,
        autoCloseAllowed: false,
      },
    },
  };
}
