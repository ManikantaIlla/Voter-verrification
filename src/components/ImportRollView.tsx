import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, Download, Check, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type {
  AuditEntry,
  BoothStats,
  ImportPreviewColumnMap,
  ImportPreviewResponse,
  VoterRecord,
} from '../types/election';

interface ImportRollViewProps {
  boothId: string;
  isBoothLocked: boolean;
  currentVoterCount: number;
  onImportSuccess: (payload: {
    voters: VoterRecord[];
    stats: BoothStats;
    auditEntry: AuditEntry;
  }) => void;
  onDone: () => void;
}

const FIELD_DEFINITIONS: Array<{
  key: keyof ImportPreviewColumnMap;
  label: string;
  required: boolean;
}> = [
  { key: 'serial_no', label: 'Serial Number', required: false },
  { key: 'voter_id', label: 'Voter ID / EPIC No.', required: true },
  { key: 'full_name', label: 'Voter Full Name', required: true },
  { key: 'guardian_name', label: 'Father / Mother / Spouse Name', required: false },
  { key: 'age', label: 'Age', required: false },
  { key: 'gender', label: 'Gender', required: false },
  { key: 'address', label: 'Address / House No.', required: false },
  { key: 'part_no', label: 'Part / Section No.', required: false },
];

export const ImportRollView: React.FC<ImportRollViewProps> = ({
  boothId,
  isBoothLocked,
  currentVoterCount,
  onImportSuccess,
  onDone,
}) => {
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [columnMap, setColumnMap] = useState<ImportPreviewColumnMap>({
    serial_no: '',
    voter_id: '',
    full_name: '',
    guardian_name: '',
    age: '',
    gender: '',
    address: '',
    part_no: '',
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      const res = await apiFetch<ImportPreviewResponse>(
        `/api/booths/${encodeURIComponent(boothId)}/import/preview`,
        {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, base64Data }),
        }
      );
      setPreview(res);
      setColumnMap(res.detectedMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse file.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview) return;
    setError('');
    setLoading(true);

    try {
      const result = await apiFetch<{
        voters: VoterRecord[];
        stats: BoothStats;
        auditEntry: AuditEntry;
      }>(`/api/booths/${encodeURIComponent(boothId)}/import/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: preview.fileName,
          columnMap,
          rawRows: preview.rawRows,
        }),
      });
      onImportSuccess(result);
      setSuccessMsg(
        `Successfully imported ${result.voters.length} registered voters from ${preview.fileName}.`
      );
      setPreview(null);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit electoral roll.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              Import Booth Electoral Roll (CSV / Excel)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload `.xlsx`, `.xls`, or `.csv` voter register files. All voters start marked Red (Not
              Voted).
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
            <a
              href="/api/template?format=xlsx"
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sample Excel</span>
            </a>
            <a
              href="/api/template?format=csv"
              className="min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sample CSV</span>
            </a>
          </div>
        </div>

        {isBoothLocked && (
          <div className="mb-5 p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs font-medium text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              The booth poll is currently closed and locked. Reopen the poll from the End-of-Day
              Report tab before uploading a new voter sheet.
            </span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
            {successMsg}
          </div>
        )}

        <label
          className={`flex flex-col items-center justify-center text-center border-2 border-dashed rounded-2xl sm:rounded-xl p-6 sm:p-8 min-h-[160px] transition-colors ${
            isBoothLocked
              ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
              : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70 active:bg-slate-100 cursor-pointer'
          }`}
        >
          <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
          <span className="text-sm font-semibold text-slate-900">
            {loading ? 'Reading spreadsheet...' : 'Tap to choose Excel (.xlsx / .xls) or CSV file'}
          </span>
          <span className="text-xs text-slate-500 mt-1">
            Replacing the roll currently holding {currentVoterCount} voter records in {boothId}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={isBoothLocked || loading}
            onChange={(e) => void handleFileChange(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
      </div>

      {preview && (
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 truncate">
                  {preview.fileName}
                </h3>
                <p className="text-xs text-slate-500">
                  Sheet: {preview.sheetName} ·{' '}
                  <span className="font-mono tabular-nums">{preview.totalRows}</span> rows detected
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="min-h-[44px] sm:min-h-0 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl sm:rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={loading || !columnMap.voter_id || !columnMap.full_name}
                onClick={() => void handleConfirmImport()}
                className="min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl sm:rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                <span>Confirm &amp; Load {preview.totalRows} Voters</span>
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-900 mb-3">
              Verify Column Mapping
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FIELD_DEFINITIONS.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {field.label} {field.required ? '*' : ''}
                  </label>
                  <select
                    value={columnMap[field.key]}
                    onChange={(e) =>
                      setColumnMap((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-full h-11 sm:h-9 px-3 sm:px-2.5 text-base sm:text-xs bg-white border border-slate-300 rounded-xl sm:rounded-md text-slate-900"
                  >
                    <option value="">
                      {field.key === 'serial_no' ? 'Auto-assign (1, 2, 3...)' : '— Not mapped —'}
                    </option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-900 mb-2">
              Preview (First 5 Rows)
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3">Serial #</th>
                    <th className="py-2 px-3">Voter ID</th>
                    <th className="py-2 px-3">Full Name</th>
                    <th className="py-2 px-3">Guardian</th>
                    <th className="py-2 px-3">Age / Gender</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {preview.rawRows.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="bg-white">
                      <td className="py-2 px-3 font-mono tabular-nums">
                        {columnMap.serial_no ? String(row[columnMap.serial_no] ?? idx + 1) : idx + 1}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {columnMap.voter_id ? String(row[columnMap.voter_id] ?? '—') : '—'}
                      </td>
                      <td className="py-2 px-3 font-medium">
                        {columnMap.full_name ? String(row[columnMap.full_name] ?? '—') : '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {columnMap.guardian_name ? String(row[columnMap.guardian_name] ?? '—') : '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-600 tabular-nums">
                        {columnMap.age ? String(row[columnMap.age] ?? '—') : '—'} ·{' '}
                        {columnMap.gender ? String(row[columnMap.gender] ?? 'Other') : 'Other'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
