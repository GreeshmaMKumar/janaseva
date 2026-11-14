import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'citizen' | 'officer' | 'admin';

export type PortalView = 'citizen' | 'officer' | 'admin';

export type ComplaintCategory =
  | 'Road maintenance'
  | 'Sanitation'
  | 'Street lighting'
  | 'Water supply'
  | 'Drainage';

export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type ComplaintStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Info Requested'
  | 'Escalated'
  | 'Resolved'
  | 'Closed';

export type AgentName =
  | 'Central Orchestrator'
  | 'Complaint Intake Agent'
  | 'Complaint Classification Agent'
  | 'Priority Assessment Agent'
  | 'Department Routing Agent'
  | 'Resolution Recommendation Agent'
  | 'Monitoring and Escalation Agent';

export interface UserProfile {
  uid: string;
  name?: string;
  fullName: string;
  email: string;
  phone?: string;
  ward?: string;
  city?: string;
  role: UserRole;
  departmentId?: string;
  photoURL?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Department {
  id: string;
  departmentId?: string;
  name: string;
  departmentName?: string;
  code: string;
  category: ComplaintCategory;
  serviceArea?: string;
  headOfficerName: string;
  headOfficerUid?: string;
  contactEmail?: string;
  slaHours: number;
  activeOfficers?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AuditTrailEntry {
  timestampIso: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  note: string;
}

export interface Complaint {
  id: string;
  complaintId?: string;
  complaintCode: string;
  citizenUid: string;
  citizenId?: string;
  citizenName: string;
  title: string;
  description: string;
  locationText: string;
  location?: string;
  ward: string;
  category: ComplaintCategory;
  aiCategory: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  departmentId: string;
  department?: string;
  departmentName: string;
  departmentApproved: boolean;
  departmentHeadUid?: string;
  assignedOfficerUid?: string;
  assignedOfficerName?: string;
  evidenceUrl?: string;
  resolutionEvidenceUrl?: string;
  photoDataUrl?: string;
  resolutionPhotoDataUrl?: string;
  resolutionNotes?: string;
  infoRequestMessage?: string;
  citizenClarification?: string;
  escalationReason?: string;
  aiSummary?: string;
  aiIntakeValid?: boolean;
  aiSubIssueType?: string;
  aiPotentialDuplicates?: string[];
  aiPriorityReason?: string;
  aiRoutingReason?: string;
  aiResolutionSteps?: string[];
  aiEstimatedHours?: number;
  aiReminderSchedule?: string;
  aiExecutionSummary?: string;
  recurringSignature?: string;
  slaDueAt: string;
  auditTrail?: AuditTrailEntry[];
  feedbackSubmitted: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AgentLogRecord {
  id: string;
  complaintId: string;
  complaintCode: string;
  actorUid: string;
  agentName: AgentName;
  action: string;
  status: 'Completed' | 'Warning' | 'Escalated' | 'Failed';
  latencyMs: number;
  summary: string;
  input?: string;
  output?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  timestamp?: Timestamp;
  createdAt?: Timestamp;
}

export interface FeedbackRecord {
  id: string;
  complaintId: string;
  complaintCode: string;
  citizenUid: string;
  citizenId?: string;
  departmentId: string;
  rating: number;
  comment?: string;
  comments?: string;
  resolvedSatisfactorily: boolean;
  createdAt?: Timestamp;
}

export interface AuditLogRecord {
  id: string;
  entityType: 'complaint' | 'department' | 'user' | 'agent';
  entityId: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  details: string;
  createdAt?: Timestamp;
}

export interface OrchestratedPlanResponse {
  intakeValid: boolean;
  intakeDetails?: {
    issue: string;
    location: string;
    duration: string;
    affectedPeople: string;
    evidence: string;
  };
  aiSummary: string;
  visualObservation: string;
  aiCategory: ComplaintCategory;
  subIssueType: string;
  recurringSignature: string;
  isPotentialDuplicate?: boolean;
  potentialDuplicates?: string[];
  priority: ComplaintPriority;
  aiPriorityReason: string;
  departmentId: string;
  departmentName: string;
  aiRoutingReason: string;
  aiResolutionSteps: string[];
  aiEstimatedHours: number;
  requiredResources: string;
  knowledgeBaseCode?: string;
  slaDueAt: string;
  requiresImmediateEscalation: boolean;
  escalationWatchNote: string;
  reminderSchedule?: string;
  slaCheckStatus?: 'Nominal' | 'Watch' | 'Immediate Escalation';
  requiresOfficerApproval?: boolean;
  autoCloseAllowed?: boolean;
  executionSummary?: {
    totalAgentsPlanned: number;
    executedCount: number;
    completedCount: number;
    warningCount: number;
    escalatedCount: number;
    failedCount: number;
    overallStatus: 'Completed' | 'Warning' | 'Escalated' | 'Partial Failure';
  };
  traces: Array<{
    agentName: AgentName;
    action: string;
    status: 'Completed' | 'Warning' | 'Escalated' | 'Failed';
    latencyMs: number;
    inputSummary?: string;
    summary: string;
    outputData: Record<string, unknown>;
  }>;
  totalLatencyMs: number;
}

export interface MonitoringAnalysisResponse {
  analysis: {
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
  };
  trace: {
    agentName: AgentName;
    action: string;
    status: 'Completed' | 'Warning' | 'Escalated' | 'Failed';
    latencyMs: number;
    summary: string;
    outputData: Record<string, unknown>;
  };
}
