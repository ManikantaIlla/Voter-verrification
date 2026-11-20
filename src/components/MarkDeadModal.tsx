import React, { useState } from 'react';
import { X, UserX, ShieldCheck } from 'lucide-react';
import type { OfficerRole, VoterRecord } from '../types/election';

interface MarkDeadModalProps {
  voter: VoterRecord | null;
  officerName: string;
  officerRole: OfficerRole;
  onClose: () => void;
  onConfirm: (voter: VoterRecord, note: string) => Promise<void>;
}

const QUICK_REMARKS = [
  'Verified deceased by BLO / Roll',
  'Confirmed deceased by family member',
  'Official death certificate presented',
];

export const MarkDeadModal: React.FC<MarkDeadModalProps> = ({
  voter,
  officerName,
  officerRole,
  onClose,
  onConfirm,
}) => {
  const [note, setNote] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!voter) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onConfirm(voter, note.trim());
      setNote('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark voter as Dead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-xl max-w-md w-full p-6 pb-8 sm:pb-6 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Mark Voter as Dead (Deceased)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Blocks voting on Serial #{voter.serial_no} ({voter.voter_id}) to prevent impersonation
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-lg text-xs text-slate-700 space-y-1.5">
            <div>
              <strong className="text-slate-900">{voter.full_name}</strong> ·{' '}
              <span className="font-mono">{voter.voter_id}</span>
            </div>
            <div className="text-slate-600">
              {voter.guardian_name ? `C/O ${voter.guardian_name} · ` : ''}
              {voter.age ? `Age ${voter.age} · ` : ''}
              {voter.gender}
            </div>
          </div>

          <div className="p-3.5 bg-slate-900 text-white rounded-xl sm:rounded-lg text-xs flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Recorded Officer Attribution</div>
              <div className="text-slate-200 mt-0.5">
                Will be permanently projected as marked Dead by{' '}
                <strong className="text-white">{officerName}</strong> ({officerRole}).
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="dead-note"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Verification Remark (Optional)
            </label>
            <input
              id="dead-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Verified deceased per BLO death list"
              className="w-full h-11 px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_REMARKS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNote(preset)}
                  className="px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl sm:rounded-lg disabled:opacity-50 cursor-pointer"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>{busy ? 'Saving...' : 'Confirm Mark Dead'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
