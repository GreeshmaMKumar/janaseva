import { getDepartmentKnowledgeBase } from './departmentKnowledgeBase.ts';
import type {
  AgentTrace,
  ComplaintCategory,
  DepartmentContext,
  RecentComplaintContext,
} from './geminiClient.ts';
import { runComplaintIntakeAgent, type IntakeInput, type IntakeOutput } from './agents/intakeAgent.ts';
import {
  runClassificationAgent,
  type ClassificationOutput,
} from './agents/classificationAgent.ts';
import { runPriorityAgent, type PriorityOutput } from './agents/priorityAgent.ts';
import { runRoutingAgent, type RoutingOutput } from './agents/routingAgent.ts';
import { runResolutionAgent, type ResolutionOutput } from './agents/resolutionAgent.ts';
import {
  runMonitoringIntakeCheck,
  type MonitoringIntakeOutput,
} from './agents/monitoringAgent.ts';

const MAX_AGENTS_PER_RUN = 6;

export interface OrchestratorProgressEvent {
  type: 'agent_started' | 'agent_completed';
  stepNumber: number;
  totalSteps: number;
  agentName: AgentTrace['agentName'];
  action: string;
  status?: AgentTrace['status'];
  latencyMs?: number;
  summary?: string;
}

export interface OrchestrateRequest {
  intake: IntakeInput;
  departments: DepartmentContext[];
  recentComplaints?: RecentComplaintContext[];
  onProgress?: (event: OrchestratorProgressEvent) => void;
}

export interface PipelineExecutionSummary {
  totalAgentsPlanned: number;
  executedCount: number;
  completedCount: number;
  warningCount: number;
  escalatedCount: number;
  failedCount: number;
  overallStatus: 'Completed' | 'Warning' | 'Escalated' | 'Partial Failure';
}

export interface OrchestratedComplaintPlan {
  intakeValid: boolean;
  intakeDetails: {
    issue: string;
    location: string;
    duration: string;
    affectedPeople: string;
    evidence: string;
  };
  aiSummary: string;
  visualObservation: string;
  aiCategory: string;
  subIssueType: string;
  recurringSignature: string;
  isPotentialDuplicate: boolean;
  potentialDuplicates: string[];
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  aiPriorityReason: string;
  departmentId: string;
  departmentName: string;
  aiRoutingReason: string;
  aiResolutionSteps: string[];
  aiEstimatedHours: number;
  requiredResources: string;
  knowledgeBaseCode: string;
  slaDueAt: string;
  requiresImmediateEscalation: boolean;
  escalationWatchNote: string;
  reminderSchedule: string;
  slaCheckStatus: 'Nominal' | 'Watch' | 'Immediate Escalation';
  requiresOfficerApproval: true;
  autoCloseAllowed: false;
  executionSummary: PipelineExecutionSummary;
  traces: AgentTrace[];
  totalLatencyMs: number;
}

function isFatalConfigurationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('GEMINI_API_KEY is not configured') ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('401') ||
    msg.includes('403')
  );
}

