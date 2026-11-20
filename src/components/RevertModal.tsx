import React, { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import type { VoterRecord } from '../types/election';

interface RevertModalProps {
  voter: VoterRecord | null;
  onClose: () => void;
  onConfirm: (voter: VoterRecord, reason: string) => Promise<void>;
}

export const RevertModal: React.FC<RevertModalProps> = ({ voter, onClose, onConfirm }) => {
  const [reason, setReason] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!voter) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (reason.trim().length < 4) {
      setError('Please enter a valid correction reason (at least 4 characters).');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(voter, reason.trim());
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revert vote.');
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
      <div className="bg-white border border-slate-200 rounded-t-3xl sm:rounded-xl max-w-md w-full p-6 pb-8 sm:pb-6">
        <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Presiding Officer Status Correction
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Revert Serial #{voter.serial_no} ({voter.voter_id}) from{' '}
              {voter.status === 'DEAD' ? 'Dead' : 'Voted'} back to Not Voted
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
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-lg text-xs text-slate-700">
            <div>
              <strong className="text-slate-900">{voter.full_name}</strong> ·{' '}
              <span className="font-mono">{voter.voter_id}</span>
            </div>
            <div className="mt-1 text-slate-500">
              This action will be permanently recorded in the booth audit log under your Presiding
              Officer ID.
            </div>
          </div>

          <div>
            <label
              htmlFor="revert-reason"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Reason for Correction
            </label>
            <input
              id="revert-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Clerical misclick on adjacent serial number"
              required
              className="w-full h-11 px-3 text-base sm:text-sm bg-white border border-slate-300 rounded-xl sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
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
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl sm:rounded-lg disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{busy ? 'Reverting...' : 'Confirm Revert'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
