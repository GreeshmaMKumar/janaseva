import type {
  AgentName,
  Complaint,
  Department,
  MonitoringAnalysisResponse,
  OrchestratedPlanResponse,
} from '../types/domain';

export interface AgentProgressEvent {
  type: 'agent_started' | 'agent_completed';
  stepNumber: number;
  totalSteps: number;
  agentName: AgentName;
  action: string;
  status?: 'Completed' | 'Warning' | 'Escalated' | 'Failed';
  latencyMs?: number;
  summary?: string;
}

export interface ProcessComplaintResponse {
  success: boolean;
  complaintId: string;
  persistedByServer: boolean;
  result: OrchestratedPlanResponse;
}

function serializeDepartments(departments: Department[]) {
  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    category: d.category,
    serviceArea: d.serviceArea || 'All Municipal Wards',
    slaHours: d.slaHours,
    headOfficerName: d.headOfficerName,
    headOfficerUid: d.headOfficerUid || '',
  }));
}

function serializeRecentComplaints(recentComplaints?: Complaint[]) {
  return (recentComplaints || []).slice(0, 20).map((c) => ({
    id: c.id,
    complaintCode: c.complaintCode,
    title: c.title,
    ward: c.ward,
    category: c.category,
    status: c.status,
    recurringSignature: c.recurringSignature,
  }));
}

export async function invokeProcessComplaintEndpoint(payload: {
  complaintId: string;
  complaint: {
    complaintId: string;
    complaintCode: string;
    citizenUid: string;
    citizenName: string;
    title: string;
    description: string;
    locationText: string;
    ward: string;
    category: string;
    photoDataUrl?: string;
    auditTrail?: Complaint['auditTrail'];
  };
  departments: Department[];
  recentComplaints?: Complaint[];
  onProgress?: (event: AgentProgressEvent) => void;
}): Promise<ProcessComplaintResponse> {
  const response = await fetch('/api/process-complaint', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify({
      complaintId: payload.complaintId,
      complaint: payload.complaint,
      departments: serializeDepartments(payload.departments),
      recentComplaints: serializeRecentComplaints(payload.recentComplaints),
      stream: true,
    }),
  });

  const contentType = response.headers.get('content-type') || '';

  if (!response.ok && !contentType.includes('text/event-stream')) {
    let errorMsg = `AI processing request failed (${response.status})`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson?.error) errorMsg = errJson.error;
    } catch {
      // Ignore parse failure and keep HTTP error message
    }
    throw new Error(errorMsg);
  }

  if (contentType.includes('text/event-stream') && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResponse: ProcessComplaintResponse | null = null;

    const processFrame = (rawFrame: string) => {
      const lines = rawFrame.split('\n');
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) return;
      const rawData = dataLines.join('\n');
      const parsed = JSON.parse(rawData) as Record<string, unknown>;

      if (eventName === 'progress') {
        payload.onProgress?.(parsed as unknown as AgentProgressEvent);
      } else if (eventName === 'complete') {
        finalResponse = parsed as unknown as ProcessComplaintResponse;
      } else if (eventName === 'error') {
        throw new Error(
          typeof parsed.error === 'string' && parsed.error
            ? parsed.error
            : 'JANASEVA AI backend failed to process the complaint.'
        );
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        if (frame.trim()) {
          processFrame(frame);
        }
      }
    }

    if (buffer.trim()) {
      processFrame(buffer);
    }

    if (!finalResponse) {
      throw new Error('AI processing stream ended before returning a completed result. Please retry.');
    }
    return finalResponse;
  }

  const data = (await response.json()) as ProcessComplaintResponse & { error?: string };
  if (!response.ok || !data.success) {
    throw new Error(data.error || `AI processing failed (${response.status})`);
  }
  return data;
}

export async function invokeComplaintOrchestrator(payload: {
  title: string;
  description: string;
  locationText: string;
  ward: string;
  userSelectedCategory: string;
  photoDataUrl?: string;
  departments: Department[];
  recentComplaints?: Complaint[];
}): Promise<OrchestratedPlanResponse> {
  const response = await fetch('/api/agents/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      locationText: payload.locationText,
      ward: payload.ward,
      userSelectedCategory: payload.userSelectedCategory,
      photoDataUrl: payload.photoDataUrl,
      departments: serializeDepartments(payload.departments),
      recentComplaints: serializeRecentComplaints(payload.recentComplaints),
    }),
  });

  const data = (await response.json()) as OrchestratedPlanResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `AI orchestration request failed (${response.status})`);
  }
  return data;
}

export async function invokePortfolioMonitoringAgent(
  complaints: Complaint[]
): Promise<MonitoringAnalysisResponse> {
  const response = await fetch('/api/agents/monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      complaints: complaints.map((c) => ({
        id: c.id,
        complaintCode: c.complaintCode,
        category: c.category,
        priority: c.priority,
        status: c.status,
        ward: c.ward,
        departmentName: c.departmentName,
        slaDueAt: c.slaDueAt,
        recurringSignature: c.recurringSignature,
      })),
    }),
  });

  const data = (await response.json()) as MonitoringAnalysisResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Monitoring agent request failed (${response.status})`);
  }
  return data;
}
