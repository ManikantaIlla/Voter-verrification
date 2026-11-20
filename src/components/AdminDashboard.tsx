import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  LayoutGrid,
  Users,
  ClipboardList,
  LogOut,
  FileSpreadsheet,
  Download,
  Printer,
  AlertOctagon,
  CheckCircle2,
  Lock,
  Unlock,
  Plus,
  X,
} from 'lucide-react';
import {
  apiFetch,
  buildWsUrl,
  downloadAuthenticatedFile,
  formatDateTime,
  formatTime,
} from '../lib/api';
import type {
  AdminBoothItem,
  AdminDashboardState,
  AdminSession,
  BoothSummary,
  OfficerRole,
  WsServerEvent,
} from '../types/election';

interface AdminDashboardProps {
  session: AdminSession;
  onLogout: () => Promise<void>;
}

type AdminTab = 'overview' | 'incharges' | 'audit';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ session, onLogout }) => {
  const [dashboard, setDashboard] = useState<AdminDashboardState | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedWard, setSelectedWard] = useState<string>('ALL');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // Create booth modal state
  const [newBoothId, setNewBoothId] = useState<string>('');
  const [newBoothName, setNewBoothName] = useState<string>('');
  const [newConstituency, setNewConstituency] = useState<string>(
    'Assembly Constituency 14 · Ward 12'
  );
  const [newElectionTitle, setNewElectionTitle] = useState<string>(
    'Municipal General Election 2026'
  );
  const [loginSlotsCount, setLoginSlotsCount] = useState<1 | 2>(2);
  const [off1Name, setOff1Name] = useState<string>('');
  const [off1Username, setOff1Username] = useState<string>('');
  const [off1Pin, setOff1Pin] = useState<string>('');
  const [off2Name, setOff2Name] = useState<string>('');
  const [off2Username, setOff2Username] = useState<string>('');
  const [off2Pin, setOff2Pin] = useState<string>('');
  const [creatingBooth, setCreatingBooth] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);

  const selectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    if (mobileScrollRef.current) {
      mobileScrollRef.current.scrollTop = 0;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      try {
        const data = await apiFetch<AdminDashboardState>('/api/admin/dashboard');
        if (!cancelled) {
          setDashboard(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load Ward Admin dashboard.');
        }
      }
    };

    const connectWs = () => {
      if (cancelled) return;
      const ws = new WebSocket(buildWsUrl(session.token));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as WsServerEvent;
          if (payload.type === 'admin:init' || payload.type === 'admin:updated') {
            setDashboard(payload.state);
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
  }, [session.token]);

  const filteredBooths = useMemo<AdminBoothItem[]>(() => {
    if (!dashboard) return [];
    if (selectedWard === 'ALL') return dashboard.booths;
    return dashboard.booths.filter((b) => b.booth.constituency === selectedWard);
  }, [dashboard, selectedWard]);

  const filteredStats = useMemo(() => {
    if (!dashboard) {
      return {
        total_booths: 0,
        open_booths: 0,
        closed_booths: 0,
        total_voters: 0,
        voted_count: 0,
        dead_count: 0,
        remaining_count: 0,
        completion_percentage: 0,
        duplicate_attempts_blocked: 0,
        online_incharges: 0,
        total_incharges: 0,
      };
    }
    if (selectedWard === 'ALL') return dashboard.overall;

    let totalVoters = 0;
    let votedCount = 0;
    let deadCount = 0;
    let remainingCount = 0;
    let duplicates = 0;
    let openBooths = 0;
    let closedBooths = 0;
    let onlineIncharges = 0;
    let totalIncharges = 0;

    for (const item of filteredBooths) {
      totalVoters += item.stats.total_voters;
      votedCount += item.stats.voted_count;
      deadCount += item.stats.dead_count;
      remainingCount += item.stats.remaining_count;
      duplicates += item.stats.duplicate_attempts_blocked;
      if (item.booth.is_locked) closedBooths += 1;
      else openBooths += 1;
      totalIncharges += item.incharges.length;
      onlineIncharges += item.incharges.filter((i) => i.is_online || i.is_logged_in).length;
    }

    const pct = totalVoters > 0 ? Number(((votedCount / totalVoters) * 100).toFixed(2)) : 0;

    return {
      total_booths: filteredBooths.length,
      open_booths: openBooths,
      closed_booths: closedBooths,
      total_voters: totalVoters,
      voted_count: votedCount,
      dead_count: deadCount,
      remaining_count: remainingCount,
      completion_percentage: pct,
      duplicate_attempts_blocked: duplicates,
      online_incharges: onlineIncharges,
      total_incharges: totalIncharges,
    };
  }, [dashboard, filteredBooths, selectedWard]);

  const allIncharges = useMemo(() => {
    return filteredBooths.flatMap((item) =>
      item.incharges.map((inc) => ({
        ...inc,
        booth_name: item.booth.name,
        constituency: item.booth.constituency,
        booth_locked: item.booth.is_locked,
      }))
    );
  }, [filteredBooths]);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setError('');
    try {
      await downloadAuthenticatedFile(
        `/api/admin/export?format=${format}`,
        `ward_booth_summary.${format}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export ward summary.');
    }
  };

  const handleCreateBooth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreatingBooth(true);

    const officers: Array<{
      username: string;
      fullName: string;
      role: OfficerRole;
      passcode: string;
    }> = [
      {
        username: off1Username,
        fullName: off1Name || 'Presiding Officer',
        role: 'Presiding Officer',
        passcode: off1Pin,
      },
    ];

    if (loginSlotsCount === 2) {
      officers.push({
        username: off2Username,
        fullName: off2Name || 'Polling Officer',
        role: 'Polling Officer',
        passcode: off2Pin,
      });
    }

    try {
      await apiFetch<{ booth: BoothSummary }>(
        '/api/booths',
        {
          method: 'POST',
          body: JSON.stringify({
            id: newBoothId,
            name: newBoothName,
            constituency: newConstituency,
            electionTitle: newElectionTitle,
            officers,
          }),
        },
        null
      );
      setShowCreateModal(false);
      setNewBoothId('');
      setNewBoothName('');
      setOff1Name('');
      setOff1Username('');
      setOff1Pin('');
      setOff2Name('');
      setOff2Username('');
      setOff2Pin('');
      const refreshed = await apiFetch<AdminDashboardState>('/api/admin/dashboard');
      setDashboard(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create booth.');
    } finally {
      setCreatingBooth(false);
    }
  };

  return (
    <div className="h-[100dvh] md:h-auto md:min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col md:flex-row overflow-hidden md:overflow-visible print:h-auto print:overflow-visible">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col justify-between no-print">
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-slate-900 shrink-0" />
            <span className="text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
              BoothGuard Admin
            </span>
          </div>

          <div className="p-4 border-b border-slate-100">
            <div className="text-xs font-semibold text-slate-900">Ward Command Center</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Real-time multi-booth supervision
            </div>
            <div className="mt-2 text-xs">
              {wsConnected ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  Live Ward Sync Active
                </span>
              ) : (
                <span className="text-amber-700 font-medium">Reconnecting live sync...</span>
              )}
            </div>
          </div>

          <nav className="p-3 space-y-1" aria-label="Ward Admin Navigation">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span>Ward &amp; Booth Stats</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('incharges')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'incharges'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Booth Incharges</span>
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
              <span>Ward Fraud &amp; Audit Feed</span>
            </button>
          </nav>

          {dashboard && (
            <div className="px-4 py-3 mt-2 border-t border-slate-100 space-y-2 text-xs">
              <div className="font-semibold text-slate-700">Live Booth Coverage</div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Total Polling Booths</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {dashboard.overall.total_booths}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Incharges Active</span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                  {dashboard.overall.online_incharges}/{dashboard.overall.total_incharges}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Duplicates Blocked</span>
                <span className="font-mono tabular-nums font-semibold text-rose-700">
                  {dashboard.overall.duplicate_attempts_blocked}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200">
          <div className="text-xs font-medium text-slate-900 truncate">
            {session.admin.full_name}
          </div>
          <div className="text-[11px] text-slate-500 mb-3">{session.admin.title}</div>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out Admin</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div
        ref={mobileScrollRef}
        className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain md:overflow-visible print:overflow-visible"
      >
        <header className="shrink-0 h-14 md:h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-3 md:gap-6 no-print">
          <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
            <ShieldCheck className="w-4 h-4 text-slate-900 shrink-0 md:hidden" />
            <span className="font-semibold text-slate-900 whitespace-nowrap">Ward Command</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-slate-800 truncate">
              {activeTab === 'overview' && 'Ward & Booth Stats'}
              {activeTab === 'incharges' && 'Booth Incharges'}
              {activeTab === 'audit' && 'Audit Feed'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {dashboard && dashboard.wards.length > 0 && (
              <select
                value={selectedWard}
                onChange={(e) => setSelectedWard(e.target.value)}
                aria-label="Filter by Ward or Constituency"
                className="h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 hidden md:block"
              >
                <option value="ALL">All Wards ({dashboard.overall.total_booths} Booths)</option>
                {dashboard.wards.map((w) => (
                  <option key={w.constituency} value={w.constituency}>
                    {w.constituency} ({w.booth_count} Booths)
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Booth</span>
            </button>

            <button
              type="button"
              onClick={() => void handleExport('xlsx')}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Ward Excel</span>
            </button>

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
                onClick={() => void onLogout()}
                aria-label="Sign Out Admin"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto space-y-4 md:space-y-6">
          {/* Mobile Ward Controls */}
          {dashboard && (
            <div className="md:hidden flex flex-col gap-2.5 no-print">
              {dashboard.wards.length > 0 && (
                <select
                  value={selectedWard}
                  onChange={(e) => setSelectedWard(e.target.value)}
                  aria-label="Filter by Ward or Constituency"
                  className="w-full h-11 px-3 text-base bg-white border border-slate-300 rounded-xl text-slate-800"
                >
                  <option value="ALL">All Wards ({dashboard.overall.total_booths} Booths)</option>
                  {dashboard.wards.map((w) => (
                    <option key={w.constituency} value={w.constituency}>
                      {w.constituency} ({w.booth_count} Booths)
                    </option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Booth</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('xlsx')}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
              {error}
            </div>
          )}

          {!dashboard ? (
            <div className="bg-white border border-slate-200 rounded-2xl md:rounded-xl p-8 text-sm text-slate-500">
              Loading live ward telemetry and booth-wise statistics...
            </div>
          ) : (
            <>
              {/* Overall Ward KPI Strip (2x2 on mobile, 4-col on desktop) */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl md:rounded-xl p-3.5 sm:p-5">
                  <div className="flex items-center justify-between text-[11px] sm:text-xs font-medium text-slate-500 gap-1">
                    <span className="truncate">Ward Turnout</span>
                    <span className="font-mono tabular-nums shrink-0">
                      {filteredStats.voted_count}/{filteredStats.total_voters}
                    </span>
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900">
                    {filteredStats.completion_percentage.toFixed(1)}%
                  </div>
                  <div className="mt-2.5 sm:mt-3 w-full h-2 bg-rose-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, filteredStats.completion_percentage)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="bg-white border border-emerald-200 rounded-2xl md:rounded-xl p-3.5 sm:p-5">
                  <div className="text-[11px] sm:text-xs font-medium text-emerald-800">
                    Voted (Green)
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-700">
                    {filteredStats.voted_count}
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 hidden sm:block">
                    Verified across {filteredStats.total_booths} polling booths
                  </div>
                </div>

                <div className="bg-white border border-rose-200 rounded-2xl md:rounded-xl p-3.5 sm:p-5">
                  <div className="text-[11px] sm:text-xs font-medium text-rose-800">
                    Remaining (Red)
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-rose-700">
                    {filteredStats.remaining_count}
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 tabular-nums">
                    {filteredStats.dead_count} marked dead
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl md:rounded-xl p-3.5 sm:p-5">
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500">
                    Open Booths
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900">
                    {filteredStats.open_booths}
                    <span className="text-xs sm:text-sm font-normal text-slate-500">
                      {' '}
                      / {filteredStats.total_booths}
                    </span>
                  </div>
                  <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-slate-500 tabular-nums">
                    {filteredStats.online_incharges}/{filteredStats.total_incharges} incharges ·{' '}
                    {filteredStats.duplicate_attempts_blocked} blocks
                  </div>
                </div>
              </section>

              {activeTab === 'overview' && (
                <>
                  {/* Ward Summary Table */}
                  <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Overall Ward / Constituency Aggregation
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Live roll totals summed across all booths in each ward
                        </p>
                      </div>
                      <div className="flex items-center gap-2 no-print">
                        <button
                          type="button"
                          onClick={() => void handleExport('csv')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>CSV</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print</span>
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                            <th className="py-2.5 px-4">Ward / Constituency</th>
                            <th className="py-2.5 px-4 text-right">Booths</th>
                            <th className="py-2.5 px-4 text-right">Registered</th>
                            <th className="py-2.5 px-4 text-right">Voted (Green)</th>
                            <th className="py-2.5 px-4 text-right">Remaining (Red)</th>
                            <th className="py-2.5 px-4 text-right">Dead</th>
                            <th className="py-2.5 px-4 text-right">Turnout %</th>
                            <th className="py-2.5 px-4 text-right">Blocked</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 tabular-nums font-mono">
                          {dashboard.wards.map((w) => (
                            <tr key={w.constituency} className="bg-white hover:bg-slate-50">
                              <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                                {w.constituency}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {w.booth_count}{' '}
                                <span className="text-slate-400">({w.open_booths} open)</span>
                              </td>
                              <td className="py-3 px-4 text-right">{w.total_voters}</td>
                              <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                                {w.voted_count}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-rose-700">
                                {w.remaining_count}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-slate-800">
                                {w.dead_count}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-slate-900">
                                {w.completion_percentage.toFixed(1)}%
                              </td>
                              <td className="py-3 px-4 text-right text-slate-700">
                                {w.duplicate_attempts_blocked}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Booth-Wise Real-Time Stats & Booth Incharges */}
                  <section className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Booth-Wise Real-Time Status &amp; Booth Incharges
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Updates automatically whenever any booth officer verifies a voter
                        </p>
                      </div>

                      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit no-print">
                        <button
                          type="button"
                          onClick={() => setViewMode('cards')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                            viewMode === 'cards'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Booth Cards
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('table')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                            viewMode === 'table'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Comparison Table
                        </button>
                      </div>
                    </div>

                    {viewMode === 'cards' ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {filteredBooths.map(({ booth, stats, incharges }) => (
                          <div
                            key={booth.id}
                            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                          >
                            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold text-slate-900">
                                    {booth.id}
                                  </span>
                                  <span aria-hidden="true" className="text-slate-300">
                                    ·
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {booth.constituency}
                                  </span>
                                </div>
                                <h3 className="text-sm font-semibold text-slate-900 mt-1">
                                  {booth.name}
                                </h3>
                              </div>
                              <div className="shrink-0 text-xs font-medium">
                                {booth.is_locked ? (
                                  <span className="inline-flex items-center gap-1 text-rose-800">
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Closed</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-emerald-700">
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>Poll Open</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Real-time Green vs Red Bar */}
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-slate-600">Turnout Completion</span>
                                <span className="font-mono tabular-nums font-bold text-slate-900">
                                  {stats.completion_percentage.toFixed(1)}% ({stats.voted_count}/
                                  {stats.total_voters})
                                </span>
                              </div>
                              <div className="w-full h-2.5 bg-rose-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-600 transition-all duration-300"
                                  style={{
                                    width: `${Math.min(100, stats.completion_percentage)}%`,
                                  }}
                                />
                              </div>
                              <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div className="p-2 rounded-md bg-emerald-50 border border-emerald-200">
                                  <div className="text-[11px] text-emerald-800">Voted (Green)</div>
                                  <div className="font-mono tabular-nums font-bold text-emerald-700 text-sm">
                                    {stats.voted_count}
                                  </div>
                                </div>
                                <div className="p-2 rounded-md bg-rose-50 border border-rose-200">
                                  <div className="text-[11px] text-rose-800">Remaining (Red)</div>
                                  <div className="font-mono tabular-nums font-bold text-rose-700 text-sm">
                                    {stats.remaining_count}
                                  </div>
                                </div>
                                <div className="p-2 rounded-md bg-slate-100 border border-slate-300">
                                  <div className="text-[11px] text-slate-700">Dead</div>
                                  <div className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                                    {stats.dead_count}
                                  </div>
                                </div>
                                <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                                  <div className="text-[11px] text-slate-600">Fraud Blocked</div>
                                  <div className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                                    {stats.duplicate_attempts_blocked}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Booth Incharges List */}
                            <div className="pt-2 border-t border-slate-100">
                              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                                <span>Assigned Booth Incharges</span>
                                <span className="font-mono text-[11px] text-slate-500">
                                  Last vote: {formatTime(stats.last_vote_at)}
                                </span>
                              </div>
                              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                                {incharges.map((inc) => (
                                  <div
                                    key={inc.id}
                                    className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-medium text-slate-900 truncate">
                                        {inc.full_name}
                                      </div>
                                      <div className="text-[11px] text-slate-500">
                                        {inc.role} ·{' '}
                                        <span className="font-mono">{inc.username}</span>
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div
                                        className={`font-mono text-[11px] font-semibold ${
                                          inc.is_online
                                            ? 'text-emerald-700'
                                            : inc.is_logged_in
                                              ? 'text-amber-700'
                                              : 'text-slate-400'
                                        }`}
                                      >
                                        {inc.is_online
                                          ? 'Online'
                                          : inc.is_logged_in
                                            ? 'Signed In'
                                            : 'Offline'}
                                      </div>
                                      <div className="text-[11px] font-mono tabular-nums text-slate-600">
                                        {inc.votes_verified} voted
                                        {inc.dead_marked > 0 ? ` · ${inc.dead_marked} dead` : ''}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                                <th className="py-2.5 px-4">Booth</th>
                                <th className="py-2.5 px-4">Booth Incharges</th>
                                <th className="py-2.5 px-4 text-right">Registered</th>
                                <th className="py-2.5 px-4 text-right">Voted</th>
                                <th className="py-2.5 px-4 text-right">Dead</th>
                                <th className="py-2.5 px-4 text-right">Remaining</th>
                                <th className="py-2.5 px-4 text-right">Turnout %</th>
                                <th className="py-2.5 px-4 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {filteredBooths.map(({ booth, stats, incharges }) => (
                                <tr key={booth.id} className="bg-white hover:bg-slate-50">
                                  <td className="py-3 px-4">
                                    <div className="font-mono font-semibold text-slate-900">
                                      {booth.id}
                                    </div>
                                    <div className="text-slate-600">{booth.name}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="space-y-1">
                                      {incharges.map((inc) => (
                                        <div key={inc.id} className="flex flex-wrap items-center gap-1.5">
                                          <span className="font-medium text-slate-900">
                                            {inc.full_name}
                                          </span>
                                          <span className="text-slate-400">·</span>
                                          <span className="text-slate-500">{inc.role}</span>
                                          <span className="text-slate-400">·</span>
                                          <span
                                            className={`font-mono ${
                                              inc.is_online
                                                ? 'text-emerald-700 font-semibold'
                                                : inc.is_logged_in
                                                  ? 'text-amber-700'
                                                  : 'text-slate-400'
                                            }`}
                                          >
                                            {inc.is_online
                                              ? 'Online'
                                              : inc.is_logged_in
                                                ? 'Signed In'
                                                : 'Offline'}
                                          </span>
                                          {inc.dead_marked > 0 && (
                                            <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                              {inc.dead_marked} dead
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                                    {stats.total_voters}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                                    {stats.voted_count}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-700">
                                    {stats.dead_count}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-rose-700">
                                    {stats.remaining_count}
                                  </td>
                                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                                    {stats.completion_percentage.toFixed(1)}%
                                  </td>
                                  <td className="py-3 px-4 text-right whitespace-nowrap">
                                    {booth.is_locked ? 'Closed' : 'Open'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </section>
                </>
              )}

              {activeTab === 'incharges' && (
                <section className="bg-white border border-slate-200 rounded-2xl md:rounded-xl overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Booth Incharges &amp; Live Roster
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        1 to 2 authorized officers assigned per booth with live verification counts
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                      {allIncharges.length} total
                    </span>
                  </div>

                  {/* Mobile Cards (< md) */}
                  <div className="md:hidden divide-y divide-slate-200">
                    {allIncharges.map((inc) => (
                      <div key={inc.id} className="p-4 space-y-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-sm text-slate-900">
                              {inc.full_name}
                            </div>
                            <div className="text-slate-500">
                              {inc.role} · <span className="font-mono">{inc.username}</span>
                            </div>
                          </div>
                          <span
                            className={`font-mono font-semibold shrink-0 ${
                              inc.is_online
                                ? 'text-emerald-700'
                                : inc.is_logged_in
                                  ? 'text-amber-700'
                                  : 'text-slate-400'
                            }`}
                          >
                            {inc.is_online
                              ? 'Online'
                              : inc.is_logged_in
                                ? 'Signed In'
                                : 'Offline'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1 text-slate-600">
                          <span className="font-mono font-semibold text-slate-800">
                            {inc.booth_id}
                          </span>
                          <span className="font-mono tabular-nums">
                            <strong className="text-emerald-700">{inc.votes_verified}</strong>{' '}
                            voted ·{' '}
                            <strong className="text-slate-900">{inc.dead_marked}</strong> dead ·{' '}
                            <strong className="text-rose-700">{inc.duplicates_blocked}</strong>{' '}
                            blocked
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table (>= md) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-2.5 px-4">Booth</th>
                          <th className="py-2.5 px-4">Incharge Name</th>
                          <th className="py-2.5 px-4">Role</th>
                          <th className="py-2.5 px-4">Username</th>
                          <th className="py-2.5 px-4">Terminal Status</th>
                          <th className="py-2.5 px-4 text-right">Votes Verified</th>
                          <th className="py-2.5 px-4 text-right">Dead Marked</th>
                          <th className="py-2.5 px-4 text-right">Blocked</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {allIncharges.map((inc) => (
                          <tr key={inc.id} className="bg-white hover:bg-slate-50">
                            <td className="py-3 px-4">
                              <div className="font-mono font-semibold text-slate-900">
                                {inc.booth_id}
                              </div>
                              <div className="text-slate-500 truncate max-w-xs">
                                {inc.booth_name}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {inc.full_name}
                            </td>
                            <td className="py-3 px-4 text-slate-700">{inc.role}</td>
                            <td className="py-3 px-4 font-mono text-slate-600">{inc.username}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`font-mono font-semibold ${
                                  inc.is_online
                                    ? 'text-emerald-700'
                                    : inc.is_logged_in
                                      ? 'text-amber-700'
                                      : 'text-slate-400'
                                }`}
                              >
                                {inc.is_online
                                  ? 'Online (Live)'
                                  : inc.is_logged_in
                                    ? 'Signed In'
                                    : 'Offline'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                              {inc.votes_verified}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {inc.dead_marked}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-700">
                              {inc.duplicates_blocked}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {activeTab === 'audit' && (
                <section className="bg-white border border-slate-200 rounded-2xl md:rounded-xl overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Ward-Wide Fraud &amp; Activity Feed
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Real-time cross-booth log of verifications, blocked duplicates, and poll
                        events
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                      {dashboard.recent_audit_logs.length} events
                    </span>
                  </div>

                  {/* Mobile Stacked Feed (< md) */}
                  <div className="md:hidden divide-y divide-slate-200">
                    {dashboard.recent_audit_logs.map((entry) => {
                      const isFraud =
                        entry.action === 'DUPLICATE_BLOCKED' ||
                        entry.action === 'DEAD_VOTER_BLOCKED';
                      const isDeadMark = entry.action === 'MARK_DEAD';
                      return (
                        <div
                          key={entry.id}
                          className={`p-4 space-y-1.5 text-xs ${
                            isFraud ? 'bg-rose-50/75' : isDeadMark ? 'bg-slate-50' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold text-slate-900">
                              {entry.booth_id}
                            </span>
                            <span className="font-mono tabular-nums text-[11px] text-slate-500">
                              {formatDateTime(entry.created_at)}
                            </span>
                          </div>
                          <div>
                            {isFraud ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-rose-800">
                                <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                                <span>
                                  {entry.action === 'DEAD_VOTER_BLOCKED'
                                    ? 'Dead Voter Blocked'
                                    : 'Duplicate Blocked'}
                                </span>
                              </span>
                            ) : isDeadMark ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                                <AlertOctagon className="w-3.5 h-3.5 text-slate-700" />
                                <span>Marked Dead</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-slate-800 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{entry.action}</span>
                              </span>
                            )}
                          </div>
                          <div className="text-slate-600">{entry.details}</div>
                          {entry.officer_name && (
                            <div className="text-[11px] font-medium text-slate-700">
                              Recorded by: {entry.officer_name}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table (>= md) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-2.5 px-4">Timestamp</th>
                          <th className="py-2.5 px-4">Booth</th>
                          <th className="py-2.5 px-4">Event</th>
                          <th className="py-2.5 px-4">Incharge</th>
                          <th className="py-2.5 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {dashboard.recent_audit_logs.map((entry) => {
                          const isFraud =
                            entry.action === 'DUPLICATE_BLOCKED' ||
                            entry.action === 'DEAD_VOTER_BLOCKED';
                          const isDeadMark = entry.action === 'MARK_DEAD';
                          return (
                            <tr
                              key={entry.id}
                              className={
                                isFraud
                                  ? 'bg-rose-50/75'
                                  : isDeadMark
                                    ? 'bg-slate-50/90'
                                    : 'bg-white hover:bg-slate-50'
                              }
                            >
                              <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                {formatDateTime(entry.created_at)}
                              </td>
                              <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                                {entry.booth_id}
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                {isFraud ? (
                                  <span className="inline-flex items-center gap-1 font-semibold text-rose-800">
                                    <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                                    <span>
                                      {entry.action === 'DEAD_VOTER_BLOCKED'
                                        ? 'Dead Voter Blocked'
                                        : 'Duplicate Blocked'}
                                    </span>
                                  </span>
                                ) : isDeadMark ? (
                                  <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                                    <AlertOctagon className="w-3.5 h-3.5 text-slate-700" />
                                    <span>Marked Dead</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-800">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>{entry.action}</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                                {entry.officer_name ?? '—'}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600">{entry.details}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Stable Anchored Thumb-Zone Bottom Tab Bar */}
      <nav
        aria-label="Mobile Ward Admin Navigation"
        className="md:hidden shrink-0 w-full z-40 bg-white border-t border-slate-200 shadow-[0_-1px_3px_rgba(15,23,42,0.05)] pb-[env(safe-area-inset-bottom)] select-none no-print"
      >
        <div className="h-16 w-full grid grid-cols-3 items-stretch">
          <button
            type="button"
            onClick={() => selectTab('overview')}
            className={`relative h-full w-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'overview' ? 'text-slate-900' : 'text-slate-500 active:text-slate-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 inset-x-4 h-0.5 rounded-b-full transition-colors ${
                activeTab === 'overview' ? 'bg-slate-900' : 'bg-transparent'
              }`}
            />
            <LayoutGrid className="w-5 h-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none whitespace-nowrap">
              Ward Stats
            </span>
          </button>
          <button
            type="button"
            onClick={() => selectTab('incharges')}
            className={`relative h-full w-full flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              activeTab === 'incharges' ? 'text-slate-900' : 'text-slate-500 active:text-slate-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 inset-x-4 h-0.5 rounded-b-full transition-colors ${
                activeTab === 'incharges' ? 'bg-slate-900' : 'bg-transparent'
              }`}
            />
            <Users className="w-5 h-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none whitespace-nowrap">
              Incharges
            </span>
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
              className={`absolute top-0 inset-x-4 h-0.5 rounded-b-full transition-colors ${
                activeTab === 'audit' ? 'bg-slate-900' : 'bg-transparent'
              }`}
            />
            <ClipboardList className="w-5 h-5 shrink-0" />
            <span className="text-[11px] font-medium leading-none whitespace-nowrap">
              Audit Feed
            </span>
          </button>
        </div>
      </nav>

      {/* Add Booth Modal / Mobile Bottom Sheet */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-xl max-w-lg w-full p-6 pb-8 sm:pb-6 max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Add Polling Booth &amp; Incharges
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure a new booth with 1 or 2 authorized officer logins
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBooth} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Booth Code
                  </label>
                  <input
                    type="text"
                    value={newBoothId}
                    onChange={(e) => setNewBoothId(e.target.value)}
                    placeholder="e.g. BOOTH-045"
                    required
                    className="w-full h-11 sm:h-9 px-3 text-base sm:text-xs font-mono border border-slate-300 rounded-xl sm:rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Booth Name
                  </label>
                  <input
                    type="text"
                    value={newBoothName}
                    onChange={(e) => setNewBoothName(e.target.value)}
                    placeholder="e.g. Primary School West"
                    required
                    className="w-full h-11 sm:h-9 px-3 text-base sm:text-xs border border-slate-300 rounded-xl sm:rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ward / Constituency
                  </label>
                  <input
                    type="text"
                    value={newConstituency}
                    onChange={(e) => setNewConstituency(e.target.value)}
                    required
                    className="w-full h-11 sm:h-9 px-3 text-base sm:text-xs border border-slate-300 rounded-xl sm:rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Election Title
                  </label>
                  <input
                    type="text"
                    value={newElectionTitle}
                    onChange={(e) => setNewElectionTitle(e.target.value)}
                    required
                    className="w-full h-11 sm:h-9 px-3 text-base sm:text-xs border border-slate-300 rounded-xl sm:rounded-md"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-800">Booth Incharges</span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setLoginSlotsCount(1)}
                    className={`min-h-[36px] sm:min-h-0 px-3 py-1 text-xs rounded-md cursor-pointer ${
                      loginSlotsCount === 1 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    1 Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginSlotsCount(2)}
                    className={`min-h-[36px] sm:min-h-0 px-3 py-1 text-xs rounded-md cursor-pointer ${
                      loginSlotsCount === 2 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    2 Logins
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={off1Name}
                  onChange={(e) => setOff1Name(e.target.value)}
                  placeholder="Incharge 1 Name"
                  required
                  className="h-11 sm:h-9 px-3 text-base sm:text-xs border border-slate-300 rounded-xl sm:rounded-md"
                />
                <input
                  type="text"
                  value={off1Username}
                  onChange={(e) => setOff1Username(e.target.value)}
                  placeholder="Username"
                  required
                  className="h-11 sm:h-9 px-3 text-base sm:text-xs font-mono border border-slate-300 rounded-xl sm:rounded-md"
                />
                <input
                  type="password"
                  value={off1Pin}
                  onChange={(e) => setOff1Pin(e.target.value)}
                  placeholder="PIN"
                  required
                  className="h-11 sm:h-9 px-3 text-base sm:text-xs font-mono border border-slate-300 rounded-xl sm:rounded-md"
                />
              </div>

              {loginSlotsCount === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={off2Name}
                    onChange={(e) => setOff2Name(e.target.value)}
                    placeholder="Incharge 2 Name"
                    required
                    className="h-11 sm:h-9 px-3 text-base sm:text-xs border border-slate-300 rounded-xl sm:rounded-md"
                  />
                  <input
                    type="text"
                    value={off2Username}
                    onChange={(e) => setOff2Username(e.target.value)}
                    placeholder="Username"
                    required
                    className="h-11 sm:h-9 px-3 text-base sm:text-xs font-mono border border-slate-300 rounded-xl sm:rounded-md"
                  />
                  <input
                    type="password"
                    value={off2Pin}
                    onChange={(e) => setOff2Pin(e.target.value)}
                    placeholder="PIN"
                    required
                    className="h-11 sm:h-9 px-3 text-base sm:text-xs font-mono border border-slate-300 rounded-xl sm:rounded-md"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBooth}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl sm:rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  {creatingBooth ? 'Creating...' : 'Create Booth'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
