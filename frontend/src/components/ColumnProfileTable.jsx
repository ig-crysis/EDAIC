import { useState } from 'react';
import { Columns3, ChevronDown } from 'lucide-react';

function completenessColor(missingPct) {
  if (missingPct === 0) return 'var(--color-teal)';
  if (missingPct < 20) return 'var(--color-amber)';
  return 'var(--color-coral)';
}

export default function ColumnProfileTable({ columns }) {
  const [open, setOpen] = useState(false);

  if (!columns || columns.length === 0) return null;

  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <h3 className="font-display text-sm font-semibold flex items-center gap-2">
          <Columns3 size={15} /> Column profile
          <span className="text-xs font-normal font-body text-[var(--color-text-muted)]">
            ({columns.length} columns)
          </span>
        </h3>
        <ChevronDown size={16} className={`text-[var(--color-text-muted)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div
        style={{ maxHeight: open ? '500px' : '0px', transition: 'max-height 0.4s cubic-bezier(0.16,1,0.3,1)' }}
        className="overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-b border-[var(--color-border)]">
                <th className="text-left px-5 py-2 font-display font-medium text-xs text-[var(--color-text-muted)]">Column</th>
                <th className="text-left px-4 py-2 font-display font-medium text-xs text-[var(--color-text-muted)]">Type</th>
                <th className="text-left px-4 py-2 font-display font-medium text-xs text-[var(--color-text-muted)]">Missing</th>
                <th className="text-left px-4 py-2 font-display font-medium text-xs text-[var(--color-text-muted)]">Unique values</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col.name} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-5 py-2 mono text-xs">{col.name}</td>
                  <td className="px-4 py-2 mono text-xs text-[var(--color-text-muted)]">{col.dtype}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs w-16" style={{ color: completenessColor(col.missing_pct) }}>
                        {col.missing_pct.toFixed(1)}%
                      </span>
                      <div className="w-16 h-1 rounded-full bg-[var(--color-panel-2)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${col.missing_pct}%`, background: completenessColor(col.missing_pct) }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 mono text-xs text-[var(--color-text-muted)]">{col.unique_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
