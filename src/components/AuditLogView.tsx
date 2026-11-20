import React from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  RotateCcw,
  FileSpreadsheet,
  UserCheck,
  Lock,
  UserX,
} from 'lucide-react';
import { formatDateTime } from '../lib/api';
import type { AuditAction, AuditEntry } from '../types/election';

interface AuditLogViewProps {
  logs: AuditEntry[];
}

function getActionMeta(action: AuditAction): { label: string; toneClass: string } {
  switch (action) {
    case 'MARK_VOTED':
      return { label: 'Vote Verified', toneClass: 'text-emerald-800' };
    case 'MARK_DEAD':
      return { label: 'Marked Dead', toneClass: 'text-slate-900 font-semibold' };
    case 'DUPLICATE_BLOCKED':
      return { label: 'Duplicate Blocked', toneClass: 'text-rose-800 font-semibold' };
    case 'DEAD_VOTER_BLOCKED':
      return { label: 'Dead Voter Blocked', toneClass: 'text-rose-800 font-semibold' };
    case 'REVERT_VOTE':
      return { label: 'Status Reverted', toneClass: 'text-amber-800 font-semibold' };
    case 'ROLL_UPLOADED':
      return { label: 'Roll Imported', toneClass: 'text-slate-900' };
    case 'POLL_CLOSED':
      return { label: 'Poll Closed', toneClass: 'text-rose-800 font-semibold' };
    case 'POLL_REOPENED':
      return { label: 'Poll Reopened', toneClass: 'text-amber-800' };
    case 'OFFICER_LOGIN':
      return { label: 'Officer Login', toneClass: 'text-slate-700' };
    case 'OFFICER_LOGOUT':
      return { label: 'Officer Logout', toneClass: 'text-slate-500' };
  }
}

function renderActionIcon(action: AuditAction) {
  switch (action) {
    case 'MARK_VOTED':
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
    case 'MARK_DEAD':
      return <UserX className="w-4 h-4 text-slate-800 shrink-0" />;
    case 'DUPLICATE_BLOCKED':
    case 'DEAD_VOTER_BLOCKED':
      return <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />;
    case 'REVERT_VOTE':
      return <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />;
    case 'ROLL_UPLOADED':
      return <FileSpreadsheet className="w-4 h-4 text-slate-700 shrink-0" />;
    case 'POLL_CLOSED':
    case 'POLL_REOPENED':
      return <Lock className="w-4 h-4 text-slate-700 shrink-0" />;
    default:
      return <UserCheck className="w-4 h-4 text-slate-500 shrink-0" />;
  }
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl md:rounded-xl overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Booth Audit &amp; Fraud Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Append-only log of verifications, blocked duplicates, logins, and poll closures
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
          {logs.length} events
        </span>
      </div>

      {logs.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">No activity recorded yet.</div>
      ) : (
        <>
          {/* Mobile Stacked Feed (< md) */}
          <div className="md:hidden divide-y divide-slate-200">
            {logs.map((entry) => {
              const meta = getActionMeta(entry.action);
              const isAlert =
                entry.action === 'DUPLICATE_BLOCKED' || entry.action === 'DEAD_VOTER_BLOCKED';
              return (
                <div
                  key={entry.id}
                  className={`p-4 space-y-1.5 text-xs ${isAlert ? 'bg-rose-50/70' : 'bg-white'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 ${meta.toneClass}`}>
                      {renderActionIcon(entry.action)}
                      <span>{meta.label}</span>
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">
                      {formatDateTime(entry.created_at)}
                    </span>
                  </div>
                  {entry.voter_name && (
                    <div className="font-medium text-slate-900">
                      {entry.voter_name}{' '}
                      <span className="font-mono text-slate-600">
                        (#{entry.serial_no} · {entry.voter_id})
                      </span>
                    </div>
                  )}
                  <div className="text-slate-600">{entry.details}</div>
                  {entry.officer_name && (
                    <div className="text-[11px] font-medium text-slate-700">
                      Recorded by {entry.officer_name}
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
                  <th className="py-2.5 px-4 whitespace-nowrap">Timestamp</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Event</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Voter</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Officer</th>
                  <th className="py-2.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.map((entry) => {
                  const meta = getActionMeta(entry.action);
                  const isAlert =
                    entry.action === 'DUPLICATE_BLOCKED' || entry.action === 'DEAD_VOTER_BLOCKED';

                  return (
                    <tr
                      key={entry.id}
                      className={isAlert ? 'bg-rose-50/70' : 'bg-white hover:bg-slate-50/70'}
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatDateTime(entry.created_at)}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 ${meta.toneClass}`}>
                          {renderActionIcon(entry.action)}
                          <span>{meta.label}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {entry.voter_name ? (
                          <div>
                            <span className="font-medium text-slate-900">{entry.voter_name}</span>
                            <span className="text-slate-400"> · </span>
                            <span className="font-mono text-slate-600">
                              #{entry.serial_no} / {entry.voter_id}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
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
        </>
      )}
    </section>
  );
};
