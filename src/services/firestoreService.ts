import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { BOOTSTRAPPED_ADMIN_EMAIL, DEFAULT_DEPARTMENTS } from '../constants/civicData';
import { uploadComplaintEvidenceToStorage } from './storageService';
import type {
  AgentLogRecord,
  AuditLogRecord,
  AuditTrailEntry,
  Complaint,
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
  Department,
  FeedbackRecord,
  OrchestratedPlanResponse,
  UserProfile,
  UserRole,
} from '../types/domain';

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function assertAuthenticatedUser(expectedUid?: string): string {
  const current = auth.currentUser;
  if (!current) {
    const msg = 'No authenticated Firebase user session is active. Please sign in before writing to Firestore.';
    console.error('[JANASEVA Firestore]', msg);
    throw new Error(msg);
  }
  if (expectedUid && current.uid !== expectedUid) {
    const msg = `Authenticated UID mismatch (${current.uid} !== ${expectedUid}).`;
    console.error('[JANASEVA Firestore]', msg);
    throw new Error(msg);
  }
  return current.uid;
}

export function getFirebaseRuntimeConfig() {
  return {
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    authDomain: firebaseConfig.authDomain,
  };
}

export async function runAdminDiagnosticsTest(actor: UserProfile): Promise<{
  diagId: string;
  projectId: string;
  databaseId: string;
  latencyMs: number;
  readBackData: Record<string, unknown>;
}> {
  assertAuthenticatedUser(actor.uid);
  const diagId = sanitizeId(`diag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  const path = `diagnostics/${diagId}`;
  const start = Date.now();
  try {
    await setDoc(doc(db, 'diagnostics', diagId), {
      id: diagId,
      actorUid: actor.uid,
      actorEmail: actor.email.slice(0, 150),
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      message: 'JANASEVA AI administrator authenticated write/read verification.',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('[JANASEVA Diagnostics] Write failed:', error);
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  try {
    const snap = await getDocFromServer(doc(db, 'diagnostics', diagId));
    if (!snap.exists()) {
      throw new Error(`Diagnostic document ${diagId} was written but not found on server read-back.`);
    }
    return {
      diagId,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      latencyMs: Date.now() - start,
      readBackData: snap.data() as Record<string, unknown>,
    };
  } catch (error) {
    console.error('[JANASEVA Diagnostics] Read-back failed:', error);
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function generateComplaintCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `JNS-${year}-${rand}`;
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createOrUpdateUserProfile(params: {
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
  ward?: string;
  city?: string;
  photoURL?: string;
  isNew: boolean;
  roleOverride?: UserRole;
  departmentId?: string;
}): Promise<UserProfile> {
  assertAuthenticatedUser(params.uid);
  const path = `users/${params.uid}`;
  const isBootstrappedAdmin = params.email === BOOTSTRAPPED_ADMIN_EMAIL;
  try {
    const userRef = doc(db, 'users', params.uid);
    const existingSnap = params.isNew ? null : await getDoc(userRef);
    const shouldCreate = params.isNew || !existingSnap?.exists();

    if (shouldCreate) {
      const cleanName = (params.fullName || 'Civic User').trim().slice(0, 100);
      const payload: Record<string, unknown> = {
        uid: params.uid,
        name: cleanName,
        fullName: cleanName,
        email: (params.email || '').trim().slice(0, 150),
        phone: (params.phone || '').trim().slice(0, 20),
        ward: (params.ward || '').trim().slice(0, 80),
        city: (params.city || '').trim().slice(0, 80),
        role: params.roleOverride || (isBootstrappedAdmin ? 'admin' : 'citizen'),
        departmentId: params.departmentId || '',
        photoURL: (params.photoURL || '').slice(0, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, payload);
      console.info(
        `[JANASEVA Firestore] Created user profile ${path} in ${firebaseConfig.projectId} (${firebaseConfig.firestoreDatabaseId}).`
      );
    } else {
      const cleanName = (params.fullName || 'Civic User').trim().slice(0, 100);
      await updateDoc(userRef, {
        name: cleanName,
        fullName: cleanName,
        phone: (params.phone || '').trim().slice(0, 20),
        ward: (params.ward || '').trim().slice(0, 80),
        city: (params.city || '').trim().slice(0, 80),
        updatedAt: serverTimestamp(),
      });
      console.info(`[JANASEVA Firestore] Updated user profile ${path}.`);
    }
    const fresh = await getDocFromServer(userRef);
    return fresh.data() as UserProfile;
  } catch (error) {
    console.error(`[JANASEVA Firestore] createOrUpdateUserProfile failed for ${path}:`, error);
    handleFirestoreError(error, params.isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function syncBootstrappedAdminRole(uid: string): Promise<void> {
  assertAuthenticatedUser(uid);
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      role: 'admin',
      updatedAt: serverTimestamp(),
    });
    console.info(`[JANASEVA Firestore] Synced bootstrapped admin role for ${path}.`);
  } catch (error) {
    console.error(`[JANASEVA Firestore] syncBootstrappedAdminRole failed for ${path}:`, error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminUpdateUserRole(params: {
  targetUid: string;
  role: UserRole;
  departmentId: string;
  actor: UserProfile;
}): Promise<void> {
  assertAuthenticatedUser(params.actor.uid);
  const path = `users/${params.targetUid}`;
  try {
    await updateDoc(doc(db, 'users', params.targetUid), {
      role: params.role,
      departmentId: params.departmentId.slice(0, 64),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      entityType: 'user',
      entityId: params.targetUid,
      actorUid: params.actor.uid,
      actorName: params.actor.fullName,
      actorRole: params.actor.role,
      action: 'Updated user role assignment',
      details: `Assigned role "${params.role}"${params.departmentId ? ` and department ${params.departmentId}` : ''} to user ${params.targetUid}.`,
    });
  } catch (error) {
    console.error(`[JANASEVA Firestore] adminUpdateUserRole failed for ${path}:`, error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function ensureDefaultDepartments(adminUid: string): Promise<number> {
  assertAuthenticatedUser(adminUid);
  const path = 'departments';
  try {
    const existingSnap = await getDocs(collection(db, path));
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));
    const missing = DEFAULT_DEPARTMENTS.filter((d) => !existingIds.has(d.id));
    if (missing.length === 0) return existingSnap.size;

    const batch = writeBatch(db);
    for (const dept of missing) {
      batch.set(doc(db, 'departments', dept.id), {
        ...dept,
        departmentId: dept.id,
        departmentName: dept.name,
        headOfficerUid: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    console.info(`[JANASEVA Firestore] Seeded ${missing.length} municipal departments in ${firebaseConfig.projectId} (${firebaseConfig.firestoreDatabaseId}).`);
    return existingSnap.size + missing.length;
  } catch (error) {
    console.error('[JANASEVA Firestore] ensureDefaultDepartments failed:', error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateDepartmentConfig(params: {
  departmentId: string;
  headOfficerName: string;
  slaHours: number;
  activeOfficers: number;
  actor: UserProfile;
}): Promise<void> {
  assertAuthenticatedUser(params.actor.uid);
  const path = `departments/${params.departmentId}`;
  try {
    await updateDoc(doc(db, 'departments', params.departmentId), {
      headOfficerName: params.headOfficerName.trim().slice(0, 100),
      slaHours: Math.max(1, Math.min(720, Math.round(params.slaHours))),
      activeOfficers: Math.max(0, Math.min(1000, Math.round(params.activeOfficers))),
      updatedAt: serverTimestamp(),
    });
    await writeAuditLog({
      entityType: 'department',
      entityId: params.departmentId,
      actorUid: params.actor.uid,
      actorName: params.actor.fullName,
      actorRole: params.actor.role,
      action: 'Updated department SLA & leadership',
      details: `Updated head officer to ${params.headOfficerName}, SLA ${params.slaHours}h, active officers ${params.activeOfficers}.`,
    });
  } catch (error) {
    console.error(`[JANASEVA Firestore] updateDepartmentConfig failed for ${path}:`, error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeDepartments(
  onData: (departments: Department[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'departments';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Department);
      items.sort((a, b) => a.name.localeCompare(b.name));
      onData(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeComplaints(
  user: UserProfile,
  isAdminUser: boolean,
  onData: (complaints: Complaint[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'complaints';
  const colRef = collection(db, path);
  const q = isAdminUser
    ? query(colRef, orderBy('createdAt', 'desc'))
    : user.role === 'officer'
      ? user.departmentId
        ? query(colRef, where('departmentId', '==', user.departmentId))
        : query(colRef, where('departmentHeadUid', '==', user.uid))
      : query(colRef, where('citizenUid', '==', user.uid));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Complaint);
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeAgentLogs(
  user: UserProfile,
  isBootstrappedAdmin: boolean,
  onData: (logs: AgentLogRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'agent_logs';
  const colRef = collection(db, path);
  const canListAll = isBootstrappedAdmin || user.role === 'admin' || user.role === 'officer';
  const q = canListAll
    ? query(colRef, orderBy('createdAt', 'desc'))
    : query(colRef, where('actorUid', '==', user.uid));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AgentLogRecord);
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeFeedback(
  user: UserProfile,
  isBootstrappedAdmin: boolean,
  onData: (feedback: FeedbackRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'feedback';
  const colRef = collection(db, path);
  const q = isBootstrappedAdmin
    ? query(colRef, orderBy('createdAt', 'desc'))
    : query(colRef, where('citizenUid', '==', user.uid));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FeedbackRecord);
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeAuditLogs(
  user: UserProfile,
  isBootstrappedAdmin: boolean,
  onData: (logs: AuditLogRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'audit_logs';
  const colRef = collection(db, path);
  const q = isBootstrappedAdmin
    ? query(colRef, orderBy('createdAt', 'desc'))
    : query(colRef, where('actorUid', '==', user.uid));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLogRecord);
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      onData(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeAllUsers(
  onData: (users: UserProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'users';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const users = snap.docs.map((d) => d.data() as UserProfile);
      onData(users);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export interface InitialComplaintRecord {
  complaintId: string;
  complaintCode: string;
  auditTrail: AuditTrailEntry[];
  complaintPayload: {
    complaintId: string;
    complaintCode: string;
    citizenUid: string;
    citizenName: string;
    title: string;
    description: string;
    locationText: string;
    ward: string;
    category: ComplaintCategory;
    photoDataUrl?: string;
    auditTrail: AuditTrailEntry[];
  };
}

export async function createInitialComplaintInFirestore(params: {
  citizen: UserProfile;
  title: string;
  description: string;
  locationText: string;
  ward: string;
  userSelectedCategory: ComplaintCategory;
  photoDataUrl?: string;
  departments: Department[];
}): Promise<InitialComplaintRecord> {
  assertAuthenticatedUser(params.citizen.uid);
  if (params.departments.length === 0) {
    throw new Error('Municipal department directory is empty. Please contact an administrator.');
  }

  const complaintId = sanitizeId(`cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const complaintCode = generateComplaintCode();
  const initialDept =
    params.departments.find((d) => d.category === params.userSelectedCategory) ||
    params.departments[0];

  let evidenceUrl = '';
  let persistedPhotoDataUrl = '';
  if (params.photoDataUrl) {
    const uploadResult = await uploadComplaintEvidenceToStorage({
      citizenUid: params.citizen.uid,
      complaintId,
      dataUrl: params.photoDataUrl,
      kind: 'evidence',
    });
    evidenceUrl = uploadResult.evidenceUrl;
    persistedPhotoDataUrl = uploadResult.evidenceUrl
      ? uploadResult.evidenceUrl
      : uploadResult.usedFallbackInline
        ? params.photoDataUrl.slice(0, 180000)
        : '';
  }

  const initialAuditEntry: AuditTrailEntry = {
    timestampIso: new Date().toISOString(),
    actorUid: params.citizen.uid,
    actorName: params.citizen.fullName,
    actorRole: params.citizen.role,
    action: 'Complaint submitted by citizen',
    note: `Registered grievance ${complaintCode} in ${params.ward}. Queued for 6-agent AI triage.`,
  };

  const fullLocation = `${params.locationText.trim()} (${params.ward.trim()})`.slice(0, 350);
  const initialSlaHours = Math.max(1, Math.min(720, Math.round(initialDept.slaHours || 48)));
  const initialSlaDueAt = new Date(Date.now() + initialSlaHours * 3600 * 1000).toISOString();

  const firestoreDoc: Record<string, unknown> = {
    complaintId,
    complaintCode,
    citizenUid: params.citizen.uid,
    citizenId: params.citizen.uid,
    citizenName: params.citizen.fullName.slice(0, 100),
    title: params.title.trim().slice(0, 160),
    description: params.description.trim().slice(0, 4000),
    locationText: params.locationText.trim().slice(0, 300),
    location: fullLocation,
    ward: params.ward.trim().slice(0, 100),
    category: params.userSelectedCategory,
    aiCategory: params.userSelectedCategory,
    priority: 'Medium',
    status: 'Submitted',
    departmentId: initialDept.id,
    department: initialDept.name.slice(0, 120),
    departmentName: initialDept.name.slice(0, 120),
    departmentApproved: false,
    departmentHeadUid: (initialDept.headOfficerUid || '').slice(0, 128),
    assignedOfficerUid: '',
    assignedOfficerName: initialDept.headOfficerName.slice(0, 100),
    evidenceUrl: evidenceUrl.slice(0, 1000),
    resolutionEvidenceUrl: '',
    photoDataUrl: persistedPhotoDataUrl.slice(0, 180000),
    resolutionPhotoDataUrl: '',
    resolutionNotes: '',
    infoRequestMessage: '',
    citizenClarification: '',
    escalationReason: '',
    aiSummary: '',
    aiIntakeValid: true,
    aiSubIssueType: 'Pending AI classification',
    aiPotentialDuplicates: [],
    aiPriorityReason: 'Pending 6-agent AI priority evaluation.',
    aiRoutingReason: 'Initial department matched from citizen category selection; awaiting AI routing.',
    aiResolutionSteps: [],
    aiEstimatedHours: initialSlaHours,
    aiReminderSchedule: '',
    aiExecutionSummary: 'Submitted · Queued for 6-agent AI triage',
    recurringSignature: '',
    slaDueAt: initialSlaDueAt,
    auditTrail: [initialAuditEntry],
    feedbackSubmitted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'complaints', complaintId), firestoreDoc);
    await writeAuditLog({
      entityType: 'complaint',
      entityId: complaintId,
      actorUid: params.citizen.uid,
      actorName: params.citizen.fullName.slice(0, 100),
      actorRole: params.citizen.role,
      action: 'Complaint submitted',
      details: `Filed ${complaintCode} in ${params.ward} (status: Submitted).`,
    });
    console.info(`[JANASEVA Firestore] Saved initial complaint ${complaintId} (${complaintCode}).`);
  } catch (error) {
    console.error('[JANASEVA Firestore] Initial complaint save failed:', error);
    handleFirestoreError(error, OperationType.CREATE, `complaints/${complaintId}`);
  }

  return {
    complaintId,
    complaintCode,
    auditTrail: [initialAuditEntry],
    complaintPayload: {
      complaintId,
      complaintCode,
      citizenUid: params.citizen.uid,
      citizenName: params.citizen.fullName.slice(0, 100),
      title: params.title.trim().slice(0, 160),
      description: params.description.trim().slice(0, 4000),
      locationText: params.locationText.trim().slice(0, 300),
      ward: params.ward.trim().slice(0, 100),
      category: params.userSelectedCategory,
      photoDataUrl: params.photoDataUrl || undefined,
      auditTrail: [initialAuditEntry],
    },
  };
}

