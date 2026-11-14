import { GoogleGenAI } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export const GEMINI_MODEL = 'gemini-4-hydrogen';

export const COMPLAINT_CATEGORIES = [
  'Road maintenance',
  'Sanitation',
  'Street lighting',
  'Water supply',
  'Drainage',
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];
export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface DepartmentContext {
  id: string;
  name: string;
  code: string;
  category: string;
  serviceArea?: string;
  slaHours: number;
  headOfficerName: string;
}

export interface RecentComplaintContext {
  id: string;
  complaintCode: string;
  title: string;
  ward: string;
  category: string;
  status: string;
  recurringSignature?: string;
}

export interface AgentTrace {
  agentName:
    | 'Central Orchestrator'
    | 'Complaint Intake Agent'
    | 'Complaint Classification Agent'
    | 'Priority Assessment Agent'
    | 'Department Routing Agent'
    | 'Resolution Recommendation Agent'
    | 'Monitoring and Escalation Agent';
  action: string;
  status: 'Completed' | 'Warning' | 'Escalated' | 'Failed';
  latencyMs: number;
  summary: string;
  inputSummary?: string;
  outputData: Record<string, unknown>;
}

const MAX_RETRIES_PER_AGENT = 1;
const AGENT_TIMEOUT_MS = 60000;

function isNonRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('GEMINI_API_KEY is not configured') ||
    msg.includes('400') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('404')
  );
}

export async function callGeminiWithGuard<T>(
  agentName: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES_PER_AGENT; attempt += 1) {
    const attemptStart = Date.now();
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${agentName} timed out after ${AGENT_TIMEOUT_MS}ms`)),
            AGENT_TIMEOUT_MS
          )
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      const elapsed = Date.now() - attemptStart;
      console.warn(`[${agentName}] attempt ${attempt + 1} failed after ${elapsed}ms:`, err instanceof Error ? err.message : err);
      if (isNonRetryableError(err) || attempt >= MAX_RETRIES_PER_AGENT) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function safeParseJsonObject(rawText: string | undefined, agentName: string): Record<string, unknown> {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) {
    throw new Error(`${agentName} returned an empty JSON response.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${agentName} returned malformed JSON output.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${agentName} response must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}
