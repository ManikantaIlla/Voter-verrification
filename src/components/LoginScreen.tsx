import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, UserPlus, LogIn, ArrowRight, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { AdminSession, AuthSession, BoothSummary, OfficerRole } from '../types/election';

interface LoginScreenProps {
  onAuthenticated: (session: AuthSession) => void;
  onAdminAuthenticated: (session: AdminSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onAuthenticated,
  onAdminAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'admin' | 'create'>('login');
  const [booths, setBooths] = useState<BoothSummary[]>([]);
  const [selectedBoothId, setSelectedBoothId] = useState<string>('');
  const [username, setUsername] = useState<string>('officer1');
  const [passcode, setPasscode] = useState<string>('1001');
  const [adminUsername, setAdminUsername] = useState<string>('admin');
  const [adminPasscode, setAdminPasscode] = useState<string>('9999');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Create booth state (1 to 2 logins)
  const [newBoothId, setNewBoothId] = useState<string>('');
  const [newBoothName, setNewBoothName] = useState<string>('');
  const [newConstituency, setNewConstituency] = useState<string>('');
  const [newElectionTitle, setNewElectionTitle] = useState<string>('Municipal General Election 2026');
  const [loginSlotsCount, setLoginSlotsCount] = useState<1 | 2>(2);

  const [off1Username, setOff1Username] = useState<string>('presiding1');
  const [off1Name, setOff1Name] = useState<string>('');
  const [off1Pin, setOff1Pin] = useState<string>('');

  const [off2Username, setOff2Username] = useState<string>('polling2');
  const [off2Name, setOff2Name] = useState<string>('');
  const [off2Pin, setOff2Pin] = useState<string>('');

  const loadBooths = async () => {
    try {
      const data = await apiFetch<{ booths: BoothSummary[] }>('/api/booths', {}, null);
      setBooths(data.booths);
      if (data.booths.length > 0 && !selectedBoothId) {
        setSelectedBoothId(data.booths[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load booths.');
    }
  };

  useEffect(() => {
    void loadBooths();
  }, []);

  const selectedBooth = booths.find((b) => b.id === selectedBoothId);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await apiFetch<AuthSession>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            boothId: selectedBoothId,
            username,
            passcode,
          }),
        },
        null
      );
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const session = await apiFetch<AdminSession>(
        '/api/admin/login',
        {
          method: 'POST',
          body: JSON.stringify({
            username: adminUsername,
            passcode: adminPasscode,
          }),
        },
        null
      );
      onAdminAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBooth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

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
      const res = await apiFetch<{ booth: BoothSummary }>(
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
      await loadBooths();
      setSelectedBoothId(res.booth.id);
      setUsername(off1Username);
      setPasscode(off1Pin);
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create booth.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-8">
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <ShieldCheck className="w-5 h-5 text-slate-900" />
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 font-display">
            BoothGuard
          </span>
        </div>
        <div className="hidden lg:flex items-center gap-6 text-sm text-slate-600">
          <span>Booth-Level Voter Verification</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span>1–2 Officer Logins Per Booth</span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span>Embedded SQLite Storage</span>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setError('');
              setMode(mode === 'admin' ? 'login' : 'admin');
            }}
            className="min-h-[40px] px-3 sm:px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="sm:hidden">{mode === 'admin' ? 'Officer' : 'Ward Admin'}</span>
            <span className="hidden sm:inline">
              {mode === 'admin' ? 'Booth Officer Sign-In' : 'Ward Admin Dashboard'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setMode(mode === 'create' ? 'login' : 'create');
            }}
            className="min-h-[40px] px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="sm:hidden">{mode === 'create' ? 'Sign In' : 'New Booth'}</span>
            <span className="hidden sm:inline">
              {mode === 'create' ? 'Back to Sign-In' : 'Register New Booth'}
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        <section className="order-2 lg:order-1 lg:col-span-5 space-y-5">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">
              Booth Election Integrity Terminal
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight [text-wrap:balance]">
              Fraud-free voter check-in with live dual-officer sync
            </h1>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Authorize up to two election officers per polling booth, upload your CSV or Excel
              electoral roll, verify voters instantly by Serial Number or Voter ID, and export the
              end-of-day turnout report.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Built-in Fraud Prevention Controls
            </h2>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs font-semibold text-slate-900 mt-0.5">01.</span>
                <span>
                  <strong className="font-medium text-slate-900">1–2 Logins Per Booth:</strong>{' '}
                  Strict per-booth login cap with live officer presence visibility.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs font-semibold text-slate-900 mt-0.5">02.</span>
                <span>
                  <strong className="font-medium text-slate-900">Atomic Double-Vote Lock:</strong>{' '}
                  Once marked green (Voted), duplicate attempts by either terminal are blocked and
                  logged immediately.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs font-semibold text-slate-900 mt-0.5">03.</span>
                <span>
                  <strong className="font-medium text-slate-900">Real-Time Turnout Ledger:</strong>{' '}
                  Live percentage completed, voted count, remaining count, and end-of-day Excel/PDF
                  summary.
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Sample Booth Ready for Testing
              </span>
              <span className="text-xs font-mono text-slate-500">BOOTH-042 · 40 Voters</span>
            </div>
            <p className="text-xs text-slate-600">
              Open a second browser tab with Officer 2 to see real-time green/red status updates and
              duplicate-vote blocking across both terminals.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSelectedBoothId('BOOTH-042');
                  setUsername('officer1');
                  setPasscode('1001');
                  setError('');
                }}
                className="px-3 py-2 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900">Officer 1</div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">
                  officer1 / 1001
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSelectedBoothId('BOOTH-042');
                  setUsername('officer2');
                  setPasscode('1002');
                  setError('');
                }}
                className="px-3 py-2 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900">Officer 2</div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">
                  officer2 / 1002
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('admin');
                  setAdminUsername('admin');
                  setAdminPasscode('9999');
                  setError('');
                }}
                className="px-3 py-2 text-left border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900">Ward Admin</div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">
                  admin / 9999
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2 lg:col-span-7 space-y-4">
          <div className="lg:hidden bg-white border border-slate-200 rounded-2xl p-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2 px-1">
              <span className="font-semibold text-slate-900">Quick Demo Sign-In</span>
              <span className="font-mono">BOOTH-042 · Ward 12</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSelectedBoothId('BOOTH-042');
                  setUsername('officer1');
                  setPasscode('1001');
                  setError('');
                }}
                className="min-h-[44px] px-2.5 py-2 text-left border border-slate-200 rounded-xl bg-slate-50 active:bg-slate-100 cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900">Officer 1</div>
                <div className="text-[11px] font-mono text-slate-500 truncate">officer1</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSelectedBoothId('BOOTH-042');
                  setUsername('officer2');
                  setPasscode('1002');
                  setError('');
                }}
                className="min-h-[44px] px-2.5 py-2 text-left border border-slate-200 rounded-xl bg-slate-50 active:bg-slate-100 cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900">Officer 2</div>
                <div className="text-[11px] font-mono text-slate-500 truncate">officer2</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('admin');
                  setAdminUsername('admin');
                  setAdminPasscode('9999');
                  setError('');
                }}
                className="min-h-[44px] px-2.5 py-2 text-left border border-slate-200 rounded-xl bg-slate-50 active:bg-slate-100 cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-900">Ward Admin</div>
                <div className="text-[11px] font-mono text-slate-500 truncate">admin</div>
              </button>
            </div>
          </div>

          {mode === 'admin' ? (
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-5 sm:p-7">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Ward Admin Command Sign-In
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Monitor overall ward turnout, booth-wise real-time stats, and assigned booth
                    incharges
                  </p>
                </div>
                <Lock className="w-5 h-5 text-slate-400" />
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleAdminLogin} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="admin-username"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Admin Username
                    </label>
                    <input
                      id="admin-username"
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="admin"
                      required
                      className="w-full h-12 sm:h-11 px-3.5 text-base sm:text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="admin-passcode"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Admin Passcode / PIN
                    </label>
                    <input
                      id="admin-passcode"
                      type="password"
                      value={adminPasscode}
                      onChange={(e) => setAdminPasscode(e.target.value)}
                      placeholder="Enter PIN"
                      required
                      className="w-full h-12 sm:h-11 px-3.5 text-base sm:text-sm font-mono bg-white border border-slate-300 rounded-xl sm:rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('login');
                    }}
                    className="min-h-[44px] sm:min-h-0 text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
                  >
                    Switch to Booth Officer Sign-In
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl sm:rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Signing In...' : 'Open Ward Admin Dashboard'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : mode === 'login' ? (
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-5 sm:p-7">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Booth Officer Sign-In</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select your assigned polling booth and enter your officer credentials
                  </p>
                </div>
                <Lock className="w-5 h-5 text-slate-400" />
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label
                    htmlFor="booth-select"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Polling Booth
                  </label>
                  <select
                    id="booth-select"
                    value={selectedBoothId}
                    onChange={(e) => setSelectedBoothId(e.target.value)}
                    required
                    className="w-full h-12 sm:h-11 px-3.5 text-base sm:text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  >
                    {booths.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.name} ({b.active_logins}/{b.max_officers} active logins)
                      </option>
                    ))}
                  </select>
                  {selectedBooth && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{selectedBooth.constituency}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedBooth.election_title}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {selectedBooth.active_logins} of {selectedBooth.max_officers} logins active
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="officer-username"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Officer Username
                    </label>
                    <input
                      id="officer-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. officer1"
                      required
                      className="w-full h-12 sm:h-11 px-3.5 text-base sm:text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="officer-passcode"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      Passcode / PIN
                    </label>
                    <input
                      id="officer-passcode"
                      type="password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Enter PIN"
                      required
                      className="w-full h-12 sm:h-11 px-3.5 text-base sm:text-sm font-mono bg-white border border-slate-300 rounded-xl sm:rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('create');
                    }}
                    className="min-h-[44px] sm:min-h-0 text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
                  >
                    Need a new booth setup?
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !selectedBoothId}
                    className="w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl sm:rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Signing In...' : 'Open Booth Terminal'}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-5 sm:p-7">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Register New Polling Booth
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure booth metadata and 1 or 2 authorized officer logins
                  </p>
                </div>
                <UserPlus className="w-5 h-5 text-slate-400" />
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateBooth} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Booth Code / ID
                    </label>
                    <input
                      type="text"
                      value={newBoothId}
                      onChange={(e) => setNewBoothId(e.target.value)}
                      placeholder="e.g. BOOTH-108"
                      required
                      className="w-full h-11 sm:h-10 px-3 text-base sm:text-sm font-mono bg-white border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Booth Location Name
                    </label>
                    <input
                      type="text"
                      value={newBoothName}
                      onChange={(e) => setNewBoothName(e.target.value)}
                      placeholder="e.g. Ward 8 Community Hall"
                      required
                      className="w-full h-11 sm:h-10 px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Constituency / Ward
                    </label>
                    <input
                      type="text"
                      value={newConstituency}
                      onChange={(e) => setNewConstituency(e.target.value)}
                      placeholder="e.g. Ward 8 North"
                      required
                      className="w-full h-11 sm:h-10 px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Election Title
                    </label>
                    <input
                      type="text"
                      value={newElectionTitle}
                      onChange={(e) => setNewElectionTitle(e.target.value)}
                      required
                      className="w-full h-11 sm:h-10 px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-semibold text-slate-900">
                        Authorized Booth Logins
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-slate-100 rounded-xl sm:rounded-lg">
                      <button
                        type="button"
                        onClick={() => setLoginSlotsCount(1)}
                        className={`min-h-[38px] sm:min-h-0 px-3 py-1.5 sm:py-1 text-xs font-medium rounded-lg sm:rounded-md transition-colors cursor-pointer ${
                          loginSlotsCount === 1
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        1 Officer Login
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoginSlotsCount(2)}
                        className={`min-h-[38px] sm:min-h-0 px-3 py-1.5 sm:py-1 text-xs font-medium rounded-lg sm:rounded-md transition-colors cursor-pointer ${
                          loginSlotsCount === 2
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        2 Officer Logins
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-lg space-y-3">
                      <div className="text-xs font-semibold text-slate-800">
                        Login 1 · Presiding Officer
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={off1Name}
                          onChange={(e) => setOff1Name(e.target.value)}
                          placeholder="Full Name"
                          required
                          className="h-11 sm:h-9 px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-lg sm:rounded-md"
                        />
                        <input
                          type="text"
                          value={off1Username}
                          onChange={(e) => setOff1Username(e.target.value)}
                          placeholder="Username"
                          required
                          className="h-11 sm:h-9 px-3 text-base sm:text-xs font-mono bg-white border border-slate-300 rounded-lg sm:rounded-md"
                        />
                        <input
                          type="password"
                          value={off1Pin}
                          onChange={(e) => setOff1Pin(e.target.value)}
                          placeholder="Passcode / PIN"
                          required
                          className="h-11 sm:h-9 px-3 text-base sm:text-xs font-mono bg-white border border-slate-300 rounded-lg sm:rounded-md"
                        />
                      </div>
                    </div>

                    {loginSlotsCount === 2 && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-lg space-y-3">
                        <div className="text-xs font-semibold text-slate-800">
                          Login 2 · Polling Officer
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <input
                            type="text"
                            value={off2Name}
                            onChange={(e) => setOff2Name(e.target.value)}
                            placeholder="Full Name"
                            required
                            className="h-11 sm:h-9 px-3 text-base sm:text-xs bg-white border border-slate-300 rounded-lg sm:rounded-md"
                          />
                          <input
                            type="text"
                            value={off2Username}
                            onChange={(e) => setOff2Username(e.target.value)}
                            placeholder="Username"
                            required
                            className="h-11 sm:h-9 px-3 text-base sm:text-xs font-mono bg-white border border-slate-300 rounded-lg sm:rounded-md"
                          />
                          <input
                            type="password"
                            value={off2Pin}
                            onChange={(e) => setOff2Pin(e.target.value)}
                            placeholder="Passcode / PIN"
                            required
                            className="h-11 sm:h-9 px-3 text-base sm:text-xs font-mono bg-white border border-slate-300 rounded-lg sm:rounded-md"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="min-h-[44px] sm:min-h-0 px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl sm:rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>{loading ? 'Creating Booth...' : 'Create Booth & Proceed'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
