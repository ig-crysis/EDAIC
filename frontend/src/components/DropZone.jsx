import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet } from 'lucide-react';

const ACCEPTED = '.csv,.xlsx,.xls';

/**
 * The original EDAIC "drop your dataset here, or click to browse" box.
 * Dropping or choosing a file starts the upload immediately.
 */
export default function DropZone({ onFileSelected, isUploading, compact = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback(
    (files) => {
      if (files && files.length > 0) onFileSelected(files[0]);
    },
    [onFileSelected]
  );

  const openPicker = () => {
    if (!isUploading) inputRef.current?.click();
  };

  return (
    <div
      className={`dropzone${compact ? ' is-compact' : ''}${isDragging ? ' is-dragging' : ''}${isUploading ? ' is-busy' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Upload a dataset: drop a file here or press Enter to browse"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!isUploading) handleFiles(e.dataTransfer.files);
      }}
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      }}
    >
      <div className="dropzone-glow" />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        hidden
        disabled={isUploading}
        onChange={(e) => {
          handleFiles(e.target.files);
          // allow choosing the same file again later
          e.target.value = '';
        }}
      />

      {isUploading ? (
        <>
          <div className="dropzone-spinner" />
          <p className="dropzone-title">Scanning dataset…</p>
          <p className="dropzone-sub" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            detecting quality issues
          </p>
        </>
      ) : (
        <>
          <div className="dropzone-icon">
            <UploadCloud size={compact ? 22 : 30} strokeWidth={1.75} />
          </div>
          <p className="dropzone-title">
            {compact ? 'Drop another dataset here, or click to browse' : 'Drop your dataset here, or click to browse'}
          </p>
          <p className="dropzone-sub">
            <FileSpreadsheet size={14} /> Supports .csv, .xlsx, .xls — up to 25MB
          </p>
        </>
      )}
    </div>
  );
}
