import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, ArrowRight, AlertCircle } from 'lucide-react';
import { parseCsv, analyzeCsv, convertCsvToCards } from '../../services/csvParser';
import { CsvPreview, FlashcardDeck, FlashcardFolderOption } from '../../types/flashcards';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  folderOptions: FlashcardFolderOption[];
  defaultFolderId: string;
  onImport: (deck: Omit<FlashcardDeck, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const CsvImporterModal: React.FC<Props> = ({ isOpen, onClose, folderOptions, defaultFolderId, onImport }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [deckName, setDeckName] = useState('');
  const [folderId, setFolderId] = useState('');
  const [qIdx, setQIdx] = useState(0);
  const [aIdx, setAIdx] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const defaultExists = folderOptions.some((folder) => folder.id === defaultFolderId);
    setFolderId(defaultExists ? defaultFolderId : '');
  }, [isOpen, defaultFolderId]);

  if (!isOpen) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setDeckName('');
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCsv(ev.target?.result as string);
        setRawRows(rows);
        const p = analyzeCsv(rows);
        setPreview(p);
        setQIdx(p.detectedQuestionIndex);
        setAIdx(p.detectedAnswerIndex);
      } catch (err: any) {
        setError(err.message);
        setPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!preview || !deckName.trim()) { setError('Please name the deck.'); return; }
    const destination = folderOptions.find((folder) => folder.id === folderId);
    if (!destination) { setError('Choose a folder for this deck.'); return; }
    const cards = convertCsvToCards(rawRows, qIdx, aIdx);
    if (!cards.length) { setError('No valid cards found.'); return; }
    onImport({
      name: deckName.trim(),
      subject: destination.subjectName,
      folderId: destination.id,
      cards,
      description: `${fileName} · ${cards.length} cards`,
    });
    setPreview(null); setRawRows([]); setDeckName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 bg-black/70 backdrop-blur-sm sm:p-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-bg-surface rounded-xl border border-bg-border shadow-modal flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border sm:px-5 sm:py-4">
          <h3 className="text-sm font-semibold text-txt-primary">Import Flashcards (CSV)</h3>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-secondary">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm sm:p-5">
          {/* File picker */}
          {!preview ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-bg-border hover:border-white/20 rounded-xl py-10 flex flex-col items-center gap-3 text-txt-muted hover:text-txt-secondary transition-colors"
            >
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
              <Upload size={22} strokeWidth={1.5} />
              <span className="text-xs">Click to choose CSV file</span>
            </button>
          ) : (
            <div className="space-y-3">
              {/* Deck name + destination folder */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-txt-muted mb-1">Deck name</label>
                  <input
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    placeholder={fileName.replace(/\.csv$/i, '').replace(/[-_]/g, ' ')}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-bg-card border border-bg-border text-txt-primary text-sm outline-none focus:border-white/25"
                  />
                </div>
                <div>
                    <label className="block text-xs text-txt-muted mb-1">Save to folder</label>
                  <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-card border border-bg-border text-txt-primary text-sm outline-none"
                  >
                    <option value="">Choose a folder…</option>
                    {folderOptions.map((folder) => (
                      <option key={folder.id} value={folder.id}>{folder.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Column selectors */}
              <div className="grid grid-cols-2 gap-3">
                {(['Question', 'Answer'] as const).map((type, ti) => (
                  <div key={type}>
                    <label className="block text-xs text-txt-muted mb-1">{type} column</label>
                    <select
                      value={ti === 0 ? qIdx : aIdx}
                      onChange={(e) => ti === 0 ? setQIdx(Number(e.target.value)) : setAIdx(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-bg-card border border-bg-border text-txt-primary text-sm outline-none"
                    >
                      {preview.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              <div className="rounded-lg border border-bg-border overflow-hidden max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-bg-card border-b border-bg-border">
                    <tr>
                      <th className="p-2 text-left font-medium text-txt-muted">Front</th>
                      <th className="p-2 text-left font-medium text-txt-muted">Back</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-b border-bg-border last:border-0">
                        <td className="p-2 text-txt-secondary line-clamp-1">{row[qIdx] || '—'}</td>
                        <td className="p-2 text-txt-muted line-clamp-1">{row[aIdx] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-txt-muted">{preview.totalCards} cards detected · <button onClick={() => setPreview(null)} className="text-accent hover:underline">Change file</button></p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              <AlertCircle size={13} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-bg-border flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-1.5 text-xs text-txt-muted hover:text-txt-secondary rounded-lg transition-colors">
            Cancel
          </button>
          {preview && (
            <button onClick={handleImport}
              className="flex items-center gap-2 px-4 py-1.5 text-xs text-txt-primary bg-bg-card border border-bg-border hover:border-white/20 rounded-lg transition-colors">
              Import {preview.totalCards} cards
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
