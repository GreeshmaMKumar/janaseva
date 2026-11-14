import { Type, ThinkingLevel } from '@google/genai';
import {
  callGeminiWithGuard,
  GEMINI_MODEL,
  getGeminiClient,
  safeParseJsonObject,
  type AgentTrace,
  type DepartmentContext,
} from '../geminiClient.ts';
import type { ClassificationOutput } from './classificationAgent.ts';
import type { PriorityOutput } from './priorityAgent.ts';

export interface RoutingOutput {
  departmentId: string;
  departmentName: string;
  jurisdictionMatch: string;
  routingReason: string;
  requiresOfficerApproval: boolean;
}

const ROUTING_SYSTEM_INSTRUCTION = `You are AGENT 4 (Department Routing Agent) for JANASEVA AI.
Your sole responsibility is recommending the responsible municipal department from the configured department directory based on:
1. Classified civic category & technical subcategory
2. Municipal jurisdiction / service area & ward

Constraints:
- You MUST choose an exact "departmentId" from the provided Departments Directory.
- Routing recommendations are advisory and ALWAYS require human Government Officer approval before official dispatch.
Respond strictly in JSON.`;

function validateRoutingOutput(
  raw: Record<string, unknown>,
  departments: DepartmentContext[],
  category: string,
  ward: string
): RoutingOutput {
  const requestedId = String(raw.departmentId || '').trim();
  const matched =
    departments.find((d) => d.id === requestedId) ||
    departments.find((d) => d.category.toLowerCase() === category.toLowerCase()) ||
    departments[0];

  if (!matched) {
    throw new Error('Department Routing Agent could not resolve a valid department from directory.');
  }

  return {
    departmentId: matched.id,
    departmentName: matched.name,
    jurisdictionMatch: String(
      raw.jurisdictionMatch || matched.serviceArea || ward
    )
      .trim()
      .slice(0, 200),
    routingReason: String(
      raw.routingReason || `Matched ${matched.name} for ${category} in ${ward}.`
    )
      .trim()
      .slice(0, 900),
    requiresOfficerApproval: true,
  };
}

export async function runRoutingAgent(params: {
  title: string;
  locationText: string;
  ward: string;
  classification: ClassificationOutput;
  priority: PriorityOutput;
  departments: DepartmentContext[];
}): Promise<{ output: RoutingOutput; trace: AgentTrace }> {
  const start = Date.now();
  const ai = getGeminiClient();

  const deptListText = params.departments
    .map(
      (d) =>
        `- id: "${d.id}", name: "${d.name}", code: "${d.code}", category: "${d.category}", jurisdiction: "${
          d.serviceArea || 'All Municipal Wards'
        }", slaHours: ${d.slaHours}, head: "${d.headOfficerName}"`
    )
    .join('\n');

  const prompt = `Recommend the responsible municipal department from the configured directory:

Configured Department Directory:
${deptListText}

Upstream Agent Context:
- Category: ${params.classification.aiCategory} (${params.classification.subIssueType})
- Priority: ${params.priority.priority} (${params.priority.recommendedSlaHours}h target SLA)
- Ward / Jurisdiction: ${params.ward}
- Street Location: ${params.locationText}
- Complaint Title: ${params.title}`;

  const response = await callGeminiWithGuard('Department Routing Agent', () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: ROUTING_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            departmentId: { type: Type.STRING },
            departmentName: { type: Type.STRING },
            jurisdictionMatch: { type: Type.STRING },
            routingReason: { type: Type.STRING },
          },
          required: ['departmentId', 'departmentName', 'jurisdictionMatch', 'routingReason'],
        },
      },
    })
  );

  const raw = safeParseJsonObject(response.text, 'Department Routing Agent');
  const output = validateRoutingOutput(
    raw,
    params.departments,
    params.classification.aiCategory,
    params.ward
  );

  return {
    output,
    trace: {
      agentName: 'Department Routing Agent',
      action: 'Category & jurisdiction routing (pending officer approval)',
      status: 'Completed',
      latencyMs: Date.now() - start,
      inputSummary: `${params.classification.aiCategory} | Ward: ${params.ward} | ${params.departments.length} depts`.slice(
        0,
        500
      ),
      summary: `Recommended ${output.departmentName} (${output.jurisdictionMatch}). ${output.routingReason}`.slice(
        0,
        950
      ),
      outputData: { ...output },
    },
  };
}
