import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Users,
  FileSpreadsheet,
  BarChart3,
  ClipboardList,
  LogOut,
  AlertOctagon,
  CheckCircle2,
  X,
  Upload,
} from 'lucide-react';
import {
  apiFetch,
  buildWsUrl,
  getStoredToken,
  setStoredToken,
} from './lib/api';
import type {
  AdminSession,
  AuditEntry,
  AuthSession,
  BoothStatePayload,
  BoothStats,
  BoothSummary,
  OfficerPresence,
  VoterRecord,
  WsServerEvent,
} from './types/election';
import { LoginScreen } from './components/LoginScreen';
import { AdminDashboard } from './components/AdminDashboard';
import { QuickCheckPanel } from './components/QuickCheckPanel';
import { VoterRollTable } from './components/VoterRollTable';
import { ImportRollView } from './components/ImportRollView';
import { EndOfDayReportView } from './components/EndOfDayReportView';
import { AuditLogView } from './components/AuditLogView';
import { RevertModal } from './components/RevertModal';
import { MarkDeadModal } from './components/MarkDeadModal';

type NavTab = 'checkin' | 'report' | 'audit' | 'import';

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<NavTab>('checkin');

  const [booth, setBooth] = useState<BoothSummary | null>(null);
  const [officers, setOfficers] = useState<OfficerPresence[]>([]);
  const [voters, setVoters] = useState<VoterRecord[]>([]);
  const [stats, setStats] = useState<BoothStats>({
    total_voters: 0,
    voted_count: 0,
    dead_count: 0,
    remaining_count: 0,
    completion_percentage: 0,
    duplicate_attempts_blocked: 0,
    reverted_count: 0,
    last_vote_at: null,
  });
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [busyVoterId, setBusyVoterId] = useState<number | null>(null);
  const [revertTarget, setRevertTarget] = useState<VoterRecord | null>(null);
  const [deadTarget, setDeadTarget] = useState<VoterRecord | null>(null);
  const [bannerAlert, setBannerAlert] = useState<{
    kind: 'success' | 'fraud';
    message: string;
  } | null>(null);
  const [reportRefreshTick, setReportRefreshTick] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);

  const selectTab = useCallback((tab: NavTab) => {
    setActiveTab(tab);
    if (mobileScrollRef.current) {
      mobileScrollRef.current.scrollTop = 0;
    }
  }, []);

  const applyFullState = useCallback((state: BoothStatePayload) => {
    setBooth(state.booth);
    setOfficers(state.officers);
    setVoters(state.voters);
    setStats(state.stats);
    setAuditLogs(state.audit_logs);
  }, []);

  // Restore session (Booth Officer or Ward Admin) on page reload
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setBootstrapping(false);
      return;
    }

    apiFetch<AuthSession>('/api/auth/session', {}, token)
      .then((restored) => {
        setSession(restored);
      })
      .catch(async () => {
        try {
          const restoredAdmin = await apiFetch<AdminSession>('/api/admin/session', {}, token);
          setAdminSession(restoredAdmin);
        } catch {
          setStoredToken(null);
        }
      })
      .finally(() => {
        setBootstrapping(false);
      });
  }, []);

  // Real-time WebSocket connection & initial state sync
  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    const loadInitial = async () => {
      try {
        const state = await apiFetch<BoothStatePayload>(
          `/api/booths/${encodeURIComponent(session.booth.id)}/state`
        );
        if (!cancelled) {
          applyFullState(state);
        }
      } catch {
        // Handled by reconnect or auth check
      }
    };

    const connectWs = () => {
      if (cancelled) return;
      const ws = new WebSocket(buildWsUrl(session.token));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) {
          setWsConnected(true);
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as WsServerEvent;
          if (payload.type === 'init') {
            applyFullState(payload.state);
          } else if (payload.type === 'voter:updated') {
            setVoters((prev) =>
              prev.map((v) => (v.id === payload.voter.id ? payload.voter : v))
            );
            setStats(payload.stats);
            setAuditLogs((prev) => {
              if (prev.some((a) => a.id === payload.auditEntry.id)) return prev;
              return [payload.auditEntry, ...prev].slice(0, 150);
            });
            setReportRefreshTick((t) => t + 1);
          } else if (payload.type === 'fraud:blocked') {
            setVoters((prev) =>
              prev.map((v) => (v.id === payload.voter.id ? payload.voter : v))
            );
            setStats(payload.stats);
            setAuditLogs((prev) => {
              if (prev.some((a) => a.id === payload.auditEntry.id)) return prev;
              return [payload.auditEntry, ...prev].slice(0, 150);
            });
            setBannerAlert({
              kind: 'fraud',
              message:
                payload.voter.status === 'DEAD'
                  ? `Blocked: Serial #${payload.voter.serial_no} (${payload.voter.full_name}) was marked DEAD by ${payload.voter.marked_dead_by_officer_name ?? 'an officer'}${payload.voter.marked_dead_by_officer_role ? ` (${payload.voter.marked_dead_by_officer_role})` : ''}.`
                  : `Duplicate vote blocked for Serial #${payload.voter.serial_no} (${payload.voter.full_name}). Already verified by ${payload.voter.verified_by_officer_name ?? 'another officer'}.`,
            });
            setReportRefreshTick((t) => t + 1);
          } else if (payload.type === 'roll:replaced') {
            setVoters(payload.voters);
            setStats(payload.stats);
            setAuditLogs((prev) => {
              if (prev.some((a) => a.id === payload.auditEntry.id)) return prev;
              return [payload.auditEntry, ...prev].slice(0, 150);
            });
            setReportRefreshTick((t) => t + 1);
          } else if (payload.type === 'presence:updated') {
            setOfficers(payload.officers);
          } else if (payload.type === 'booth:updated') {
            setBooth(payload.booth);
            setAuditLogs((prev) => {
              if (prev.some((a) => a.id === payload.auditEntry.id)) return prev;
              return [payload.auditEntry, ...prev].slice(0, 150);
            });
            setReportRefreshTick((t) => t + 1);
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          setWsConnected(false);
          reconnectTimerRef.current = window.setTimeout(connectWs, 2000);
        }
      };
    };

    void loadInitial();
    connectWs();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [session, applyFullState]);

  const handleAuthenticated = (newSession: AuthSession) => {
    setStoredToken(newSession.token);
    setSession(newSession);
    setBooth(newSession.booth);
    setActiveTab('checkin');
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network failures
    }
    setStoredToken(null);
    setSession(null);
    setBooth(null);
    setVoters([]);
    setAuditLogs([]);
    setOfficers([]);
  };

  const handleMarkVoted = async (voter: VoterRecord) => {
    if (!session) return;
    setBusyVoterId(voter.id);
    setBannerAlert(null);
    try {
      const res = await apiFetch<{
        voter: VoterRecord;
        stats: BoothStats;
        auditEntry: AuditEntry;
      }>(`/api/booths/${encodeURIComponent(session.booth.id)}/voters/${voter.id}/mark-voted`, {
        method: 'POST',
      });

      setVoters((prev) => prev.map((v) => (v.id === res.voter.id ? res.voter : v)));
      setStats(res.stats);
      setAuditLogs((prev) => {
        if (prev.some((a) => a.id === res.auditEntry.id)) return prev;
        return [res.auditEntry, ...prev].slice(0, 150);
      });
      setBannerAlert({
        kind: 'success',
        message: `Marked Serial #${res.voter.serial_no} (${res.voter.full_name}) as Voted.`,
      });
      setReportRefreshTick((t) => t + 1);
    } catch (err) {
      setBannerAlert({
        kind: 'fraud',
        message: err instanceof Error ? err.message : 'Unable to mark voter.',
      });
    } finally {
      setBusyVoterId(null);
    }
  };

  const handleMarkDeadConfirm = async (voter: VoterRecord, note: string) => {
    if (!session) return;
    setBusyVoterId(voter.id);
    setBannerAlert(null);
    try {
      const res = await apiFetch<{
        voter: VoterRecord;
        stats: BoothStats;
        auditEntry: AuditEntry;
      }>(`/api/booths/${encodeURIComponent(session.booth.id)}/voters/${voter.id}/mark-dead`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });

      setVoters((prev) => prev.map((v) => (v.id === res.voter.id ? res.voter : v)));
      setStats(res.stats);
      setAuditLogs((prev) => {
        if (prev.some((a) => a.id === res.auditEntry.id)) return prev;
        return [res.auditEntry, ...prev].slice(0, 150);
      });
      setBannerAlert({
        kind: 'success',
        message: `Marked Serial #${res.voter.serial_no} (${res.voter.full_name}) as Dead · Recorded by ${res.voter.marked_dead_by_officer_name ?? session.officer.full_name}.`,
      });
      setReportRefreshTick((t) => t + 1);
    } finally {
      setBusyVoterId(null);
    }
  };

  const handleRevertConfirm = async (voter: VoterRecord, reason: string) => {
    if (!session) return;
    const res = await apiFetch<{
      voter: VoterRecord;
      stats: BoothStats;
      auditEntry: AuditEntry;
    }>(`/api/booths/${encodeURIComponent(session.booth.id)}/voters/${voter.id}/revert`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });

    setVoters((prev) => prev.map((v) => (v.id === res.voter.id ? res.voter : v)));
    setStats(res.stats);
    setAuditLogs((prev) => {
      if (prev.some((a) => a.id === res.auditEntry.id)) return prev;
      return [res.auditEntry, ...prev].slice(0, 150);
    });
    setBannerAlert({
      kind: 'success',
      message: `Reverted Serial #${res.voter.serial_no} (${res.voter.full_name}) to Not Voted.`,
    });
    setReportRefreshTick((t) => t + 1);
  };

  const handleAdminAuthenticated = (newAdminSession: AdminSession) => {
    setStoredToken(newAdminSession.token);
    setAdminSession(newAdminSession);
  };

  const handleAdminLogout = async () => {
    try {
      await apiFetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore logout network errors
    }
    setStoredToken(null);
    setAdminSession(null);
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Restoring booth terminal session...
      </div>
    );
  }

  if (adminSession) {
    return <AdminDashboard session={adminSession} onLogout={handleAdminLogout} />;
  }

  if (!session) {
    return (
      <LoginScreen
        onAuthenticated={handleAuthenticated}
        onAdminAuthenticated={handleAdminAuthenticated}
      />
    );
  }

  const activeBooth = booth ?? session.booth;
  const loggedInCount = officers.filter((o) => o.is_logged_in).length;

  return (
    <div className="h-[100dvh] md:h-auto md:min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col md:flex-row overflow-hidden md:overflow-visible print:h-auto print:overflow-visible">
      {/* Sidebar Navigation */}
      <aside className="hidden md:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between no-print">
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-slate-900 shrink-0" />
            <span className="text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
              BoothGuard
            </span>
          </div>

          <div className="p-4 border-b border-slate-100">
            <div className="text-xs font-mono font-semibold text-slate-900">
              {activeBooth.id}
            </div>
            <div className="text-xs text-slate-600 mt-0.5 leading-snug">{activeBooth.name}</div>
            <div className="mt-2 text-xs text-slate-500">
              {wsConnected ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  Live Booth Sync Active
                </span>
              ) : (
                <span className="text-amber-700 font-medium">Reconnecting live sync...</span>
              )}
            </div>
          </div>

          <nav className="p-3 space-y-1" aria-label="Booth Workspace">
            <button
              type="button"
              onClick={() => setActiveTab('checkin')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'checkin'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Voter Check-In</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'report'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>End-of-Day Report</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'audit'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Audit &amp; Fraud Log</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'import'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>Import CSV / Excel</span>
            </button>
          </nav>

          {/* Dual Officer Presence List (1-2 Logins Per Booth) */}
          <div className="px-4 py-3 mt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2.5">
              <span>Booth Logins</span>
              <span className="font-mono tabular-nums text-slate-500">
                {loggedInCount}/{activeBooth.max_officers}
              </span>
            </div>
            <div className="space-y-2.5">
              {officers.map((off) => {
                const isSelf = off.id === session.officer.id;
                return (
                  <div
                    key={off.id}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 truncate">
                        {off.full_name} {isSelf ? '(You)' : ''}
                      </span>
                      <span
                        className={`font-mono text-[11px] shrink-0 ${
                          off.is_online
                            ? 'text-emerald-700 font-semibold'
                            : off.is_logged_in
                              ? 'text-amber-700'
                              : 'text-slate-400'
                        }`}
                      >
                        {off.is_online ? 'Online' : off.is_logged_in ? 'Signed In' : 'Offline'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {off.role} · <span className="font-mono">{off.username}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200">
          <div className="text-xs font-medium text-slate-900 truncate">
            {session.officer.full_name}
          </div>
          <div className="text-[11px] text-slate-500 mb-3">{session.officer.role}</div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out Terminal</span>
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <div
        ref={mobileScrollRef}
        className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain md:overflow-visible print:overflow-visible"
      >
        <header className="shrink-0 h-14 md:h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-3 md:gap-6 no-print">
          <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
            <ShieldCheck className="w-4 h-4 text-slate-900 shrink-0 md:hidden" />
            <span className="font-mono font-semibold text-slate-900 whitespace-nowrap">
              {activeBooth.id}
            </span>
            <span aria-hidden="true" className="hidden sm:inline">
              /
            </span>
            <span className="hidden sm:inline truncate">{activeBooth.constituency}</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-slate-800 truncate">
              {activeTab === 'checkin' && 'Check-In'}
              {activeTab === 'report' && 'EOD Report'}
              {activeTab === 'audit' && 'Audit Log'}
              {activeTab === 'import' && 'Import Roll'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="md:hidden flex items-center gap-2">
              <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                  wsConnected ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {wsConnected ? 'Live' : 'Syncing'}
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                aria-label="Sign Out Terminal"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => selectTab(activeTab === 'import' ? 'checkin' : 'import')}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{activeTab === 'import' ? 'Back to Check-In' : 'Import Voter Roll'}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-4 md:space-y-6">
          {/* Mobile Officer Presence Summary */}
          <div className="md:hidden bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-xs no-print">
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 truncate">
                {session.officer.full_name}
              </div>
              <div className="text-[11px] text-slate-500">{session.officer.role}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono font-semibold text-slate-900 tabular-nums">
                {loggedInCount}/{activeBooth.max_officers} Logins
              </div>
              <div className="text-[11px] text-slate-500">
                {officers.filter((o) => o.is_online).length} online now
              </div>
            </div>
          </div>

          {/* Real-Time Alert Banner */}
          {bannerAlert && (
            <div
              role="alert"
              className={`p-3.5 md:p-4 rounded-2xl md:rounded-xl border flex items-center justify-between gap-3 no-print ${
                bannerAlert.kind === 'fraud'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2.5 text-xs font-semibold">
                {bannerAlert.kind === 'fraud' ? (
                  <AlertOctagon className="w-4 h-4 text-rose-700 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                )}
                <span>{bannerAlert.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setBannerAlert(null)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
                aria-label="Dismiss alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Live Turnout Metrics Strip (2x2 on mobile, 4-col on desktop) */}
          {activeTab === 'checkin' && (
            <>
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl md:rounded-xl p-3.5 sm:p-5">
                  <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-slate-500 gap-1">
                    <span className="truncate">Turnout</span>
                    <span className="font-mono tabular-nums shrink-0">
                      {stats.voted_count}/{stats.total_voters}
                    </span>
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900">
                    {stats.completion_percentage.toFixed(1)}%
                  </div>
                  <div className="mt-2.5 sm:mt-3 w-full h-2 bg-rose-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${Math.min(100, stats.completion_percentage)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white border border-emerald-200 rounded-2xl md:rounded-xl p-3.5 sm:p-5">
                  <div className="text-[11px] sm:text-xs font-medium text-emerald-800">
                    Voted (Green)
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-700">
                    {stats.voted_count}
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 hidden sm:block">
                    Verified and locked against re-voting
                  </div>
                </div>

                <div className="bg-white border border-rose-200 rounded-2xl md:rounded-xl p-3.5 sm:p-5">
                  <div className="text-[11px] sm:text-xs font-medium text-rose-800">
                    Remaining (Red)
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-rose-700">
                    {stats.remaining_count}
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 tabular-nums">
                    {stats.dead_count} marked dead
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl md:rounded-xl p-3.5 sm:p-5">
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500">
                    Total Roll
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900">
                    {stats.total_voters}
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 tabular-nums">
                    {stats.duplicate_attempts_blocked} fraud blocks
                  </div>
                </div>
              </section>

              <QuickCheckPanel
                voters={voters}
                isBoothLocked={activeBooth.is_locked}
                officerRole={session.officer.role}
                busyVoterId={busyVoterId}
                onMarkVoted={handleMarkVoted}
                onRequestMarkDead={(v) => setDeadTarget(v)}
                onRequestRevert={(v) => setRevertTarget(v)}
              />

              <VoterRollTable
                voters={voters}
                isBoothLocked={activeBooth.is_locked}
                officerRole={session.officer.role}
                busyVoterId={busyVoterId}
                onMarkVoted={handleMarkVoted}
                onRequestMarkDead={(v) => setDeadTarget(v)}
                onRequestRevert={(v) => setRevertTarget(v)}
                onOpenImport={() => selectTab('import')}
              />
            </>
          )}

          {activeTab === 'report' && (
            <EndOfDayReportView
              boothId={activeBooth.id}
              officerRole={session.officer.role}
              statsTrigger={reportRefreshTick}
              onBoothLockChanged={(updatedBooth, entry) => {
                setBooth(updatedBooth);
                setAuditLogs((prev) => [entry, ...prev]);
              }}
            />
          )}

          {activeTab === 'audit' && <AuditLogView logs={auditLogs} />}

          {activeTab === 'import' && (
            <ImportRollView
              boothId={activeBooth.id}
              isBoothLocked={activeBooth.is_locked}
              currentVoterCount={voters.length}
              onImportSuccess={({ voters: newVoters, stats: newStats, auditEntry }) => {
                setVoters(newVoters);
                setStats(newStats);
                setAuditLogs((prev) => [auditEntry, ...prev]);
                setBannerAlert({
                  kind: 'success',
                  message: `Imported ${newVoters.length} registered voters into ${activeBooth.id}.`,
                });
              }}
              onDone={() => selectTab('checkin')}
            />
          )}
        </main>
      </div>

      <RevertModal
        voter={revertTarget}
        onClose={() => setRevertTarget(null)}
        onConfirm={handleRevertConfirm}
      />

      <MarkDeadModal
        voter={deadTarget}
        officerName={session.officer.full_name}
        officerRole={session.officer.role}
        onClose={() => setDeadTarget(null)}
        onConfirm={handleMarkDeadConfirm}
      />

      {/* Mobile Stable Anchored Thumb-Zone Bottom Tab Bar */}
      <nav
        aria-label="Mobile Booth Navigation"
        className="md:hidden shrink-0 w-full z-40 bg-white border-t border-slate-200 shadow-[0_-1px_3px_rgba(15,23,42,0.05)] pb-[env(safe-area-inset-bottom)] select-none no-print"
      >
        <div className="h-16 w-full grid grid-cols-4 items-stretch">
          <button
            type="button"
            onClick={() => selectTab('checkin')}
            className={`relative h-full w-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'checkin' ? 'text-slate-900' : 'text-slate-500 active:text-slate-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 inset-x-3 h-0.5 rounded-b-full transition-colors ${
                activeTab === 'checkin' ? 'bg-slate-900' : 'bg-transparent'
              }`}
            />
            <Users className="w-5 h-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none whitespace-nowrap">Check-In</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('report')}
            className={`relative h-full w-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'report' ? 'text-slate-900' : 'text-slate-500 active:text-slate-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 inset-x-3 h-0.5 rounded-b-full transition-colors ${
                activeTab === 'report' ? 'bg-slate-900' : 'bg-transparent'
              }`}
            />
            <BarChart3 className="w-5 h-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none whitespace-nowrap">Report</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('audit')}
            className={`relative h-full w-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'audit' ? 'text-slate-900' : 'text-slate-500 active:text-slate-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 inset-x-3 h-0.5 rounded-b-full transition-colors ${
                activeTab === 'audit' ? 'bg-slate-900' : 'bg-transparent'
              }`}
            />
            <ClipboardList className="w-5 h-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none whitespace-nowrap">Audit</span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('import')}
            className={`relative h-full w-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'import' ? 'text-slate-900' : 'text-slate-500 active:text-slate-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 inset-x-3 h-0.5 rounded-b-full transition-colors ${
                activeTab === 'import' ? 'bg-slate-900' : 'bg-transparent'
              }`}
            />
            <FileSpreadsheet className="w-5 h-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none whitespace-nowrap">Import</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
