import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Loader2, ShieldCheck } from 'lucide-react';
import {
  ensureDefaultDepartments,
  getFirebaseRuntimeConfig,
  runAdminDiagnosticsTest,
} from '../../services/firestoreService';
import type { Department, UserProfile } from '../../types/domain';

export function FirestoreDiagnosticsCard({
  adminUser,
  departments,
}: {
  adminUser: UserProfile;
  departments: Department[];
}) {
  const runtime = getFirebaseRuntimeConfig();
  const [testing, setTesting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [testResult, setTestResult] = useState<{
    diagId: string;
    projectId: string;
    databaseId: string;
    latencyMs: number;
    readBackData: Record<string, unknown>;
  } | null>(null);
  const [seedSuccess, setSeedSuccess] = useState<string | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  const handleRunDiagnostic = async () => {
    setTesting(true);
    setDiagError(null);
    setTestResult(null);
    try {
      const result = await runAdminDiagnosticsTest(adminUser);
      setTestResult(result);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : 'Diagnostic test failed.');
    } finally {
      setTesting(false);
    }
  };

  const handleSeedDepartments = async () => {
    setSeeding(true);
    setDiagError(null);
    setSeedSuccess(null);
    try {
      const count = await ensureDefaultDepartments(adminUser.uid);
      setSeedSuccess(
        `Verified ${count} municipal department records in ${runtime.projectId} (${runtime.databaseId}).`
      );
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : 'Department seeding failed.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-teal-700 uppercase">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Administrator Firestore Connection Diagnostics</span>
          </div>
          <h2 className="mt-1 font-display text-base font-bold text-navy-900">
            Live Database Write &amp; Read-Back Verification
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={seeding}
            onClick={handleSeedDepartments}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-navy-900 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
          >
            {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            <span>Verify / Seed Departments ({departments.length})</span>
          </button>

          <button
            type="button"
            disabled={testing}
            onClick={handleRunDiagnostic}
            className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-60 whitespace-nowrap"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            <span>{testing ? 'Writing & Reading...' : 'Run Authenticated Write & Read Test'}</span>
          </button>
        </div>
      </div>

      {/* Live Config & Identity Metadata */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Authenticated UID</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-navy-900">
            {adminUser.uid}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-600">
            {adminUser.email} · role: {adminUser.role}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Firebase Project ID</p>
          <p className="mt-1 font-mono text-xs font-semibold text-teal-800">{runtime.projectId}</p>
          <p className="mt-0.5 truncate text-xs text-slate-600">{runtime.authDomain}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Firestore Database ID</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-navy-900">
            {runtime.databaseId}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Select this database ID in Firebase Console &rarr; Firestore Data
          </p>
        </div>
      </div>

      {diagError ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Firestore Diagnostic Error</p>
            <p className="mt-0.5 font-mono break-all">{diagError}</p>
          </div>
        </div>
      ) : null}

      {seedSuccess ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />
          <span>{seedSuccess}</span>
        </div>
      ) : null}

      {testResult ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <span>Authenticated Write &amp; Server Read-Back Succeeded</span>
            </span>
            <span className="font-mono tabular-nums">
              Doc: diagnostics/{testResult.diagId} · {testResult.latencyMs}ms
            </span>
          </div>
          <pre className="mt-2 overflow-x-auto rounded border border-emerald-200 bg-white p-2.5 font-mono text-[11px] text-slate-700">
            {JSON.stringify(testResult.readBackData, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
