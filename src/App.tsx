import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useCivicData } from './hooks/useCivicData';
import { AppShell, type NavTab } from './components/layout/AppShell';
import { AuthScreen } from './components/layout/AuthScreen';
import { CitizenDashboard } from './components/citizen/CitizenDashboard';
import { SubmitComplaintForm } from './components/citizen/SubmitComplaintForm';
import { TrackComplaints } from './components/citizen/TrackComplaints';
import { FeedbackModal } from './components/citizen/FeedbackModal';
import { OfficerDashboard } from './components/officer/OfficerDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { DepartmentRoleControl } from './components/admin/DepartmentRoleControl';
import { RecurringAnalysis } from './components/admin/RecurringAnalysis';
import { AgentLogsView } from './components/admin/AgentLogsView';
import { ComplaintDetailModal } from './components/shared/ComplaintDetailModal';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { invokeProcessComplaintEndpoint } from './services/agentApiService';
import { applyOrchestrationResultToComplaint } from './services/firestoreService';
import type { Complaint, PortalView } from './types/domain';

const CITIZEN_TABS: NavTab[] = [
  { id: 'overview', label: 'Citizen Dashboard', icon: 'dashboard' },
  { id: 'submit', label: 'Submit Complaint', icon: 'submit' },
  { id: 'track', label: 'Track Complaints', icon: 'track' },
];

const OFFICER_TABS: NavTab[] = [
  { id: 'queue', label: 'Assigned Queue', icon: 'queue' },
  { id: 'escalated', label: 'Escalated & SLA', icon: 'recurring' },
  { id: 'departments', label: 'Department Roster', icon: 'departments' },
];

const ADMIN_TABS: NavTab[] = [
  { id: 'overview', label: 'Executive Overview', icon: 'analytics' },
  { id: 'governance', label: 'Departments & Roles', icon: 'departments' },
  { id: 'recurring', label: 'Recurring & AI Monitor', icon: 'recurring' },
  { id: 'logs', label: 'Agent Logs & Audit', icon: 'logs' },
];

