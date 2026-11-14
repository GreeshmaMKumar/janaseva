import { Type, ThinkingLevel } from '@google/genai';
import {
  callGeminiWithGuard,
  COMPLAINT_CATEGORIES,
  GEMINI_MODEL,
  getGeminiClient,
  safeParseJsonObject,
  type AgentTrace,
  type ComplaintCategory,
  type RecentComplaintContext,
} from '../geminiClient.ts';
import type { IntakeOutput } from './intakeAgent.ts';

export interface ClassificationOutput {
  aiCategory: ComplaintCategory;
  subIssueType: string;
  recurringSignature: string;
  isPotentialDuplicate: boolean;
  potentialDuplicates: string[];
  classificationConfidenceNote: string;
}

const CLASSIFICATION_SYSTEM_INSTRUCTION = `You are AGENT 2 (Complaint Classification Agent) for JANASEVA AI.
Your sole responsibility is classifying extracted civic complaints into strictly one of these five municipal categories:
1. "Road maintenance"
2. "Sanitation"
3. "Street lighting"
4. "Water supply"
5. "Drainage"

You must also:
- Identify a precise subcategory ("subIssueType") describing the technical defect.
- Generate a lowercase kebab-case "recurringSignature" combining ward and issue type (max 60 chars) for hotspot grouping.
- Compare against any provided recent complaints in the same ward/category to identify potential duplicate complaints ("potentialDuplicates" containing matching complaintCodes, and boolean "isPotentialDuplicate").
Never invent fake complaint codes not present in the provided recent complaints list. Respond strictly in JSON.`;

function validateClassificationOutput(
  raw: Record<string, unknown>,
  recentComplaints: RecentComplaintContext[]
): ClassificationOutput {
  const rawCat = String(raw.aiCategory || '').trim();
  const safeCategory: ComplaintCategory = COMPLAINT_CATEGORIES.find(
    (c) => c.toLowerCase() === rawCat.toLowerCase()
  ) || 'Road maintenance';

  const validCodes = new Set(recentComplaints.map((c) => c.complaintCode));
  const rawDuplicates = Array.isArray(raw.potentialDuplicates) ? raw.potentialDuplicates : [];
  const potentialDuplicates = rawDuplicates
    .map((x) => String(x).trim())
    .filter((code) => validCodes.has(code))
    .slice(0, 5);

  const subIssueType = String(raw.subIssueType || '').trim() || 'General civic infrastructure defect';
  return {
    aiCategory: safeCategory,
    subIssueType: subIssueType.slice(0, 120),
    recurringSignature: String(raw.recurringSignature || 'civic-general-issue')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 100),
    isPotentialDuplicate: Boolean(raw.isPotentialDuplicate) && potentialDuplicates.length > 0,
    potentialDuplicates,
    classificationConfidenceNote: String(
      raw.classificationConfidenceNote || `Classified into ${safeCategory}.`
    )
      .trim()
      .slice(0, 400),
  };
}

export async function runClassificationAgent(params: {
  title: string;
  description: string;
  ward: string;
  locationText: string;
  userSelectedCategory: string;
  intake: IntakeOutput;
  recentComplaints?: RecentComplaintContext[];
}): Promise<{ output: ClassificationOutput; trace: AgentTrace }> {
  const start = Date.now();
  const ai = getGeminiClient();
  const recent = (params.recentComplaints || []).slice(0, 20);

  const recentText =
    recent.length > 0
      ? recent
          .map(
            (c) =>
              `- ${c.complaintCode}: "${c.title}" | Ward: ${c.ward} | Category: ${c.category} | Status: ${c.status}`
          )
          .join('\n')
      : 'None available in current session.';

  const prompt = `Classify the complaint below using Agent 1 Intake output and check for potential duplicates:

Agent 1 Intake Structured Output:
- Issue: ${params.intake.issue}
- Location: ${params.intake.location}
- Duration: ${params.intake.duration}
- Evidence: ${params.intake.evidence}
- Summary: ${params.intake.normalizedSummary}
- Visual Observation: ${params.intake.visualObservation}

Original Metadata:
- Title: ${params.title}
- Ward: ${params.ward}
- Citizen Selected Category: ${params.userSelectedCategory}

Recent Existing Complaints for Duplicate Check:
${recentText}`;

  const response = await callGeminiWithGuard('Complaint Classification Agent', () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: CLASSIFICATION_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiCategory: {
              type: Type.STRING,
              enum: [...COMPLAINT_CATEGORIES],
            },
            subIssueType: { type: Type.STRING },
            recurringSignature: { type: Type.STRING },
            isPotentialDuplicate: { type: Type.BOOLEAN },
            potentialDuplicates: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            classificationConfidenceNote: { type: Type.STRING },
          },
          required: [
            'aiCategory',
            'subIssueType',
            'recurringSignature',
            'isPotentialDuplicate',
            'potentialDuplicates',
            'classificationConfidenceNote',
          ],
        },
      },
    })
  );

  const raw = safeParseJsonObject(response.text, 'Complaint Classification Agent');
  const output = validateClassificationOutput(raw, recent);

  return {
    output,
    trace: {
      agentName: 'Complaint Classification Agent',
      action: 'Category, subcategory & duplicate detection',
      status: output.isPotentialDuplicate ? 'Warning' : 'Completed',
      latencyMs: Date.now() - start,
      inputSummary: `Issue: ${params.intake.issue} | Recent checked: ${recent.length}`.slice(0, 500),
      summary: `Classified as ${output.aiCategory} (${output.subIssueType}).${
        output.isPotentialDuplicate
          ? ` Potential duplicate of: ${output.potentialDuplicates.join(', ')}.`
          : ' No active duplicates detected.'
      }`.slice(0, 950),
      outputData: { ...output },
    },
  };
}
