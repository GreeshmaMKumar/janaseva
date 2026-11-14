import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';

let cachedAi = null;

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

async function runAgent(name, instructions, input) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Analyze the following input and return valid JSON only:\n${JSON.stringify(input)}`,
    config: {
      systemInstruction: `You are the ${name} of JANASEVA AI.\n\n${instructions}\n\nReturn valid JSON only.`,
      responseMimeType: 'application/json',
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error(`${name} returned an empty JSON response.`);
  }
  return JSON.parse(rawText);
}

export const intakeAgent = (complaint) =>
  runAgent(
    'Complaint Intake Agent',
    'Extract issue, location, duration, affected people and missing information.',
    complaint
  );

export const classificationAgent = (data) =>
  runAgent(
    'Classification Agent',
    'Classify into Road Maintenance, Sanitation, Street Lighting, Water Supply or Drainage. Identify possible duplicates.',
    data
  );

export const priorityAgent = (data) =>
  runAgent(
    'Priority Agent',
    'Recommend Critical, High, Medium or Low priority based on evidence, public safety, impact and duration. Do not invent facts.',
    data
  );

export const routingAgent = (data) =>
  runAgent(
    'Department Routing Agent',
    'Select a department from the supplied department directory using complaint category and jurisdiction. Flag uncertainty.',
    data
  );

export const resolutionAgent = (data) =>
  runAgent(
    'Resolution Agent',
    'Recommend practical inspection and resolution steps. Do not claim the work has been completed.',
    data
  );

export const monitoringAgent = (data) =>
  runAgent(
    'Monitoring Agent',
    'Evaluate complaint status and deadline. Recommend reminders or escalation when justified. Never close complaints.',
    data
  );