async function executeAgentStep<T>(params: {
  agentName: AgentTrace['agentName'];
  action: string;
  inputSummary: string;
  stepNumber: number;
  onProgress?: (event: OrchestratorProgressEvent) => void;
  run: () => Promise<{ output: T; trace: AgentTrace }>;
  fallbackOutput: () => T;
}): Promise<{ output: T; trace: AgentTrace; failed: boolean }> {
  if (params.stepNumber > MAX_AGENTS_PER_RUN) {
    throw new Error(`Orchestrator loop guard exceeded maximum of ${MAX_AGENTS_PER_RUN} sequential agents.`);
  }
  params.onProgress?.({
    type: 'agent_started',
    stepNumber: params.stepNumber,
    totalSteps: MAX_AGENTS_PER_RUN,
    agentName: params.agentName,
    action: params.action,
  });

  const start = Date.now();
  try {
    const res = await params.run();
    params.onProgress?.({
      type: 'agent_completed',
      stepNumber: params.stepNumber,
      totalSteps: MAX_AGENTS_PER_RUN,
      agentName: params.agentName,
      action: params.action,
      status: res.trace.status,
      latencyMs: res.trace.latencyMs,
      summary: res.trace.summary,
    });
    return { output: res.output, trace: res.trace, failed: false };
  } catch (err) {
    if (isFatalConfigurationError(err)) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[Orchestrator] ${params.agentName} failed:`, reason);
    const trace: AgentTrace = {
      agentName: params.agentName,
      action: params.action,
      status: 'Failed',
      latencyMs: Date.now() - start,
      inputSummary: params.inputSummary.slice(0, 500),
      summary: `Agent execution failed (${reason.slice(0, 220)}). Deterministic safeguard applied; officer review required.`.slice(
        0,
        950
      ),
      outputData: {
        error: reason.slice(0, 300),
        fallbackApplied: true,
        requiresOfficerApproval: true,
      },
    };
    params.onProgress?.({
      type: 'agent_completed',
      stepNumber: params.stepNumber,
      totalSteps: MAX_AGENTS_PER_RUN,
      agentName: params.agentName,
      action: params.action,
      status: trace.status,
      latencyMs: trace.latencyMs,
      summary: trace.summary,
    });
    return {
      output: params.fallbackOutput(),
      failed: true,
      trace,
    };
  }
}

export async function orchestrateComplaintPipeline(
  req: OrchestrateRequest
): Promise<OrchestratedComplaintPlan> {
  const pipelineStart = Date.now();
  const traces: AgentTrace[] = [];
  let failedCount = 0;

  // STEP 1 (Sequential): AGENT 1 – INTAKE
  const step1 = await executeAgentStep<IntakeOutput>({
    agentName: 'Complaint Intake Agent',
    action: req.intake.photoDataUrl
      ? 'Multimodal intake & evidence extraction'
      : 'Structured text intake extraction',
    inputSummary: `${req.intake.title} | ${req.intake.ward}`,
    stepNumber: 1,
    onProgress: req.onProgress,
    run: () => runComplaintIntakeAgent(req.intake),
    fallbackOutput: () => ({
      intakeValid: req.intake.description.trim().length >= 10,
      issue: req.intake.title.trim().slice(0, 300),
      location: `${req.intake.locationText.trim()} (${req.intake.ward.trim()})`.slice(0, 300),
      duration: 'Not specified by citizen',
      affectedPeople: 'Local residents and street commuters',
      evidence: req.intake.photoDataUrl
        ? 'Site photograph attached (AI inspection fallback)'
        : 'Textual description submitted',
      normalizedSummary: req.intake.description.trim().slice(0, 400),
      visualObservation: req.intake.photoDataUrl
        ? 'Site photograph attached; manual officer visual inspection required.'
        : 'No photographic evidence attached',
      extractedLocationClues: req.intake.locationText.trim().slice(0, 250),
      missingDetailsNote: 'Intake agent fallback applied due to transient failure.',
    }),
  });
  traces.push(step1.trace);
  if (step1.failed) failedCount += 1;

  // STEP 2 (Sequential): AGENT 2 – CLASSIFICATION (consumes Step 1 Intake output)
  const step2 = await executeAgentStep<ClassificationOutput>({
    agentName: 'Complaint Classification Agent',
    action: 'Category, subcategory & duplicate detection',
    inputSummary: `Issue: ${step1.output.issue}`,
    stepNumber: 2,
    onProgress: req.onProgress,
    run: () =>
      runClassificationAgent({
        title: req.intake.title,
        description: req.intake.description,
        ward: req.intake.ward,
        locationText: req.intake.locationText,
        userSelectedCategory: req.intake.userSelectedCategory,
        intake: step1.output,
        recentComplaints: req.recentComplaints || [],
      }),
    fallbackOutput: () => ({
      aiCategory: (req.intake.userSelectedCategory as ComplaintCategory) || 'Road maintenance',
      subIssueType: 'Pending officer classification verification',
      recurringSignature: `${req.intake.ward.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-civic-issue`.slice(
        0,
        80
      ),
      isPotentialDuplicate: false,
      potentialDuplicates: [],
      classificationConfidenceNote: 'Classification fallback applied; officer verification required.',
    }),
  });
  traces.push(step2.trace);
  if (step2.failed) failedCount += 1;

  // STEP 3 (Sequential): AGENT 3 – PRIORITY (consumes Steps 1 & 2)
  const step3 = await executeAgentStep<PriorityOutput>({
    agentName: 'Priority Assessment Agent',
    action: 'Severity, safety, impact & duration triage',
    inputSummary: `${step2.output.aiCategory} | Duration: ${step1.output.duration}`,
    stepNumber: 3,
    onProgress: req.onProgress,
    run: () =>
      runPriorityAgent({
        title: req.intake.title,
        description: req.intake.description,
        locationText: req.intake.locationText,
        intake: step1.output,
        classification: step2.output,
      }),
    fallbackOutput: () => ({
      priority: 'Medium',
      severityScore: 5,
      publicSafetyRisk: 'Pending officer hazard confirmation',
      affectedPopulationFactor: step1.output.affectedPeople,
      durationFactor: step1.output.duration,
      priorityReason: 'Default Medium priority assigned due to transient AI error; officer review required.',
      recommendedSlaHours: 48,
    }),
  });
  traces.push(step3.trace);
  if (step3.failed) failedCount += 1;

  // STEP 4 (Sequential): AGENT 4 – ROUTING (consumes Steps 2 & 3 + configured department directory)
  const step4 = await executeAgentStep<RoutingOutput>({
    agentName: 'Department Routing Agent',
    action: 'Category & jurisdiction routing (pending officer approval)',
    inputSummary: `${step2.output.aiCategory} | Ward: ${req.intake.ward}`,
    stepNumber: 4,
    onProgress: req.onProgress,
    run: () =>
      runRoutingAgent({
        title: req.intake.title,
        locationText: req.intake.locationText,
        ward: req.intake.ward,
        classification: step2.output,
        priority: step3.output,
        departments: req.departments,
      }),
    fallbackOutput: () => {
      const matched =
        req.departments.find(
          (d) => d.category.toLowerCase() === step2.output.aiCategory.toLowerCase()
        ) || req.departments[0];
      return {
        departmentId: matched.id,
        departmentName: matched.name,
        jurisdictionMatch: matched.serviceArea || req.intake.ward,
        routingReason: `Directory category fallback matched ${matched.name}; awaiting officer approval.`,
        requiresOfficerApproval: true,
      };
    },
  });
  traces.push(step4.trace);
  if (step4.failed) failedCount += 1;

  // STEP 5 (Sequential): AGENT 5 – RESOLUTION (consumes Steps 1-4 + predefined department knowledge base)
  const kb = getDepartmentKnowledgeBase(step2.output.aiCategory);
  const step5 = await executeAgentStep<ResolutionOutput>({
    agentName: 'Resolution Recommendation Agent',
    action: `SOP generation via ${kb.departmentCode} knowledge base`,
    inputSummary: `${step4.output.departmentName} | KB: ${kb.departmentCode}`,
    stepNumber: 5,
    onProgress: req.onProgress,
    run: () =>
      runResolutionAgent({
        title: req.intake.title,
        description: req.intake.description,
        locationText: req.intake.locationText,
        intake: step1.output,
        classification: step2.output,
        priority: step3.output,
        routing: step4.output,
      }),
    fallbackOutput: () => ({
      resolutionSteps: kb.standardSops.slice(0, 4),
      estimatedHours: kb.defaultHoursRange[1],
      requiredResources: kb.standardEquipment.join(', '),
      knowledgeBaseCode: kb.departmentCode,
    }),
  });
  traces.push(step5.trace);
  if (step5.failed) failedCount += 1;

  // Compute configured SLA deadline from Priority Agent + matched Department SLA
  const matchedDept = req.departments.find((d) => d.id === step4.output.departmentId);
  const effectiveSlaHours = matchedDept
    ? Math.min(step3.output.recommendedSlaHours, matchedDept.slaHours)
    : step3.output.recommendedSlaHours;
  const slaDueDate = new Date(Date.now() + effectiveSlaHours * 3600 * 1000);
  const slaDueAtIso = slaDueDate.toISOString();

  // STEP 6 (Sequential): AGENT 6 – MONITORING (consumes Steps 2-5 + SLA deadline)
  const step6 = await executeAgentStep<MonitoringIntakeOutput>({
    agentName: 'Monitoring and Escalation Agent',
    action: 'SLA deadline audit & reminder/escalation check',
    inputSummary: `SLA: ${effectiveSlaHours}h | Est: ${step5.output.estimatedHours}h`,
    stepNumber: 6,
    onProgress: req.onProgress,
    run: () =>
      runMonitoringIntakeCheck({
        title: req.intake.title,
        ward: req.intake.ward,
        slaDueAtIso,
        classification: step2.output,
        priority: step3.output,
        routing: step4.output,
        resolution: step5.output,
      }),
    fallbackOutput: () => ({
      requiresImmediateEscalation: step3.output.priority === 'Critical',
      escalationWatchNote: `Monitoring ${effectiveSlaHours}h SLA deadline; awaiting officer approval. Auto-close disabled.`,
      reminderSchedule: `Notify assigned officer at 50% and 80% of ${effectiveSlaHours}h SLA window.`,
      slaCheckStatus: step3.output.priority === 'Critical' ? 'Immediate Escalation' : 'Watch',
      autoCloseAllowed: false,
    }),
  });
  traces.push(step6.trace);
  if (step6.failed) failedCount += 1;

  // If every single agent failed (e.g. total Gemini outage), fail loudly instead of silently persisting fallback
  if (failedCount >= MAX_AGENTS_PER_RUN) {
    throw new Error('All 6 JANASEVA AI agents failed to execute. Please verify Gemini API availability and retry.');
  }

  const totalLatencyMs = Date.now() - pipelineStart;
  const completedCount = traces.filter((t) => t.status === 'Completed').length;
  const warningCount = traces.filter((t) => t.status === 'Warning').length;
  const escalatedCount = traces.filter((t) => t.status === 'Escalated').length;

  const overallStatus: PipelineExecutionSummary['overallStatus'] =
    failedCount > 0
      ? 'Partial Failure'
      : escalatedCount > 0
        ? 'Escalated'
        : warningCount > 0
          ? 'Warning'
          : 'Completed';

  const executionSummary: PipelineExecutionSummary = {
    totalAgentsPlanned: MAX_AGENTS_PER_RUN,
    executedCount: traces.length,
    completedCount,
    warningCount,
    escalatedCount,
    failedCount,
    overallStatus,
  };

  const orchestratorStatus: AgentTrace['status'] =
    failedCount > 0
      ? 'Warning'
      : step6.output.requiresImmediateEscalation
        ? 'Escalated'
        : warningCount > 0
          ? 'Warning'
          : 'Completed';

  const orchestratorTrace: AgentTrace = {
    agentName: 'Central Orchestrator',
    action: 'Sequential 6-agent pipeline orchestration',
    status: orchestratorStatus,
    latencyMs: totalLatencyMs,
    inputSummary: `${req.intake.title} | ${req.intake.ward} | Sequential 6-agent run`.slice(0, 500),
    summary: `Executed ${traces.length}/6 agents sequentially in ${totalLatencyMs}ms (${completedCount} completed, ${warningCount} warning, ${escalatedCount} escalated, ${failedCount} failed). Routed to ${step4.output.departmentName}; officer approval required.`.slice(
      0,
      950
    ),
    outputData: {
      aiCategory: step2.output.aiCategory,
      priority: step3.output.priority,
      departmentId: step4.output.departmentId,
      slaHours: effectiveSlaHours,
      requiresOfficerApproval: true,
      autoCloseAllowed: false,
      executionSummary,
    },
  };

  return {
    intakeValid: step1.output.intakeValid,
    intakeDetails: {
      issue: step1.output.issue,
      location: step1.output.location,
      duration: step1.output.duration,
      affectedPeople: step1.output.affectedPeople,
      evidence: step1.output.evidence,
    },
    aiSummary: `${step1.output.normalizedSummary}${
      step1.output.visualObservation &&
      step1.output.visualObservation !== 'No photographic evidence attached'
        ? ` Visual inspection: ${step1.output.visualObservation}`
        : ''
    }`.slice(0, 1900),
    visualObservation: step1.output.visualObservation,
    aiCategory: step2.output.aiCategory,
    subIssueType: step2.output.subIssueType,
    recurringSignature: step2.output.recurringSignature,
    isPotentialDuplicate: step2.output.isPotentialDuplicate,
    potentialDuplicates: step2.output.potentialDuplicates,
    priority: step3.output.priority,
    aiPriorityReason: step3.output.priorityReason.slice(0, 950),
    departmentId: step4.output.departmentId,
    departmentName: step4.output.departmentName,
    aiRoutingReason: step4.output.routingReason.slice(0, 950),
    aiResolutionSteps: step5.output.resolutionSteps,
    aiEstimatedHours: step5.output.estimatedHours,
    requiredResources: step5.output.requiredResources,
    knowledgeBaseCode: step5.output.knowledgeBaseCode,
    slaDueAt: slaDueAtIso,
    requiresImmediateEscalation: step6.output.requiresImmediateEscalation,
    escalationWatchNote: step6.output.escalationWatchNote,
    reminderSchedule: step6.output.reminderSchedule,
    slaCheckStatus: step6.output.slaCheckStatus,
    requiresOfficerApproval: true,
    autoCloseAllowed: false,
    executionSummary,
    traces: [orchestratorTrace, ...traces],
    totalLatencyMs,
  };
}
