import { useState } from 'react';
import { Check, Save } from 'lucide-react';
import {
  adminUpdateUserRole,
  updateDepartmentConfig,
} from '../../services/firestoreService';
import type { Department, UserProfile, UserRole } from '../../types/domain';

export function DepartmentRoleControl({
  departments,
  users,
  actor,
}: {
  departments: Department[];
  users: UserProfile[];
  actor: UserProfile;
}) {
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [headName, setHeadName] = useState('');
  const [slaHours, setSlaHours] = useState(24);
  const [activeOfficers, setActiveOfficers] = useState(10);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startEditDept = (d: Department) => {
    setEditingDeptId(d.id);
    setHeadName(d.headOfficerName);
    setSlaHours(d.slaHours);
    setActiveOfficers(d.activeOfficers || 10);
    setNotice(null);
    setError(null);
  };

  const handleSaveDept = async (deptId: string) => {
    setSavingId(deptId);
    setError(null);
    try {
      await updateDepartmentConfig({
        departmentId: deptId,
        headOfficerName: headName,
        slaHours,
        activeOfficers,
        actor,
      });
      setEditingDeptId(null);
      setNotice('Department SLA and leadership configuration updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update department.');
    } finally {
      setSavingId(null);
    }
  };

  const handleRoleChange = async (target: UserProfile, newRole: UserRole, deptId: string) => {
    setSavingId(target.uid);
    setError(null);
    try {
      await adminUpdateUserRole({
        targetUid: target.uid,
        role: newRole,
        departmentId: deptId,
        actor,
      });
      setNotice(`Updated role for ${target.fullName} to ${newRole}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user role.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-900">
          <Check className="h-4 w-4 text-teal-700" />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* Municipal Departments Configuration */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-display text-base font-bold text-navy-900">
            Municipal Department Governance &amp; SLA Configuration
          </h2>
          <p className="text-xs text-slate-500">
            Configure statutory SLA turnaround hours and department leadership
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Department Name</th>
                <th className="px-4 py-3">Head Officer</th>
                <th className="px-4 py-3 text-right">SLA Hours</th>
                <th className="px-4 py-3 text-right">Officers</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {departments.map((d) => {
                const isEditing = editingDeptId === d.id;
                return (
                  <tr key={d.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-navy-900">
                      {d.code}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {d.name}
                      <p className="text-xs font-normal text-slate-500">{d.category}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {isEditing ? (
                        <input
                          type="text"
                          value={headName}
                          onChange={(e) => setHeadName(e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      ) : (
                        d.headOfficerName
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          min={1}
                          max={720}
                          value={slaHours}
                          onChange={(e) => setSlaHours(Number(e.target.value))}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs"
                        />
                      ) : (
                        `${d.slaHours}h`
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          value={activeOfficers}
                          onChange={(e) => setActiveOfficers(Number(e.target.value))}
                          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs"
                        />
                      ) : (
                        d.activeOfficers ?? 0
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={savingId === d.id}
                            onClick={() => handleSaveDept(d.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800"
                          >
                            <Save className="h-3.5 w-3.5" />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDeptId(null)}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditDept(d)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-navy-900 hover:bg-slate-100"
                        >
                          Configure
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* User & Role Access Control */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="font-display text-base font-bold text-navy-900">
            Authorized Personnel &amp; Role-Based Access Control
          </h2>
          <p className="text-xs text-slate-500">
            Assign Government Officer or Administrator privileges to verified platform accounts
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">User Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Ward / City</th>
                <th className="px-4 py-3">Assigned Role</th>
                <th className="px-4 py-3">Department</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-semibold text-slate-900">{u.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {u.ward || '—'} · {u.city || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      disabled={savingId === u.uid}
                      value={u.role}
                      onChange={(e) =>
                        handleRoleChange(u, e.target.value as UserRole, u.departmentId || '')
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-navy-900 focus:border-teal-600 focus:outline-none"
                    >
                      <option value="citizen">Citizen</option>
                      <option value="officer">Government Officer</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      disabled={savingId === u.uid || u.role === 'citizen'}
                      value={u.departmentId || ''}
                      onChange={(e) => handleRoleChange(u, u.role, e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">Unassigned</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} — {d.category}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
