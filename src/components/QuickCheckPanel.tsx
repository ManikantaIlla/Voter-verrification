import React, { useMemo, useRef, useState } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  RotateCcw,
  Check,
  UserX,
} from 'lucide-react';
import { formatTime } from '../lib/api';
import type { OfficerRole, VoterRecord } from '../types/election';

interface QuickCheckPanelProps {
  voters: VoterRecord[];
  isBoothLocked: boolean;
  officerRole: OfficerRole;
  busyVoterId: number | null;
  onMarkVoted: (voter: VoterRecord) => Promise<void>;
  onRequestMarkDead: (voter: VoterRecord) => void;
  onRequestRevert: (voter: VoterRecord) => void;
}

export const QuickCheckPanel: React.FC<QuickCheckPanelProps> = ({
  voters,
  isBoothLocked,
  officerRole,
  busyVoterId,
  onMarkVoted,
  onRequestMarkDead,
  onRequestRevert,
}) => {
  const [query, setQuery] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!normalized) return [];

    // Prioritize exact Serial Number or exact Voter ID match first
    const exact = voters.filter(
      (v) =>
        String(v.serial_no) === normalized ||
        v.voter_id.toLowerCase() === normalized
    );
    if (exact.length > 0) return exact;

    return voters
      .filter(
        (v) =>
          String(v.serial_no).includes(normalized) ||
          v.voter_id.toLowerCase().includes(normalized) ||
          v.full_name.toLowerCase().includes(normalized)
      )
      .slice(0, 5);
  }, [normalized, voters]);

  const primaryMatch = matches.length === 1 ? matches[0] : null;

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && primaryMatch && primaryMatch.status === 'NOT_VOTED' && !isBoothLocked) {
      e.preventDefault();
      await onMarkVoted(primaryMatch);
      setQuery('');
      inputRef.current?.focus();
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Rapid Voter Verification Lookup
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter Serial Number (e.g. 14) or Voter ID No. (e.g. VTR2042014) to verify eligibility
          </p>
        </div>
        {isBoothLocked && (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg whitespace-nowrap">
            <ShieldAlert className="w-4 h-4" />
            <span>Poll Closed — Vote Marking Locked</span>
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Serial No. or Voter ID No..."
          aria-label="Lookup voter by Serial Number or Voter ID Number"
          className="w-full h-12 pl-10 pr-20 text-base sm:text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {normalized && matches.length === 0 && (
        <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">
          No voter in this booth roll matches <span className="font-mono font-semibold">{query}</span>.
        </div>
      )}

      {matches.length > 0 && (
        <div className="mt-4 divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
          {matches.map((voter) => {
            const isVoted = voter.status === 'VOTED';
            const isDead = voter.status === 'DEAD';
            const isBusy = busyVoterId === voter.id;

            return (
              <div
                key={voter.id}
                className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                  isVoted
                    ? 'bg-emerald-50/75'
                    : isDead
                      ? 'bg-slate-100/90'
                      : 'bg-rose-50/65'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 min-w-0">
                  <div
                    className={`w-fit shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                      isVoted
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : isDead
                          ? 'bg-slate-200 text-slate-900 border-slate-400'
                          : 'bg-rose-100 text-rose-900 border-rose-300'
                    }`}
                  >
                    {isVoted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    ) : isDead ? (
                      <UserX className="w-3.5 h-3.5 text-slate-800" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-700" />
                    )}
                    <span>{isVoted ? 'Voted' : isDead ? 'Dead' : 'Not Voted'}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        Serial #{voter.serial_no}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-700">
                        {voter.voter_id}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {voter.full_name}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      {voter.guardian_name && <span>C/O {voter.guardian_name}</span>}
                      {voter.age && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">Age {voter.age}</span>
                        </>
                      )}
                      {voter.gender && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{voter.gender}</span>
                        </>
                      )}
                      {voter.address && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-full sm:max-w-md">{voter.address}</span>
                        </>
                      )}
                    </div>

                    {isVoted && (
                      <div className="mt-1.5 text-xs font-medium text-emerald-900">
                        Duplicate Protection Active: Verified at{' '}
                        <span className="font-mono tabular-nums">{formatTime(voter.voted_at)}</span>{' '}
                        by {voter.verified_by_officer_name ?? 'Booth Officer'}
                      </div>
                    )}

                    {isDead && (
                      <div className="mt-1.5 text-xs font-semibold text-slate-900">
                        Marked Dead at{' '}
                        <span className="font-mono tabular-nums">
                          {formatTime(voter.marked_dead_at)}
                        </span>{' '}
                        by {voter.marked_dead_by_officer_name ?? 'Booth Officer'}
                        {voter.marked_dead_by_officer_role
                          ? ` (${voter.marked_dead_by_officer_role})`
                          : ''}
                        {voter.dead_note && (
                          <span className="block font-normal text-slate-600 mt-0.5">
                            Remark: {voter.dead_note}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full lg:w-auto">
                  {!isVoted && !isDead ? (
                    <>
                      <button
                        type="button"
                        disabled={isBoothLocked || isBusy}
                        onClick={async () => {
                          await onMarkVoted(voter);
                          setQuery('');
                          inputRef.current?.focus();
                        }}
                        className="w-full sm:w-auto min-h-[48px] lg:min-h-[42px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm lg:text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] rounded-xl lg:rounded-lg disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <Check className="w-4 h-4" />
                        <span>{isBusy ? 'Recording...' : 'Mark as Voted'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBoothLocked || isBusy}
                        onClick={() => onRequestMarkDead(voter)}
                        className="w-full sm:w-auto min-h-[44px] lg:min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 active:scale-[0.99] rounded-xl lg:rounded-lg disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <UserX className="w-4 h-4 text-slate-700" />
                        <span>Mark Dead</span>
                      </button>
                    </>
                  ) : officerRole === 'Presiding Officer' && !isBoothLocked ? (
                    <button
                      type="button"
                      onClick={() => onRequestRevert(voter)}
                      className="w-full lg:w-auto min-h-[44px] lg:min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl lg:rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Revert Mistake</span>
                    </button>
                  ) : isDead ? (
                    <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                      Voting Blocked (Dead)
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