function JanasevaWorkspace() {
  const {
    profile,
    authReady,
    needsRegistration,
    isBootstrappedAdmin,
    activePortal,
    setActivePortal,
    authError,
    clearAuthError,
    retryDepartmentInit,
    signOut,
  } = useAuth();

  const {
    departments,
    complaints,
    agentLogs,
    feedbackList,
    auditLogs,
    users,
    loading,
    dataError,
  } = useCivicData(profile, isBootstrappedAdmin);

  const [citizenTab, setCitizenTab] = useState<'overview' | 'submit' | 'track'>('overview');
  const [officerTab, setOfficerTab] = useState<'queue' | 'escalated' | 'departments'>('queue');
  const [adminTab, setAdminTab] = useState<'overview' | 'governance' | 'recurring' | 'logs'>(
    'overview'
  );

  const [inspectedComplaintId, setInspectedComplaintId] = useState<string | null>(null);
  const [feedbackComplaintId, setFeedbackComplaintId] = useState<string | null>(null);
  const [trackedComplaintCode, setTrackedComplaintCode] = useState<string | null>(null);

  const inspectedComplaint = useMemo(
    () => complaints.find((c) => c.id === inspectedComplaintId) || null,
    [complaints, inspectedComplaintId]
  );

  const feedbackComplaint = useMemo(
    () => complaints.find((c) => c.id === feedbackComplaintId) || null,
    [complaints, feedbackComplaintId]
  );

  if (!authReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-navy-900">
        <Loader2 className="h-7 w-7 animate-spin text-teal-700" />
        <p className="mt-3 font-display text-sm font-semibold">
          Connecting to JANASEVA AI Civic Grid...
        </p>
      </div>
    );
  }

  if (!profile || needsRegistration) {
    return <AuthScreen />;
  }

  const handlePortalChange = (nextPortal: PortalView) => {
    setActivePortal(nextPortal);
  };

  const navTabs =
    activePortal === 'citizen'
      ? CITIZEN_TABS
      : activePortal === 'officer'
        ? OFFICER_TABS
        : ADMIN_TABS;

  const activeTab =
    activePortal === 'citizen'
      ? citizenTab
      : activePortal === 'officer'
        ? officerTab
        : adminTab;

  const handleTabChange = (tabId: string) => {
    if (activePortal === 'citizen') {
      setCitizenTab(tabId as 'overview' | 'submit' | 'track');
    } else if (activePortal === 'officer') {
      setOfficerTab(tabId as 'queue' | 'escalated' | 'departments');
    } else {
      setAdminTab(tabId as 'overview' | 'governance' | 'recurring' | 'logs');
    }
  };

  const primaryAction =
    activePortal === 'citizen' && citizenTab !== 'submit'
      ? { label: 'New Complaint', onClick: () => setCitizenTab('submit') }
      : activePortal === 'admin' && adminTab !== 'recurring'
        ? { label: 'AI Monitor Scan', onClick: () => setAdminTab('recurring') }
        : undefined;

  const openDossier = (c: Complaint) => setInspectedComplaintId(c.id);
  const openFeedback = (c: Complaint) => {
    setInspectedComplaintId(null);
    setFeedbackComplaintId(c.id);
  };

  const handleRetryAiProcessing = async (target: Complaint) => {
    if (departments.length === 0) {
      throw new Error('Municipal department directory is not initialized yet.');
    }
    const response = await invokeProcessComplaintEndpoint({
      complaintId: target.id,
      complaint: {
        complaintId: target.id,
        complaintCode: target.complaintCode,
        citizenUid: target.citizenUid,
        citizenName: target.citizenName,
        title: target.title,
        description: target.description,
        locationText: target.locationText,
        ward: target.ward,
        category: target.category,
        photoDataUrl:
          target.photoDataUrl && target.photoDataUrl.startsWith('data:')
            ? target.photoDataUrl
            : undefined,
        auditTrail: target.auditTrail,
      },
      departments,
      recentComplaints: complaints,
    });

    if (!response.persistedByServer) {
      await applyOrchestrationResultToComplaint({
        complaintId: target.id,
        complaintCode: target.complaintCode,
        citizen: profile,
        title: target.title,
        ward: target.ward,
        userSelectedCategory: target.category,
        departments,
        aiPlan: response.result,
        existingAuditTrail: target.auditTrail,
      });
    }
  };

  return (
    <AppShell
      profile={profile}
      isBootstrappedAdmin={isBootstrappedAdmin}
      activePortal={activePortal}
      onPortalChange={handlePortalChange}
      navTabs={navTabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      primaryAction={primaryAction}
      onSignOut={signOut}
    >
      {authError ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="min-w-0">
            <p className="font-semibold">Authentication / Initialization Notice</p>
            <p className="mt-1 font-mono text-xs break-all">{authError}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => retryDepartmentInit().catch(() => {})}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
            >
              Retry Department Sync
            </button>
            <button
              type="button"
              onClick={clearAuthError}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {dataError ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Firestore Synchronization Notice</p>
          <p className="mt-1 font-mono text-xs break-all">{dataError}</p>
        </div>
      ) : null}

      {activePortal === 'citizen' ? (
        citizenTab === 'overview' ? (
          <CitizenDashboard
            profile={profile}
            complaints={complaints}
            loading={loading}
            onGoSubmit={() => setCitizenTab('submit')}
            onGoTrack={() => setCitizenTab('track')}
            onInspect={openDossier}
            onOpenFeedback={openFeedback}
          />
        ) : citizenTab === 'submit' ? (
          <SubmitComplaintForm
            citizen={profile}
            departments={departments}
            recentComplaints={complaints}
            onSubmitted={(code) => {
              setTrackedComplaintCode(code);
              setCitizenTab('track');
            }}
          />
        ) : (
          <TrackComplaints
            complaints={complaints.filter((c) => c.citizenUid === profile.uid)}
            highlightedCode={trackedComplaintCode}
            onClearHighlight={() => setTrackedComplaintCode(null)}
            onInspect={openDossier}
            onGiveFeedback={openFeedback}
            onGoSubmit={() => setCitizenTab('submit')}
            onRetryAiProcessing={handleRetryAiProcessing}
          />
        )
      ) : activePortal === 'officer' ? (
        <OfficerDashboard
          profile={profile}
          complaints={complaints}
          departments={departments}
          agentLogs={agentLogs}
          loading={loading}
          mode={officerTab}
          onInspect={openDossier}
        />
      ) : adminTab === 'overview' ? (
        <AdminDashboard
          complaints={complaints}
          departments={departments}
          feedbackList={feedbackList}
          adminUser={profile}
          loading={loading}
          onInspect={openDossier}
        />
      ) : adminTab === 'governance' ? (
        <DepartmentRoleControl
          departments={departments}
          users={users}
          actor={profile}
        />
      ) : adminTab === 'recurring' ? (
        <RecurringAnalysis
          complaints={complaints}
          adminUser={profile}
          onInspect={openDossier}
        />
      ) : (
        <AgentLogsView agentLogs={agentLogs} auditLogs={auditLogs} />
      )}

      {inspectedComplaint ? (
        <ComplaintDetailModal
          complaint={inspectedComplaint}
          agentLogs={agentLogs}
          currentUser={profile}
          onClose={() => setInspectedComplaintId(null)}
          onOpenFeedback={openFeedback}
          onRetryAiProcessing={handleRetryAiProcessing}
        />
      ) : null}

      {feedbackComplaint ? (
        <FeedbackModal
          complaint={feedbackComplaint}
          citizen={profile}
          onClose={() => setFeedbackComplaintId(null)}
        />
      ) : null}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <JanasevaWorkspace />
      </AuthProvider>
    </ErrorBoundary>
  );
}
