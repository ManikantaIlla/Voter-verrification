import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Lock,
  Unlock,
  Download,
  RefreshCw,
} from 'lucide-react';
import {
  apiFetch,
  downloadAuthenticatedFile,
  formatDateTime,
} from '../lib/api';
import type { AuditEntry, BoothSummary, EndOfDayReport, OfficerRole } from '../types/election';

interface EndOfDayReportViewProps {
  boothId: string;
  officerRole: OfficerRole;
  statsTrigger: number;
  onBoothLockChanged: (booth: BoothSummary, auditEntry: AuditEntry) => void;
}

export const EndOfDayReportView: React.FC<EndOfDayReportViewProps> = ({
  boothId,
  officerRole,
  statsTrigger,
  onBoothLockChanged,
}) => {
  const [report, setReport] = useState<EndOfDayReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const loadReport = async () => {
    setError('');
    try {
      const data = await apiFetch<EndOfDayReport>(
        `/api/booths/${encodeURIComponent(boothId)}/report`
      );
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, [boothId, statsTrigger]);

  const handleTogglePollLock = async () => {
    if (!report) return;
    setError('');
    setActionBusy(true);
    try {
      const endpoint = report.booth.is_locked ? 'reopen-poll' : 'close-poll';
      const res = await apiFetch<{ booth: BoothSummary; auditEntry: AuditEntry }>(
        `/api/booths/${encodeURIComponent(boothId)}/${endpoint}`,
        { method: 'POST' }
      );
      onBoothLockChanged(res.booth, res.auditEntry);
      await loadReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setError('');
    try {
      await downloadAuthenticatedFile(
        `/api/booths/${encodeURIComponent(boothId)}/report/export?format=${format}`,
        `${boothId}_end_of_day_report.${format}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  if (loading && !report) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
        Compiling end-of-day booth turnout summary...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-rose-700">
        {error || 'Report unavailable.'}
      </div>
    );
  }

  const maxHourly = Math.max(1, ...report.hourly_turnout.map((h) => h.count));

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 print-break-inside-avoid">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Official Booth Turnout &amp; Integrity Certificate
            </p>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              {report.booth.id} · {report.booth.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>{report.booth.election_title}</span>
              <span aria-hidden="true">·</span>
              <span>{report.booth.constituency}</span>
              <span aria-hidden="true">·</span>
              <span>
                Status:{' '}
                <strong className="text-slate-900">
                  {report.booth.is_locked ? 'Closed & Locked' : 'Active Poll Open'}
                </strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 no-print shrink-0">
            <button
              type="button"
              onClick={() => void loadReport()}
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExport('xlsx')}
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExport('csv')}
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl sm:rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
            {officerRole === 'Presiding Officer' && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleTogglePollLock()}
                className={`col-span-2 sm:col-span-1 min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl sm:rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  report.booth.is_locked
                    ? 'text-slate-900 bg-amber-100 border border-amber-300 hover:bg-amber-200'
                    : 'text-white bg-rose-700 hover:bg-rose-800'
                }`}
              >
                {report.booth.is_locked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Reopen Poll</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Close &amp; Lock Poll</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800">
            {error}
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="p-4 border border-slate-200 rounded-lg">
            <div className="text-xs font-medium text-slate-500">Total Registered</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {report.stats.total_voters}
            </div>
          </div>
          <div className="p-4 border border-emerald-200 bg-emerald-50/60 rounded-lg">
            <div className="text-xs font-medium text-emerald-800">Votes Completed</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-800">
              {report.stats.voted_count}
            </div>
          </div>
          <div className="p-4 border border-rose-200 bg-rose-50/60 rounded-lg">
            <div className="text-xs font-medium text-rose-800">Remaining (Not Voted)</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-rose-800">
              {report.stats.remaining_count}
            </div>
          </div>
          <div className="p-4 border border-slate-300 bg-slate-100/80 rounded-lg">
            <div className="text-xs font-medium text-slate-700">Marked Dead</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {report.stats.dead_count}
            </div>
          </div>
          <div className="p-4 border border-slate-200 rounded-lg">
            <div className="text-xs font-medium text-slate-500">Turnout Completed</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {report.stats.completion_percentage.toFixed(1)}%
            </div>
          </div>
          <div className="p-4 border border-slate-200 rounded-lg">
            <div className="text-xs font-medium text-slate-500">Blocked Attempts</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {report.stats.duplicate_attempts_blocked}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
            <span>Final Turnout Progress</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {report.stats.voted_count} / {report.stats.total_voters} (
              {report.stats.completion_percentage.toFixed(2)}%)
            </span>
          </div>
          <div className="w-full h-3 bg-rose-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${Math.min(100, report.stats.completion_percentage)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-6 print-break-inside-avoid">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Turnout by Gender</h3>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[340px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 pr-2">Gender</th>
                  <th className="py-2 text-right px-2">Registered</th>
                  <th className="py-2 text-right px-2">Voted</th>
                  <th className="py-2 text-right px-2">Remaining</th>
                  <th className="py-2 text-right pl-2">Turnout %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums font-mono">
                {report.gender_breakdown.map((row) => (
                  <tr key={row.gender}>
                    <td className="py-2.5 pr-2 font-sans font-medium text-slate-900">{row.gender}</td>
                    <td className="py-2.5 text-right px-2">{row.total}</td>
                    <td className="py-2.5 text-right px-2 text-emerald-700 font-semibold">{row.voted}</td>
                    <td className="py-2.5 text-right px-2 text-rose-700">{row.remaining}</td>
                    <td className="py-2.5 text-right pl-2 font-semibold">{row.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-6 print-break-inside-avoid">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Turnout by Age Group</h3>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[320px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 pr-2">Age Bracket</th>
                  <th className="py-2 text-right px-2">Registered</th>
                  <th className="py-2 text-right px-2">Voted</th>
                  <th className="py-2 text-right pl-2">Turnout %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums font-mono">
                {report.age_breakdown.map((row) => (
                  <tr key={row.bracket}>
                    <td className="py-2.5 pr-2 font-sans font-medium text-slate-900">{row.bracket} yrs</td>
                    <td className="py-2.5 text-right px-2">{row.total}</td>
                    <td className="py-2.5 text-right px-2 text-emerald-700 font-semibold">{row.voted}</td>
                    <td className="py-2.5 text-right pl-2 font-semibold">{row.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-6 print-break-inside-avoid">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Hourly Polling Velocity</h3>
          {report.hourly_turnout.length === 0 ? (
            <p className="text-xs text-slate-500">No votes recorded yet today.</p>
          ) : (
            <div className="space-y-3">
              {report.hourly_turnout.map((h) => (
                <div key={h.hour} className="flex items-center gap-2.5 sm:gap-3 text-xs">
                  <span className="font-mono tabular-nums text-slate-600 w-12 sm:w-14 shrink-0">
                    {h.hour}
                  </span>
                  <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-slate-900 rounded"
                      style={{ width: `${Math.max(4, (h.count / maxHourly) * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 w-20 sm:w-24 text-right shrink-0">
                    +{h.count} ({h.cumulative})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-6 print-break-inside-avoid">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            Officer Verification Breakdown
          </h3>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[360px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 pr-2">Officer</th>
                  <th className="py-2 px-2">Role</th>
                  <th className="py-2 text-right px-2">Voted</th>
                  <th className="py-2 text-right px-2">Dead Marked</th>
                  <th className="py-2 text-right pl-2">Blocked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.officer_activity.map((o) => (
                  <tr key={o.officer_id}>
                    <td className="py-2.5 pr-2 font-medium text-slate-900">{o.officer_name}</td>
                    <td className="py-2.5 px-2 text-slate-600">{o.role}</td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {o.votes_verified}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {o.dead_marked}
                    </td>
                    <td className="py-2.5 pl-2 text-right font-mono tabular-nums text-rose-700">
                      {o.duplicates_blocked}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Generated at <span className="font-mono">{formatDateTime(report.generated_at)}</span>
            {report.booth.closed_at && (
              <>
                {' · '}Poll closed at{' '}
                <span className="font-mono">{formatDateTime(report.booth.closed_at)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Deceased Voters Ledger with Officer Attribution */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-6 print-break-inside-avoid">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Deceased Voters Ledger (Marked Dead)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Audit projection of every voter marked Dead and the booth officer who certified it
            </p>
          </div>
          <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums shrink-0">
            {report.dead_voters.length} marked
          </span>
        </div>

        {report.dead_voters.length === 0 ? (
          <p className="text-xs text-slate-500">No voters marked as Dead in this booth.</p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[520px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 pr-2">Serial #</th>
                  <th className="py-2 px-2">Voter ID</th>
                  <th className="py-2 px-2">Voter Name</th>
                  <th className="py-2 px-2">Marked Dead By</th>
                  <th className="py-2 px-2">Timestamp</th>
                  <th className="py-2 pl-2">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.dead_voters.map((v) => (
                  <tr key={v.id}>
                    <td className="py-2.5 pr-2 font-mono font-semibold text-slate-900 tabular-nums">
                      #{v.serial_no}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-slate-700">{v.voter_id}</td>
                    <td className="py-2.5 px-2 font-medium text-slate-900">{v.full_name}</td>
                    <td className="py-2.5 px-2 font-semibold text-slate-900">
                      {v.marked_dead_by_officer_name ?? 'Booth Officer'}
                      {v.marked_dead_by_officer_role ? (
                        <span className="font-normal text-slate-500">
                          {' '}
                          ({v.marked_dead_by_officer_role})
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-2 font-mono tabular-nums text-slate-600">
                      {formatDateTime(v.marked_dead_at)}
                    </td>
                    <td className="py-2.5 pl-2 text-slate-600">{v.dead_note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
