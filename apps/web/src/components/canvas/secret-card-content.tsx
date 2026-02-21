import { memo, useState, useCallback } from 'react';
import type { CanvasItem } from '../../stores/canvas-store';
import { getCachedKey, decrypt } from '../../lib/vault-crypto';

interface SecretField {
  label: string;
  value: string;
  sensitive: boolean;
  iv?: string;
}

interface SecretCardContentProps {
  item: CanvasItem;
  onRequestUnlock: () => void;
}

export const SecretCardContent = memo(function SecretCardContent({
  item,
  onRequestUnlock,
}: SecretCardContentProps) {
  const [revealed, setRevealed] = useState(false);
  const [decryptedValues, setDecryptedValues] = useState<Record<number, string>>({});

  const fields: SecretField[] = (item.data?.fields as SecretField[] | undefined) ?? [];

  const toggleReveal = useCallback(async () => {
    if (revealed) {
      setRevealed(false);
      setDecryptedValues({});
      return;
    }

    const key = getCachedKey();
    if (!key) {
      onRequestUnlock();
      return;
    }

    const decrypted: Record<number, string> = {};
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]!;
      if (f.sensitive && f.iv) {
        try {
          decrypted[i] = await decrypt(f.value, f.iv, key);
        } catch {
          decrypted[i] = '[decrypt error]';
        }
      }
    }
    setDecryptedValues(decrypted);
    setRevealed(true);
  }, [revealed, fields, onRequestUnlock]);

  return (
    <div className="flex h-full w-full flex-col rounded-lg border border-border/60 bg-card overflow-hidden shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 text-amber-500 shrink-0"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-[11px] font-medium text-foreground truncate">
            {item.name}
          </span>
        </div>
        {fields.some((f) => f.sensitive) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleReveal();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title={revealed ? 'Hide values' : 'Reveal values'}
          >
            {revealed ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-hidden px-3 py-2 space-y-1.5">
        {fields.length === 0 ? (
          <p className="text-[11px] text-foreground italic pt-1">
            No fields yet. Double-click to edit.
          </p>
        ) : (
          fields.map((field, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-foreground truncate shrink-0 max-w-[40%]">
                {field.label || 'Untitled'}
              </span>
              <span className="text-[11px] font-mono text-foreground truncate text-right">
                {field.sensitive
                  ? (revealed && decryptedValues[i] != null ? decryptedValues[i] : '••••••••')
                  : field.value}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
