import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AgentLogRecord, AuditLogRecord } from '../../types/domain';
import { EmptyState } from '../shared/EmptyState';

export function AgentLogsView({
  agentLogs,
  auditLogs,
}: {
  agentLogs: AgentLogRecord[];
  auditLogs: AuditLogRecord[];
}) {
  const [subTab, setSubTab] = useState<'agents' | 'audit'>('agents');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredAgentLogs = useMemo(() => {
    if (agentFilter === 'all') return agentLogs;
    return agentLogs.filter((l) => l.agentName === agentFilter);
  }, [agentLogs, agentFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setSubTab('agents')}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
              subTab === 'agents'
                ? 'bg-white text-navy-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            AI Agent Execution Logs ({agentLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
              subTab === 'audit'
                ? 'bg-white text-navy-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            System Audit Trail ({auditLogs.length})
          </button>
        </div>

        {subTab === 'agents' ? (
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-teal-600 focus:outline-none"
          >
            <option value="all">All Orchestrator &amp; Agents</option>
            <option value="Central Orchestrator">Central Orchestrator</option>
            <option value="Complaint Intake Agent">Complaint Intake Agent</option>
            <option value="Complaint Classification Agent">Complaint Classification Agent</option>
            <option value="Priority Assessment Agent">Priority Assessment Agent</option>
            <option value="Department Routing Agent">Department Routing Agent</option>
            <option value="Resolution Recommendation Agent">Resolution Recommendation Agent</option>
            <option value="Monitoring and Escalation Agent">Monitoring and Escalation Agent</option>
          </select>
        ) : null}
      </div>

      {subTab === 'agents' ? (
        filteredAgentLogs.length === 0 ? (
          <EmptyState
            title="No AI Agent Execution Logs"
            description="Agent execution traces appear automatically whenever grievances are orchestrated or monitored."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3">Agent Name</th>
                    <th className="px-4 py-3">Complaint ID</th>
                    <th className="px-4 py-3">Action &amp; Summary</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3 text-right">Latency</th>
                    <th className="px-4 py-3 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAgentLogs.map((log) => {
                    const expanded = expandedId === log.id;
                    return (
                      <tr key={log.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-3 text-xs font-bold text-navy-900 whitespace-nowrap">
                          {log.agentName}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-teal-800 tabular-nums whitespace-nowrap">
                          {log.complaintCode}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-semibold text-slate-900">{log.action}</p>
                          <p className="mt-0.5 text-xs text-slate-600">{log.summary}</p>
                          {expanded && log.outputData ? (
                            <pre className="mt-2 max-w-lg overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-700">
                              {JSON.stringify(log.outputData, null, 2)}
                            </pre>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap">
                          <span
                            className={
                              log.status === 'Escalated' || log.status === 'Failed'
                                ? 'text-red-700'
                                : log.status === 'Warning'
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                            }
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          {log.latencyMs}ms
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : log.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            {expanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <span>JSON</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : auditLogs.length === 0 ? (
        <EmptyState
          title="No Audit Trail Records"
          description="Officer approvals, escalations, and administrative mutations are recorded here."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {auditLogs.map((aud) => (
                  <tr key={aud.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {aud.createdAt?.toDate ? aud.createdAt.toDate().toLocaleString() : 'Just now'}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {aud.actorName} ({aud.actorRole})
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-teal-800 whitespace-nowrap">
                      {aud.entityType}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-navy-900">
                      {aud.action}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{aud.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
