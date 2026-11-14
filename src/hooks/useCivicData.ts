import { useEffect, useState } from 'react';
import {
  subscribeAgentLogs,
  subscribeAllUsers,
  subscribeAuditLogs,
  subscribeComplaints,
  subscribeDepartments,
  subscribeFeedback,
} from '../services/firestoreService';
import type {
  AgentLogRecord,
  AuditLogRecord,
  Complaint,
  Department,
  FeedbackRecord,
  UserProfile,
} from '../types/domain';

export function useCivicData(profile: UserProfile | null, isBootstrappedAdmin: boolean) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentLogRecord[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      setDepartments([]);
      setComplaints([]);
      setAgentLogs([]);
      setFeedbackList([]);
      setAuditLogs([]);
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setDataError(null);
    const isAdminUser = isBootstrappedAdmin || profile.role === 'admin';
    let settledCount = 0;
    const expectedStreams = isAdminUser ? 6 : 5;
    const markSettled = () => {
      settledCount += 1;
      if (settledCount >= expectedStreams) setLoading(false);
    };
    const handleErr = (err: Error) => {
      setDataError(err.message);
      setLoading(false);
    };

    const unsubs = [
      subscribeDepartments((items) => {
        setDepartments(items);
        markSettled();
      }, handleErr),
      subscribeComplaints(
        profile,
        isAdminUser,
        (items) => {
          setComplaints(items);
          markSettled();
        },
        handleErr
      ),
      subscribeAgentLogs(
        profile,
        isAdminUser,
        (items) => {
          setAgentLogs(items);
          markSettled();
        },
        handleErr
      ),
      subscribeFeedback(
        profile,
        isAdminUser,
        (items) => {
          setFeedbackList(items);
          markSettled();
        },
        handleErr
      ),
      subscribeAuditLogs(
        profile,
        isAdminUser,
        (items) => {
          setAuditLogs(items);
          markSettled();
        },
        handleErr
      ),
    ];

    if (isAdminUser) {
      unsubs.push(
        subscribeAllUsers((items) => {
          setUsers(items);
          markSettled();
        }, handleErr)
      );
    }

    const fallbackTimer = window.setTimeout(() => setLoading(false), 1800);

    return () => {
      window.clearTimeout(fallbackTimer);
      unsubs.forEach((fn) => fn());
    };
  }, [profile, isBootstrappedAdmin]);

  return {
    departments,
    complaints,
    agentLogs,
    feedbackList,
    auditLogs,
    users,
    loading,
    dataError,
  };
}
