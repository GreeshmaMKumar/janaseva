import { Type, ThinkingLevel } from '@google/genai';
import {
  callGeminiWithGuard,
  GEMINI_MODEL,
  getGeminiClient,
  safeParseJsonObject,
  type AgentTrace,
  type ComplaintPriority,
} from '../geminiClient.ts';
import type { IntakeOutput } from './intakeAgent.ts';
import type { ClassificationOutput } from './classificationAgent.ts';

export interface PriorityOutput {
  priority: ComplaintPriority;
  severityScore: number;
  publicSafetyRisk: string;
  affectedPopulationFactor: string;
  durationFactor: string;
  priorityReason: string;
  recommendedSlaHours: number;
}

const VALID_PRIORITIES: ComplaintPriority[] = ['Critical', 'High', 'Medium', 'Low'];

const PRIORITY_SYSTEM_INSTRUCTION = `You are AGENT 3 (Priority Assessment Agent) for JANASEVA AI.
Your sole responsibility is evaluating municipal urgency across four dimensions:
1. Physical severity of infrastructure failure
2. Immediate public safety hazards (open manholes, live electrical hazards, flooded roads, contaminated drinking water, proximity to hospitals/schools/arterial junctions)
3. Number/scope of affected people
4. Duration of unresolved exposure

Return strictly:
- priority: one of "Critical", "High", "Medium", or "Low"
- severityScore: integer 1 (lowest) to 10 (highest)
- publicSafetyRisk: concise safety risk label
- affectedPopulationFactor: evaluation of affected population scale
- durationFactor: evaluation of how duration impacts urgency
- priorityReason: clear 1-2 sentence reasoning synthesizing severity, safety, affected people, and duration
- recommendedSlaHours: integer SLA deadline hours (Critical: 4-12, High: 12-24, Medium: 24-48, Low: 48-96)
Respond strictly in JSON.`;

function validatePriorityOutput(raw: Record<string, unknown>): PriorityOutput {
  const rawPriority = String(raw.priority || '').trim();
  const priority: ComplaintPriority =
    VALID_PRIORITIES.find((p) => p.toLowerCase() === rawPriority.toLowerCase()) || 'Medium';
  const severityScore = Math.max(1, Math.min(10, Math.round(Number(raw.severityScore) || 5)));
  const slaHours = Math.max(4, Math.min(168, Math.round(Number(raw.recommendedSlaHours) || 48)));
  const priorityReason = String(raw.priorityReason || '').trim();
  if (!priorityReason) {
    throw new Error('Priority Assessment Agent output missing priorityReason.');
  }

  return {
    priority,
    severityScore,
    publicSafetyRisk: String(raw.publicSafetyRisk || 'Standard municipal risk').trim().slice(0, 200),
    affectedPopulationFactor: String(raw.affectedPopulationFactor || 'Local residents')
      .trim()
      .slice(0, 250),
    durationFactor: String(raw.durationFactor || 'Newly reported').trim().slice(0, 200),
    priorityReason: priorityReason.slice(0, 900),
    recommendedSlaHours: slaHours,
  };
}

export async function runPriorityAgent(params: {
  title: string;
  description: string;
  locationText: string;
  intake: IntakeOutput;
  classification: ClassificationOutput;
}): Promise<{ output: PriorityOutput; trace: AgentTrace }> {
  const start = Date.now();
  const ai = getGeminiClient();

  const prompt = `Assess complaint priority using outputs from Agent 1 (Intake) and Agent 2 (Classification):

Agent 1 Intake:
- Issue: ${params.intake.issue}
- Location: ${params.intake.location}
- Duration: ${params.intake.duration}
- Affected People: ${params.intake.affectedPeople}
- Visual Evidence: ${params.intake.visualObservation}

Agent 2 Classification:
- Category: ${params.classification.aiCategory}
- Subcategory: ${params.classification.subIssueType}
- Potential Duplicate: ${params.classification.isPotentialDuplicate ? 'Yes' : 'No'}

Original Citizen Description:
${params.description}`;

  const response = await callGeminiWithGuard('Priority Assessment Agent', () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: PRIORITY_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            priority: {
              type: Type.STRING,
              enum: ['Low', 'Medium', 'High', 'Critical'],
            },
            severityScore: { type: Type.INTEGER },
            publicSafetyRisk: { type: Type.STRING },
            affectedPopulationFactor: { type: Type.STRING },
            durationFactor: { type: Type.STRING },
            priorityReason: { type: Type.STRING },
            recommendedSlaHours: { type: Type.INTEGER },
          },
          required: [
            'priority',
            'severityScore',
            'publicSafetyRisk',
            'affectedPopulationFactor',
            'durationFactor',
            'priorityReason',
            'recommendedSlaHours',
          ],
        },
      },
    })
  );

  const raw = safeParseJsonObject(response.text, 'Priority Assessment Agent');
  const output = validatePriorityOutput(raw);

  return {
    output,
    trace: {
      agentName: 'Priority Assessment Agent',
      action: 'Severity, safety, impact & duration triage',
      status: output.priority === 'Critical' ? 'Warning' : 'Completed',
      latencyMs: Date.now() - start,
      inputSummary: `${params.classification.aiCategory} | Duration: ${params.intake.duration} | Affected: ${params.intake.affectedPeople}`.slice(0, 500),
      summary: `Priority ${output.priority} (Severity ${output.severityScore}/10, ${output.recommendedSlaHours}h SLA) — ${output.priorityReason}`.slice(
        0,
        950
      ),
      outputData: { ...output },
    },
  };
}
