import { Type, ThinkingLevel } from '@google/genai';
import {
  callGeminiWithGuard,
  GEMINI_MODEL,
  getGeminiClient,
  safeParseJsonObject,
  type AgentTrace,
} from '../geminiClient.ts';

export interface IntakeInput {
  title: string;
  description: string;
  locationText: string;
  ward: string;
  userSelectedCategory: string;
  photoDataUrl?: string;
}

export interface IntakeOutput {
  intakeValid: boolean;
  issue: string;
  location: string;
  duration: string;
  affectedPeople: string;
  evidence: string;
  normalizedSummary: string;
  visualObservation: string;
  extractedLocationClues: string;
  missingDetailsNote: string;
}

const INTAKE_SYSTEM_INSTRUCTION = `You are AGENT 1 (Complaint Intake Agent) for JANASEVA AI, an Indian municipal government grievance redressal platform.
Your sole responsibility is structured intake extraction from citizen complaints and optional site photographs.
Extract precisely:
- issue: concise statement of the core civic infrastructure defect or failure
- location: exact street, landmark, and ward extracted from the submission
- duration: how long the issue has persisted (or "Not specified by citizen" if omitted)
- affectedPeople: estimated scope of impacted residents, commuters, schools, or households (or "Local street commuters/residents (exact count unspecified)")
- evidence: summary of photographic or textual proof supplied (if image is attached, inspect what is visible; otherwise state textual evidence only)
- intakeValid: boolean indicating whether actionable civic grievance information was provided
- normalizedSummary: 1-2 sentence official administrative summary
- visualObservation: concrete description of photographic evidence, or "No photographic evidence attached"
- extractedLocationClues: landmarks, junctions, poles, or ward details
- missingDetailsNote: concise note if helpful field info is missing, else "None"
Always respond strictly as valid JSON matching the required schema.`;

function parseDataUrl(dataUrl?: string): { mimeType: string; data: string } | null {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(5, commaIdx);
  const mimeType = header.split(';')[0] || 'image/jpeg';
  const data = dataUrl.slice(commaIdx + 1);
  if (!data) return null;
  return { mimeType, data };
}

function validateIntakeOutput(raw: Record<string, unknown>, hasImage: boolean): IntakeOutput {
  const issue = String(raw.issue || '').trim();
  const location = String(raw.location || '').trim();
  const normalizedSummary = String(raw.normalizedSummary || '').trim();
  if (!issue || !normalizedSummary) {
    throw new Error('Complaint Intake Agent output missing required issue or normalizedSummary.');
  }
  return {
    intakeValid: Boolean(raw.intakeValid),
    issue: issue.slice(0, 300),
    location: (location || 'Unspecified location').slice(0, 300),
    duration: String(raw.duration || 'Not specified by citizen').trim().slice(0, 150),
    affectedPeople: String(raw.affectedPeople || 'Local residents and commuters').trim().slice(0, 200),
    evidence: String(
      raw.evidence || (hasImage ? 'Citizen photograph attached' : 'Textual report only')
    )
      .trim()
      .slice(0, 300),
    normalizedSummary: normalizedSummary.slice(0, 950),
    visualObservation: String(
      raw.visualObservation || (hasImage ? 'Site photograph submitted' : 'No photographic evidence attached')
    )
      .trim()
      .slice(0, 400),
    extractedLocationClues: String(raw.extractedLocationClues || location || 'None').trim().slice(0, 300),
    missingDetailsNote: String(raw.missingDetailsNote || 'None').trim().slice(0, 300),
  };
}

export async function runComplaintIntakeAgent(
  input: IntakeInput
): Promise<{ output: IntakeOutput; trace: AgentTrace }> {
  const start = Date.now();
  const ai = getGeminiClient();

  const textPrompt = `Extract structured civic intake fields from this citizen submission:
- Title: ${input.title}
- Ward: ${input.ward}
- Location: ${input.locationText}
- Citizen Selected Category: ${input.userSelectedCategory}
- Description: ${input.description}
- Photograph Attached: ${input.photoDataUrl ? 'Yes (inspect image)' : 'No'}`;

  const imagePart = parseDataUrl(input.photoDataUrl);
  const contents = imagePart
    ? {
        parts: [
          { inlineData: { mimeType: imagePart.mimeType, data: imagePart.data } },
          { text: textPrompt },
        ],
      }
    : textPrompt;

  const response = await callGeminiWithGuard('Complaint Intake Agent', () =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: INTAKE_SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intakeValid: { type: Type.BOOLEAN },
            issue: { type: Type.STRING },
            location: { type: Type.STRING },
            duration: { type: Type.STRING },
            affectedPeople: { type: Type.STRING },
            evidence: { type: Type.STRING },
            normalizedSummary: { type: Type.STRING },
            visualObservation: { type: Type.STRING },
            extractedLocationClues: { type: Type.STRING },
            missingDetailsNote: { type: Type.STRING },
          },
          required: [
            'intakeValid',
            'issue',
            'location',
            'duration',
            'affectedPeople',
            'evidence',
            'normalizedSummary',
            'visualObservation',
            'extractedLocationClues',
            'missingDetailsNote',
          ],
        },
      },
    })
  );

  const raw = safeParseJsonObject(response.text, 'Complaint Intake Agent');
  const output = validateIntakeOutput(raw, Boolean(imagePart));
  const latencyMs = Date.now() - start;

  return {
    output,
    trace: {
      agentName: 'Complaint Intake Agent',
      action: imagePart ? 'Multimodal intake & evidence extraction' : 'Structured text intake extraction',
      status: output.intakeValid ? 'Completed' : 'Warning',
      latencyMs,
      inputSummary: `${input.title} | ${input.ward} | Photo: ${imagePart ? 'Yes' : 'No'}`.slice(0, 500),
      summary: `${output.issue} | Duration: ${output.duration} | Affected: ${output.affectedPeople}`.slice(0, 950),
      outputData: { ...output },
    },
  };
}
