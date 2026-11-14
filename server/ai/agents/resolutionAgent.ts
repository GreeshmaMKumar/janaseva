import { Type, ThinkingLevel } from '@google/genai';
import {
  callGeminiWithGuard,
  GEMINI_MODEL,
  getGeminiClient,
  safeParseJsonObject,
  type AgentTrace,
} from '../geminiClient.ts';
import { getDepartmentKnowledgeBase } from '../departmentKnowledgeBase.ts';
import type { IntakeOutput } from './intakeAgent.ts';
import type { ClassificationOutput } from './classificationAgent.ts';
import type { PriorityOutput } from './priorityAgent.ts';
import type { RoutingOutput } from './routingAgent.ts';

export interface ResolutionOutput {
  resolutionSteps: string[];
  estimatedHours: number;
  requiredResources: string;
  knowledgeBaseCode: string;
}

const RESOLUTION_SYSTEM_INSTRUCTION = `You are AGENT 5 (Resolution Recommendation Agent) for JANASEVA AI.
Your sole responsibility is recommending practical municipal field next steps grounded strictly in the provided Predefined Department Knowledge Base.

CRITICAL SAFETY & GOVERNANCE RULES:
1. NEVER claim, state, or imply that the complaint has already been resolved, completed, repaired, or closed. All steps are pending future actions awaiting officer approval and field dispatch.
2. Tailor the Predefined Department Knowledge Base SOPs and safety protocols to the specific site, evidence, and urgency.
3. Output 3 to 5 concise, practical, actionable steps (each under 200 characters).
Respond strictly in JSON.`;

const FORBIDDEN_RESOLVED_PATTERNS = [
  /already\s+resolved/i,
  /has\s+been\s+resolved/i,
  /issue\s+is\s+resolved/i,
  /complaint\s+is\s+closed/i,
  /already\s+fixed/i,
];

function sanitizePendingStep(step: string): string {
  let clean = step.trim().slice(0, 260);
  for (const pattern of FORBIDDEN_RESOLVED_PATTERNS) {
    clean = clean.replace(pattern, 'pending field verification and officer sign-off');
  }
  return clean;
}

function validateResolutionOutput(
  raw: Record<string, unknown>,
  kb: ReturnType<typeof getDepartmentKnowledgeBase>
): ResolutionOutput {
  const rawSteps = Array.isArray(raw.resolutionSteps) ? raw.resolutionSteps : [];
  const steps = rawSteps
    .map((s) => sanitizePendingStep(String(s)))
    .filter((s) => s.length >= 5)
    .slice(0, 6);

  const [minH, maxH] = kb.defaultHoursRange;
  const parsedHours = Number(raw.estimatedHours) || maxH;
  const estimatedHours = Math.max(1, Math.min(240, Math.round(Math.max(minH / 2, parsedHours))));

  return {
    resolutionSteps: steps.length > 0 ? steps : kb.standardSops.slice(0, 4),
    estimatedHours,
    requiredResources: String(raw.requiredResources || kb.standardEquipment.join(', '))
      .trim()
      .slice(0, 400),
    knowledgeBaseCode: kb.departmentCode,
  };
}

export async function runResolutionAgent(params: {
  title: string;
  description: string;
  locationText: string;
  intake: IntakeOutput;
  classification: ClassificationOutput;
  priority: PriorityOutput;
  routing: RoutingOutput;
}): Promise<{ output: ResolutionOutput; trace: AgentTrace }> {
  const start = Date.now();
  const ai = getGeminiClient();
  const kb = getDepartmentKnowledgeBase(params.classification.aiCategory);

  const prompt = `Recommend practical next steps using the Predefined Department Knowledge Base below. Remember: NEVER claim the complaint is already resolved.

Predefined Department Knowledge Base (${kb.departmentCode} · ${kb.category}):
- Standard SOPs: ${kb.standardSops.map((s, i) => `${i + 1}) ${s}`).join(' ')}
- Safety Protocols: ${kb.safetyProtocols.join(' ')}
- Standard Equipment: ${kb.standardEquipment.join(', ')}
- Typical Resolution Window: ${kb.defaultHoursRange[0]}–${kb.defaultHoursRange[1]} hours

Complaint & Upstream Agent Outputs:
- Routed Department: ${params.routing.departmentName} (Awaiting Officer Approval)
- Subcategory: ${params.classification.subIssueType}
- Priority: ${params.priority.priority} (Safety Risk: ${params.priority.publicSafetyRisk})
- Location: ${params.intake.location}
- Issue Summary: ${params.intake.normalizedSummary}
- Visual Evidence: ${params.intake.visualObservation}`;

  const response = await callGeminiWithGuard('Resolution Recommendation Agent', () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: RESOLUTION_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            resolutionSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            estimatedHours: { type: Type.INTEGER },
            requiredResources: { type: Type.STRING },
          },
          required: ['resolutionSteps', 'estimatedHours', 'requiredResources'],
        },
      },
    })
  );

  const raw = safeParseJsonObject(response.text, 'Resolution Recommendation Agent');
  const output = validateResolutionOutput(raw, kb);

  return {
    output,
    trace: {
      agentName: 'Resolution Recommendation Agent',
      action: `SOP generation via ${kb.departmentCode} knowledge base`,
      status: 'Completed',
      latencyMs: Date.now() - start,
      inputSummary: `${params.routing.departmentName} | KB: ${kb.departmentCode} | Priority: ${params.priority.priority}`.slice(
        0,
        500
      ),
      summary: `Generated ${output.resolutionSteps.length}-step field SOP (~${output.estimatedHours}h) using ${kb.departmentCode} knowledge base (pending officer approval).`.slice(
        0,
        950
      ),
      outputData: { ...output },
    },
  };
}
