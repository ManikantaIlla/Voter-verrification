import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Search,
  Check,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  UserX,
} from 'lucide-react';
import { formatTime } from '../lib/api';
import type { OfficerRole, VoterRecord } from '../types/election';

interface VoterRollTableProps {
  voters: VoterRecord[];
  isBoothLocked: boolean;
  officerRole: OfficerRole;
  busyVoterId: number | null;
  onMarkVoted: (voter: VoterRecord) => Promise<void>;
  onRequestMarkDead: (voter: VoterRecord) => void;
  onRequestRevert: (voter: VoterRecord) => void;
  onOpenImport: () => void;
}

const PAGE_SIZE = 25;

export const VoterRollTable: React.FC<VoterRollTableProps> = ({
  voters,
  isBoothLocked,
  officerRole,
  busyVoterId,
  onMarkVoted,
  onRequestMarkDead,
  onRequestRevert,
  onOpenImport,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'NOT_VOTED' | 'VOTED' | 'DEAD'>('ALL');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const counts = useMemo(() => {
    let voted = 0;
    let dead = 0;
    for (const v of voters) {
      if (v.status === 'VOTED') voted += 1;
      else if (v.status === 'DEAD') dead += 1;
    }
    return {
      all: voters.length,
      voted,
      dead,
      notVoted: voters.length - voted - dead,
    };
  }, [voters]);

  const filteredVoters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return voters.filter((v) => {
      if (filter === 'VOTED' && v.status !== 'VOTED') return false;
      if (filter === 'NOT_VOTED' && v.status !== 'NOT_VOTED') return false;
      if (filter === 'DEAD' && v.status !== 'DEAD') return false;
      if (!q) return true;
      return (
        String(v.serial_no).includes(q) ||
        v.voter_id.toLowerCase().includes(q) ||
        v.full_name.toLowerCase().includes(q) ||
        v.guardian_name.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q) ||
        (v.marked_dead_by_officer_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [voters, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredVoters.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredVoters.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleFilterChange = (next: 'ALL' | 'NOT_VOTED' | 'VOTED' | 'DEAD') => {
    setFilter(next);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  if (voters.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl md:rounded-xl p-8 md:p-10 text-center">
        <h3 className="text-base font-semibold text-slate-900">No Electoral Roll Loaded</h3>
        <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
          Upload a CSV or Excel (.xlsx) spreadsheet containing registered voters for this booth to
          begin real-time verification.
        </p>
        <button
          type="button"
          onClick={onOpenImport}
          className="mt-5 min-h-[44px] px-5 py-2.5 text-sm md:text-xs font-semibold text-white bg-slate-900 rounded-xl md:rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Import CSV / Excel Roll
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl md:rounded-xl overflow-hidden">
      <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="grid grid-cols-4 sm:flex items-center gap-1 p-1 bg-slate-100 rounded-xl md:rounded-lg w-full sm:w-fit">
          <button
            type="button"
            onClick={() => handleFilterChange('ALL')}
            className={`min-h-[40px] sm:min-h-0 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg md:rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums text-center ${
              filter === 'ALL'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('NOT_VOTED')}
            className={`min-h-[40px] sm:min-h-0 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg md:rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums text-center ${
              filter === 'NOT_VOTED'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Red ({counts.notVoted})
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('VOTED')}
            className={`min-h-[40px] sm:min-h-0 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg md:rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums text-center ${
              filter === 'VOTED'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Green ({counts.voted})
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('DEAD')}
            className={`min-h-[40px] sm:min-h-0 px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-lg md:rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums text-center ${
              filter === 'DEAD'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dead ({counts.dead})
          </button>
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Filter by Serial, Voter ID, Name..."
            className="w-full h-11 md:h-9 pl-9 pr-3 text-base md:text-xs bg-slate-50 border border-slate-200 rounded-xl md:rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Mobile Touch-First Voter Cards (< md) */}
      <div className="md:hidden divide-y divide-slate-200">
        {pageRows.length === 0 ? (
          <div className="py-8 px-4 text-center text-sm text-slate-500">
            No voters match the current filter criteria.
          </div>
        ) : (
          pageRows.map((voter) => {
            const isVoted = voter.status === 'VOTED';
            const isDead = voter.status === 'DEAD';
            const isBusy = busyVoterId === voter.id;

            return (
              <div
                key={voter.id}
                className={`p-4 space-y-3 transition-colors ${
                  isVoted ? 'bg-emerald-50/60' : isDead ? 'bg-slate-100/90' : 'bg-rose-50/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="font-bold text-slate-900 tabular-nums">
                      #{voter.serial_no}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="font-semibold text-slate-700">{voter.voter_id}</span>
                  </div>
                  {isVoted ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Voted</span>
                    </span>
                  ) : isDead ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                      <UserX className="w-4 h-4 text-slate-700 shrink-0" />
                      <span>Dead</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Not Voted</span>
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-900">{voter.full_name}</div>
                  <div className="mt-0.5 text-xs text-slate-600">
                    {voter.guardian_name ? `C/O ${voter.guardian_name} · ` : ''}
                    <span className="tabular-nums">{voter.age ?? '—'} yrs</span> · {voter.gender}
                  </div>
                  {voter.address && (
                    <div className="mt-0.5 text-xs text-slate-500 truncate">{voter.address}</div>
                  )}
                </div>

                {isVoted ? (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="text-xs text-emerald-900">
                      <span className="font-mono tabular-nums">{formatTime(voter.voted_at)}</span>
                      <span className="text-emerald-700"> · </span>
                      <span>{voter.verified_by_officer_name ?? 'Officer'}</span>
                    </div>
                    {officerRole === 'Presiding Officer' && !isBoothLocked && (
                      <button
                        type="button"
                        onClick={() => onRequestRevert(voter)}
                        className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg active:scale-[0.98] cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Revert</span>
                      </button>
                    )}
                  </div>
                ) : isDead ? (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="text-xs text-slate-800 min-w-0">
                      <div className="font-semibold">
                        Marked Dead by {voter.marked_dead_by_officer_name ?? 'Officer'}
                        {voter.marked_dead_by_officer_role
                          ? ` (${voter.marked_dead_by_officer_role})`
                          : ''}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {formatTime(voter.marked_dead_at)}
                        {voter.dead_note ? ` · ${voter.dead_note}` : ''}
                      </div>
                    </div>
                    {officerRole === 'Presiding Officer' && !isBoothLocked && (
                      <button
                        type="button"
                        onClick={() => onRequestRevert(voter)}
                        className="min-h-[40px] shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg active:scale-[0.98] cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Revert</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBoothLocked || isBusy}
                      onClick={() => void onMarkVoted(voter)}
                      className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] rounded-xl disabled:opacity-50 transition-all cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isBusy ? 'Saving...' : 'Mark as Voted'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBoothLocked || isBusy}
                      onClick={() => onRequestMarkDead(voter)}
                      className="min-h-[44px] shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 active:scale-[0.98] rounded-xl disabled:opacity-50 transition-all cursor-pointer"
                    >
                      <UserX className="w-4 h-4 text-slate-700" />
                      <span>Dead</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop High-Density Data Grid (>= md) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-2.5 px-4 whitespace-nowrap">Serial #</th>
              <th className="py-2.5 px-4 whitespace-nowrap">Voter ID</th>
              <th className="py-2.5 px-4 whitespace-nowrap">Voter Name &amp; Guardian</th>
              <th className="py-2.5 px-4 whitespace-nowrap">Age / Gender</th>
              <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
              <th className="py-2.5 px-4 whitespace-nowrap">Verified Details</th>
              <th className="py-2.5 px-4 text-right whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No voters match the current filter criteria.
                </td>
              </tr>
            ) : (
              pageRows.map((voter) => {
                const isVoted = voter.status === 'VOTED';
                const isDead = voter.status === 'DEAD';
                const isBusy = busyVoterId === voter.id;

                return (
                  <tr
                    key={voter.id}
                    className={`transition-colors ${
                      isVoted
                        ? 'bg-emerald-50/55 hover:bg-emerald-50/90'
                        : isDead
                          ? 'bg-slate-100/80 hover:bg-slate-100'
                          : 'bg-rose-50/45 hover:bg-rose-50/85'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      #{voter.serial_no}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-800 whitespace-nowrap">
                      {voter.voter_id}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-900">{voter.full_name}</div>
                      <div className="text-slate-500 truncate max-w-xs">
                        {voter.guardian_name ? `C/O ${voter.guardian_name}` : ''}
                        {voter.guardian_name && voter.address ? ' · ' : ''}
                        {voter.address}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap tabular-nums">
                      {voter.age ?? '—'} · {voter.gender}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {isVoted ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Voted</span>
                        </span>
                      ) : isDead ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                          <UserX className="w-4 h-4 text-slate-700 shrink-0" />
                          <span>Dead</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>Not Voted</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {isVoted ? (
                        <div className="whitespace-nowrap">
                          <span className="font-mono tabular-nums text-slate-800">
                            {formatTime(voter.voted_at)}
                          </span>
                          <span className="text-slate-400"> · </span>
                          <span>{voter.verified_by_officer_name ?? 'Officer'}</span>
                        </div>
                      ) : isDead ? (
                        <div>
                          <div className="font-semibold text-slate-900 whitespace-nowrap">
                            Marked Dead by {voter.marked_dead_by_officer_name ?? 'Officer'}
                            {voter.marked_dead_by_officer_role
                              ? ` (${voter.marked_dead_by_officer_role})`
                              : ''}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono tabular-nums">
                              {formatTime(voter.marked_dead_at)}
                            </span>
                            {voter.dead_note ? ` · ${voter.dead_note}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 whitespace-nowrap">Pending check-in</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {!isVoted && !isDead ? (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isBoothLocked || isBusy}
                            onClick={() => void onMarkVoted(voter)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isBusy ? 'Saving...' : 'Mark Voted'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBoothLocked || isBusy}
                            onClick={() => onRequestMarkDead(voter)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Dead</span>
                          </button>
                        </div>
                      ) : officerRole === 'Presiding Officer' && !isBoothLocked ? (
                        <button
                          type="button"
                          onClick={() => onRequestRevert(voter)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Revert</span>
                        </button>
                      ) : isDead ? (
                        <span className="text-xs font-medium text-slate-600">Blocked (Dead)</span>
                      ) : (
                        <span className="text-xs font-medium text-emerald-700">Verified</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="tabular-nums">
          {(safePage - 1) * PAGE_SIZE + (pageRows.length > 0 ? 1 : 0)}–
          {(safePage - 1) * PAGE_SIZE + pageRows.length} of {filteredVoters.length} voters
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="min-h-[40px] md:min-h-0 inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg md:rounded-md hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 md:w-3.5 md:h-3.5" />
            <span>Prev</span>
          </button>
          <span className="font-mono tabular-nums px-1">
            {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="min-h-[40px] md:min-h-0 inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg md:rounded-md hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4 md:w-3.5 md:h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