export async function applyOrchestrationResultToComplaint(params: {
  complaintId: string;
  complaintCode: string;
  citizen: UserProfile;
  title: string;
  ward: string;
  userSelectedCategory: ComplaintCategory;
  departments: Department[];
  aiPlan: OrchestratedPlanResponse;
  existingAuditTrail?: AuditTrailEntry[];
}): Promise<void> {
  assertAuthenticatedUser(params.citizen.uid);
  const path = `complaints/${params.complaintId}`;
  const matchedDept =
    params.departments.find((d) => d.id === params.aiPlan.departmentId) || params.departments[0];
  if (!matchedDept) {
    throw new Error('Matched municipal department not found in directory.');
  }

  let baseTrail = params.existingAuditTrail;
  if (!baseTrail) {
    try {
      const existingSnap = await getDoc(doc(db, 'complaints', params.complaintId));
      const existingData = existingSnap.data() as Partial<Complaint> | undefined;
      baseTrail = existingData?.auditTrail || [];
    } catch {
      baseTrail = [];
    }
  }

  const aiAuditEntry: AuditTrailEntry = {
    timestampIso: new Date().toISOString(),
    actorUid: params.citizen.uid,
    actorName: params.citizen.fullName,
    actorRole: params.citizen.role,
    action: 'AI 6-agent triage completed (awaiting officer approval)',
    note: `Central Orchestrator classified as ${params.aiPlan.aiCategory} (${params.aiPlan.priority}) and recommended ${matchedDept.name}.`,
  };
  const updatedTrail = [...(baseTrail || []).slice(-28), aiAuditEntry];

  const safeResolutionSteps = (params.aiPlan.aiResolutionSteps || [])
    .map((s) => String(s).trim().slice(0, 290))
    .filter(Boolean)
    .slice(0, 10);

  const safeDuplicates = (params.aiPlan.potentialDuplicates || [])
    .map((d) => String(d).trim().slice(0, 32))
    .filter(Boolean)
    .slice(0, 5);

  const safeEstimatedHours = Math.max(
    1,
    Math.min(720, Math.round(Number(params.aiPlan.aiEstimatedHours) || matchedDept.slaHours || 24))
  );

  const aiExecutionSummary = params.aiPlan.executionSummary
    ? `${params.aiPlan.executionSummary.overallStatus}: ${params.aiPlan.executionSummary.completedCount}/${params.aiPlan.executionSummary.totalAgentsPlanned} completed, ${params.aiPlan.executionSummary.failedCount} failed (${params.aiPlan.totalLatencyMs}ms)`.slice(
        0,
        240
      )
    : `Completed (${params.aiPlan.totalLatencyMs}ms)`;

  try {
    await updateDoc(doc(db, 'complaints', params.complaintId), {
      category: params.aiPlan.aiCategory,
      aiCategory: params.aiPlan.aiCategory,
      priority: params.aiPlan.priority,
      status: 'Under Review',
      departmentId: matchedDept.id,
      department: matchedDept.name.slice(0, 120),
      departmentName: matchedDept.name.slice(0, 120),
      departmentHeadUid: (matchedDept.headOfficerUid || '').slice(0, 128),
      assignedOfficerName: matchedDept.headOfficerName.slice(0, 100),
      escalationReason: params.aiPlan.requiresImmediateEscalation
        ? params.aiPlan.escalationWatchNote.slice(0, 1000)
        : '',
      aiSummary: (params.aiPlan.aiSummary || 'AI intake summary generated.').slice(0, 2000),
      aiIntakeValid: Boolean(params.aiPlan.intakeValid),
      aiSubIssueType: (params.aiPlan.subIssueType || '').slice(0, 120),
      aiPotentialDuplicates: safeDuplicates,
      aiPriorityReason: (params.aiPlan.aiPriorityReason || '').slice(0, 1000),
      aiRoutingReason: (params.aiPlan.aiRoutingReason || '').slice(0, 1000),
      aiResolutionSteps: safeResolutionSteps,
      aiEstimatedHours: safeEstimatedHours,
      aiReminderSchedule: (params.aiPlan.reminderSchedule || '').slice(0, 300),
      aiExecutionSummary,
      recurringSignature: (params.aiPlan.recurringSignature || '').slice(0, 120),
      slaDueAt: (params.aiPlan.slaDueAt || new Date().toISOString()).slice(0, 64),
      auditTrail: updatedTrail,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`[JANASEVA Firestore] applyOrchestrationResultToComplaint failed for ${path}:`, error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  // Persist all 7 agent execution traces (Central Orchestrator + 6 Specialized Agents)
  try {
    const batch = writeBatch(db);
    const agentInputSummary = `${params.title.trim()} | ${params.userSelectedCategory} | ${params.ward}`.slice(0, 500);
    params.aiPlan.traces.forEach((trace, idx) => {
      const logId = sanitizeId(`agl_${params.complaintId}_${idx}_${Date.now()}`);
      batch.set(doc(db, 'agent_logs', logId), {
        complaintId: params.complaintId,
        complaintCode: params.complaintCode,
        actorUid: params.citizen.uid,
        agentName: trace.agentName,
        action: trace.action.slice(0, 120),
        input: (trace.inputSummary || agentInputSummary).slice(0, 500),
        output: trace.outputData || { summary: trace.summary.slice(0, 500) },
        status: trace.status,
        latencyMs: Math.max(0, Math.round(trace.latencyMs)),
        summary: trace.summary.slice(0, 1000),
        outputData: trace.outputData || {},
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    });

    const auditId = sanitizeId(`aud_${params.complaintId}_ai_${Date.now()}`);
    batch.set(doc(db, 'audit_logs', auditId), {
      entityType: 'complaint',
      entityId: params.complaintId,
      actorUid: params.citizen.uid,
      actorName: params.citizen.fullName.slice(0, 100),
      actorRole: params.citizen.role,
      action: 'AI 6-agent orchestration persisted',
      details: `${params.complaintCode} triaged as ${params.aiPlan.aiCategory} (${params.aiPlan.priority}) -> ${matchedDept.name}.`,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.error(`[JANASEVA Firestore] Failed persisting agent_logs for ${params.complaintCode}:`, error);
    handleFirestoreError(error, OperationType.WRITE, 'agent_logs');
  }
}

export async function createComplaintWithOrchestration(params: {
  citizen: UserProfile;
  title: string;
  description: string;
  locationText: string;
  ward: string;
  userSelectedCategory: ComplaintCategory;
  photoDataUrl?: string;
  department: Department;
  aiPlan: OrchestratedPlanResponse;
}): Promise<{ complaintId: string; complaintCode: string }> {
  const initial = await createInitialComplaintInFirestore({
    citizen: params.citizen,
    title: params.title,
    description: params.description,
    locationText: params.locationText,
    ward: params.ward,
    userSelectedCategory: params.userSelectedCategory,
    photoDataUrl: params.photoDataUrl,
    departments: [params.department],
  });

  await applyOrchestrationResultToComplaint({
    complaintId: initial.complaintId,
    complaintCode: initial.complaintCode,
    citizen: params.citizen,
    title: params.title,
    ward: params.ward,
    userSelectedCategory: params.userSelectedCategory,
    departments: [params.department],
    aiPlan: params.aiPlan,
    existingAuditTrail: initial.auditTrail,
  });

  return { complaintId: initial.complaintId, complaintCode: initial.complaintCode };
}

export async function officerUpdateComplaint(params: {
  complaint: Complaint;
  officer: UserProfile;
  updates: {
    departmentId?: string;
    department?: string;
    departmentName?: string;
    departmentApproved?: boolean;
    departmentHeadUid?: string;
    assignedOfficerUid?: string;
    assignedOfficerName?: string;
    status?: ComplaintStatus;
    priority?: ComplaintPriority;
    resolutionEvidenceUrl?: string;
    resolutionPhotoDataUrl?: string;
    resolutionNotes?: string;
    infoRequestMessage?: string;
    escalationReason?: string;
  };
  auditAction: string;
  auditNote: string;
}): Promise<void> {
  assertAuthenticatedUser(params.officer.uid);
  const path = `complaints/${params.complaint.id}`;

  const preparedUpdates: Record<string, unknown> = { ...params.updates };
  if (preparedUpdates.departmentName && !preparedUpdates.department) {
    preparedUpdates.department = String(preparedUpdates.departmentName).slice(0, 120);
  }

  if (
    typeof params.updates.resolutionPhotoDataUrl === 'string' &&
    params.updates.resolutionPhotoDataUrl.startsWith('data:')
  ) {
    const uploadResult = await uploadComplaintEvidenceToStorage({
      citizenUid: params.complaint.citizenUid,
      complaintId: params.complaint.id,
      dataUrl: params.updates.resolutionPhotoDataUrl,
      kind: 'resolution',
    });
    if (uploadResult.evidenceUrl) {
      preparedUpdates.resolutionEvidenceUrl = uploadResult.evidenceUrl.slice(0, 1000);
      preparedUpdates.resolutionPhotoDataUrl = uploadResult.evidenceUrl.slice(0, 180000);
    } else if (uploadResult.usedFallbackInline) {
      preparedUpdates.resolutionEvidenceUrl = '';
      preparedUpdates.resolutionPhotoDataUrl = params.updates.resolutionPhotoDataUrl.slice(0, 180000);
    }
  }

  const newEntry: AuditTrailEntry = {
    timestampIso: new Date().toISOString(),
    actorUid: params.officer.uid,
    actorName: params.officer.fullName,
    actorRole: params.officer.role,
    action: params.auditAction,
    note: params.auditNote,
  };
  const updatedTrail = [...(params.complaint.auditTrail || []).slice(-28), newEntry];

  try {
    await updateDoc(doc(db, 'complaints', params.complaint.id), {
      ...preparedUpdates,
      auditTrail: updatedTrail,
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      entityType: 'complaint',
      entityId: params.complaint.id,
      actorUid: params.officer.uid,
      actorName: params.officer.fullName,
      actorRole: params.officer.role,
      action: params.auditAction,
      details: `${params.complaint.complaintCode}: ${params.auditNote}`,
    });
  } catch (error) {
    console.error(`[JANASEVA Firestore] officerUpdateComplaint failed for ${path}:`, error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function withdrawCitizenComplaint(params: {
  complaint: Complaint;
  citizen: UserProfile;
}): Promise<void> {
  assertAuthenticatedUser(params.citizen.uid);
  const path = `complaints/${params.complaint.id}`;
  try {
    await deleteDoc(doc(db, 'complaints', params.complaint.id));
    await writeAuditLog({
      entityType: 'complaint',
      entityId: params.complaint.id,
      actorUid: params.citizen.uid,
      actorName: params.citizen.fullName,
      actorRole: params.citizen.role,
      action: 'Complaint withdrawn by citizen',
      details: `Withdrew unapproved complaint ${params.complaint.complaintCode}.`,
    });
  } catch (error) {
    console.error(`[JANASEVA Firestore] withdrawCitizenComplaint failed for ${path}:`, error);
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function citizenReplyToInfoRequest(params: {
  complaint: Complaint;
  citizen: UserProfile;
  clarification: string;
}): Promise<void> {
  assertAuthenticatedUser(params.citizen.uid);
  const path = `complaints/${params.complaint.id}`;
  const newEntry: AuditTrailEntry = {
    timestampIso: new Date().toISOString(),
    actorUid: params.citizen.uid,
    actorName: params.citizen.fullName,
    actorRole: params.citizen.role,
    action: 'Citizen provided clarification',
    note: params.clarification.trim().slice(0, 300),
  };
  const updatedTrail = [...(params.complaint.auditTrail || []).slice(-28), newEntry];

  try {
    await updateDoc(doc(db, 'complaints', params.complaint.id), {
      citizenClarification: params.clarification.trim().slice(0, 1500),
      status: 'Under Review',
      auditTrail: updatedTrail,
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog({
      entityType: 'complaint',
      entityId: params.complaint.id,
      actorUid: params.citizen.uid,
      actorName: params.citizen.fullName,
      actorRole: params.citizen.role,
      action: 'Citizen replied to information request',
      details: `${params.complaint.complaintCode}: Clarification submitted; status returned to Under Review.`,
    });
  } catch (error) {
    console.error(`[JANASEVA Firestore] citizenReplyToInfoRequest failed for ${path}:`, error);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitResolutionFeedback(params: {
  complaint: Complaint;
  citizen: UserProfile;
  rating: number;
  comment: string;
  resolvedSatisfactorily: boolean;
}): Promise<void> {
  assertAuthenticatedUser(params.citizen.uid);
  const feedbackId = sanitizeId(`fbk_${params.complaint.id}_${Date.now()}`);
  const newEntry: AuditTrailEntry = {
    timestampIso: new Date().toISOString(),
    actorUid: params.citizen.uid,
    actorName: params.citizen.fullName,
    actorRole: params.citizen.role,
    action: 'Citizen submitted resolution feedback',
    note: `Rated ${params.rating}/5 (${params.resolvedSatisfactorily ? 'Satisfactory' : 'Needs Follow-up'})`,
  };
  const updatedTrail = [...(params.complaint.auditTrail || []).slice(-28), newEntry];

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'feedback', feedbackId), {
      complaintId: params.complaint.id,
      complaintCode: params.complaint.complaintCode,
      citizenUid: params.citizen.uid,
      citizenId: params.citizen.uid,
      departmentId: params.complaint.departmentId,
      rating: Math.max(1, Math.min(5, Math.round(params.rating))),
      comment: params.comment.trim().slice(0, 1500),
      comments: params.comment.trim().slice(0, 1500),
      resolvedSatisfactorily: params.resolvedSatisfactorily,
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'complaints', params.complaint.id), {
      feedbackSubmitted: true,
      status: params.resolvedSatisfactorily ? 'Closed' : 'Resolved',
      auditTrail: updatedTrail,
      updatedAt: serverTimestamp(),
    });

    const auditId = sanitizeId(`aud_${feedbackId}`);
    batch.set(doc(db, 'audit_logs', auditId), {
      entityType: 'complaint',
      entityId: params.complaint.id,
      actorUid: params.citizen.uid,
      actorName: params.citizen.fullName.slice(0, 100),
      actorRole: params.citizen.role,
      action: 'Resolution feedback recorded',
      details: `${params.complaint.complaintCode}: Citizen rated ${params.rating}/5.`,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.error(`[JANASEVA Firestore] submitResolutionFeedback failed for feedback/${feedbackId}:`, error);
    handleFirestoreError(error, OperationType.WRITE, `feedback/${feedbackId}`);
  }
}

export async function logMonitoringAgentRun(params: {
  complaintId: string;
  complaintCode: string;
  actorUid: string;
  trace: {
    agentName: string;
    action: string;
    status: string;
    latencyMs: number;
    summary: string;
    outputData: Record<string, unknown>;
  };
}): Promise<void> {
  assertAuthenticatedUser(params.actorUid);
  const logId = sanitizeId(`mon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  try {
    await setDoc(doc(db, 'agent_logs', logId), {
      complaintId: params.complaintId,
      complaintCode: params.complaintCode,
      actorUid: params.actorUid,
      agentName: params.trace.agentName,
      action: params.trace.action.slice(0, 120),
      input: `Monitoring scan on ${params.complaintCode}`.slice(0, 500),
      output: params.trace.outputData || {},
      status: params.trace.status,
      latencyMs: Math.max(0, Math.round(params.trace.latencyMs)),
      summary: params.trace.summary.slice(0, 1000),
      outputData: params.trace.outputData || {},
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`[JANASEVA Firestore] logMonitoringAgentRun failed for agent_logs/${logId}:`, error);
    handleFirestoreError(error, OperationType.CREATE, `agent_logs/${logId}`);
  }
}

export async function writeAuditLog(params: {
  entityType: 'complaint' | 'department' | 'user' | 'agent';
  entityId: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  details: string;
}): Promise<void> {
  assertAuthenticatedUser(params.actorUid);
  const auditId = sanitizeId(`aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  try {
    await setDoc(doc(db, 'audit_logs', auditId), {
      entityType: params.entityType,
      entityId: sanitizeId(params.entityId),
      actorUid: sanitizeId(params.actorUid),
      actorName: params.actorName.slice(0, 100),
      actorRole: params.actorRole,
      action: params.action.slice(0, 120),
      details: params.details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(`[JANASEVA Firestore] writeAuditLog failed for audit_logs/${auditId}:`, error);
    handleFirestoreError(error, OperationType.CREATE, `audit_logs/${auditId}`);
  }
}
