import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, Loader2 } from 'lucide-react';

const ACCEPTED = '.csv,.xlsx,.xls';

export default function FileUpload({ onFileSelected, isUploading }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback((files) => {
    if (files && files.length > 0) {
      onFileSelected(files[0]);
    }
  }, [onFileSelected]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !isUploading && inputRef.current?.click()}
      className={`
        group relative rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden
        flex flex-col items-center justify-center text-center px-8 py-16
        ${isDragging ? 'border-[var(--color-teal)] bg-[var(--color-teal-soft)]' : 'border-[var(--color-border)] bg-[var(--color-panel)]'}
        hover:border-[var(--color-teal)]/60
      `}
      style={{ borderStyle: 'dashed' }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 30%, rgba(53,208,176,0.08), transparent 60%)' }}
      />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={isUploading}
      />

      {isUploading ? (
        <>
          <div className="relative mb-5">
            <div className="w-14 h-14 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-teal)] animate-spin" />
          </div>
          <p className="text-[var(--color-text)] font-display font-medium">Scanning dataset…</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 mono">detecting quality issues</p>
        </>
      ) : (
        <>
          <div className="relative w-16 h-16 mb-5 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-[var(--color-teal-soft)] scale-100 group-hover:scale-125 transition-transform duration-500" />
            <UploadCloud className="relative text-[var(--color-teal)]" size={30} strokeWidth={1.75} />
          </div>
          <p className="text-lg font-display font-semibold text-[var(--color-text)] mb-1.5">
            Drop your dataset here, or click to browse
          </p>
          <p className="text-sm text-[var(--color-text-muted)] flex items-center gap-1.5">
            <FileSpreadsheet size={14} /> Supports .csv, .xlsx, .xls — up to 25MB
          </p>
        </>
      )}
    </div>
  );
}
