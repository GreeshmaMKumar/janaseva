import { useMemo, useState } from 'react';
import { Activity, AlertOctagon, Loader2, ShieldAlert } from 'lucide-react';
import { invokePortfolioMonitoringAgent } from '../../services/agentApiService';
import {
  logMonitoringAgentRun,
  officerUpdateComplaint,
} from '../../services/firestoreService';
import type {
  Complaint,
  MonitoringAnalysisResponse,
  UserProfile,
} from '../../types/domain';
import { EmptyState } from '../shared/EmptyState';

export function RecurringAnalysis({
  complaints,
  adminUser,
  onInspect,
}: {
  complaints: Complaint[];
  adminUser: UserProfile;
  onInspect: (c: Complaint) => void;
}) {
  const [runningMonitor, setRunningMonitor] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<MonitoringAnalysisResponse | null>(null);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);

  // Local aggregation of recurring signatures & ward-category clusters
  const localClusters = useMemo(() => {
    const map = new Map<
      string,
      { key: string; ward: string; category: string; signature: string; items: Complaint[] }
    >();
    complaints.forEach((c) => {
      const sig = c.recurringSignature || `${c.ward}-${c.category}`;
      const key = `${c.ward}::${c.category}::${sig}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(c);
      } else {
        map.set(key, {
          key,
          ward: c.ward,
          category: c.category,
          signature: sig,
          items: [c],
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [complaints]);

  const handleRunMonitoringAgent = async () => {
    setRunningMonitor(true);
    setMonitorError(null);
    try {
      const res = await invokePortfolioMonitoringAgent(complaints);
      setAiResult(res);
      if (complaints[0]) {
        await logMonitoringAgentRun({
          complaintId: complaints[0].id,
          complaintCode: complaints[0].complaintCode,
          actorUid: adminUser.uid,
          trace: res.trace,
        });
      }
    } catch (err) {
      setMonitorError(err instanceof Error ? err.message : 'Monitoring scan failed.');
    } finally {
      setRunningMonitor(false);
    }
  };

  const handleApproveEscalation = async (complaintId: string, reason: string) => {
    const target = complaints.find((c) => c.id === complaintId);
    if (!target) return;
    setEscalatingId(complaintId);
    try {
      await officerUpdateComplaint({
        complaint: target,
        officer: adminUser,
        updates: {
          status: 'Escalated',
          priority: 'Critical',
          escalationReason: reason,
        },
        auditAction: 'Admin approved Monitoring Agent escalation',
        auditNote: reason.slice(0, 240),
      });
    } finally {
      setEscalatingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & AI Trigger */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold tracking-wide text-teal-700 uppercase">
            Agent 06 · Monitoring &amp; Escalation Intelligence
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-navy-900">
            Recurring Complaint &amp; SLA Hotspot Analysis
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Detect systemic infrastructure failures across wards and run the Monitoring &amp;
            Escalation Agent to audit SLA breaches.
          </p>
        </div>
        <button
          type="button"
          disabled={runningMonitor || complaints.length === 0}
          onClick={handleRunMonitoringAgent}
          className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {runningMonitor ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Activity className="h-4 w-4" />
          )}
          <span>{runningMonitor ? 'Scanning Portfolio...' : 'Run Monitoring & Escalation Agent'}</span>
        </button>
      </div>

      {monitorError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {monitorError}
        </div>
      ) : null}

      {/* AI Monitoring Output */}
      {aiResult ? (
        <div className="space-y-6 rounded-xl border border-teal-200 bg-white p-6">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-navy-900">
                Live AI Monitoring Agent Report
              </h3>
              <span className="font-mono text-xs text-teal-700 tabular-nums">
                Latency: {aiResult.trace.latencyMs}ms
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-800">
              {aiResult.analysis.overallRiskSummary}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h4 className="flex items-center gap-2 text-xs font-bold tracking-wide text-red-800 uppercase">
                <ShieldAlert className="h-4 w-4" />
                <span>
                  Recommended SLA Escalations ({aiResult.analysis.escalationRecommendations.length})
                </span>
              </h4>
              {aiResult.analysis.escalationRecommendations.length === 0 ? (
                <p className="mt-2 text-xs text-slate-600">
                  No unresolved SLA breach escalations flagged at this moment.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {aiResult.analysis.escalationRecommendations.map((rec) => {
                    const matched = complaints.find((c) => c.id === rec.complaintId);
                    const alreadyEscalated = matched?.status === 'Escalated';
                    return (
                      <div
                        key={rec.complaintId}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-navy-900 tabular-nums">
                            {rec.complaintCode}
                          </span>
                          {matched && !alreadyEscalated ? (
                            <button
                              type="button"
                              disabled={escalatingId === matched.id}
                              onClick={() => handleApproveEscalation(matched.id, rec.reason)}
                              className="inline-flex items-center gap-1 rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                            >
                              <AlertOctagon className="h-3.5 w-3.5" />
                              <span>
                                {escalatingId === matched.id ? 'Escalating...' : 'Approve Escalation'}
                              </span>
                            </button>
                          ) : alreadyEscalated ? (
                            <span className="text-xs font-semibold text-red-700">Escalated</span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs text-slate-800">{rec.reason}</p>
                        <p className="mt-1 text-xs font-medium text-teal-800">
                          Action: {rec.recommendedAction}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold tracking-wide text-navy-900 uppercase">
                AI-Diagnosed Recurring Hotspots ({aiResult.analysis.recurringHotspots.length})
              </h4>
              {aiResult.analysis.recurringHotspots.length === 0 ? (
                <p className="mt-2 text-xs text-slate-600">No systemic hotspots identified.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {aiResult.analysis.recurringHotspots.map((hs, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-navy-900">
                          {hs.ward} · {hs.category}
                        </span>
                        <span className="font-mono font-semibold text-teal-800 tabular-nums">
                          {hs.count} incidents
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-700">
                        <span className="font-semibold">Root Cause:</span> {hs.rootCauseHypothesis}
                      </p>
                      <p className="mt-1 text-xs text-teal-900">
                        <span className="font-semibold">Preventive Plan:</span>{' '}
                        {hs.preventiveRecommendation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Recurring Signature Clusters Table */}
      {localClusters.length === 0 ? (
        <EmptyState
          title="No Complaint Clusters Recorded"
          description="Submit civic complaints to populate ward-level recurring signature analytics."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="font-display text-base font-bold text-navy-900">
              Recurring Issue Pattern Registry
            </h3>
            <p className="text-xs text-slate-500">
              Grouped by AI-extracted recurring signature, ward, and civic category
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Recurring Signature</th>
                  <th className="px-4 py-3">Ward</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Occurrences</th>
                  <th className="px-4 py-3 text-right">Latest Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {localClusters.map((cluster) => {
                  const latest = cluster.items[0];
                  return (
                    <tr key={cluster.key} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-navy-900">
                        {cluster.signature}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{cluster.ward}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{cluster.category}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-teal-800 tabular-nums">
                        {cluster.items.length}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onInspect(latest)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-navy-900 hover:bg-slate-100"
                        >
                          {latest.complaintCode}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
