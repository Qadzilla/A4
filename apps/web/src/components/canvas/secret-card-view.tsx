import { Button, cn } from '@a4/ui';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { decrypt, encrypt, getCachedKey } from '../../lib/vault-crypto';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

interface SecretField {
  label: string;
  value: string;
  sensitive: boolean;
  iv?: string;
}

interface EditableField {
  label: string;
  value: string; // plaintext while editing
  sensitive: boolean;
}

interface SecretCardViewProps {
  item: CanvasItem;
  onRequestUnlock: () => void;
}

export const SecretCardView = memo(function SecretCardView({
  item,
  onRequestUnlock,
}: SecretCardViewProps) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);
  const [fields, setFields] = useState<EditableField[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirtyRef = useRef(false);

  // Check if vault is locked and there are existing encrypted fields
  const storedFields: SecretField[] = (item.data?.fields as SecretField[] | undefined) ?? [];
  const vaultLocked = !getCachedKey();
  const hasEncryptedFields = storedFields.some((f) => f.sensitive && f.iv);

  // Load and decrypt fields on mount / item change only.
  // We intentionally exclude item.data — this component owns the fields state
  // after initial load, and auto-save writes back to item.data. Including it
  // would create a load → save → load infinite loop.
  // biome-ignore lint/correctness/useExhaustiveDependencies: explained above
  useEffect(() => {
    let cancelled = false;
    dirtyRef.current = false;

    async function load() {
      const stored: SecretField[] = (item.data?.fields as SecretField[] | undefined) ?? [];

      const key = getCachedKey();
      const editable: EditableField[] = [];

      for (const f of stored) {
        if (f.sensitive && f.iv && key) {
          try {
            const plaintext = await decrypt(f.value, f.iv, key);
            editable.push({ label: f.label, value: plaintext, sensitive: true });
          } catch {
            editable.push({ label: f.label, value: '', sensitive: true });
          }
        } else if (f.sensitive) {
          editable.push({ label: f.label, value: '', sensitive: true });
        } else {
          editable.push({ label: f.label, value: f.value, sensitive: false });
        }
      }

      if (!cancelled) {
        setFields(editable);
        setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  // Auto-save: encrypt and persist on user changes (debounced 800ms)
  useEffect(() => {
    if (!loaded || !dirtyRef.current) return;
    const key = getCachedKey();
    if (!key) return; // can't encrypt without key — skip auto-save

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      const result: SecretField[] = [];
      for (const f of fields) {
        if (f.sensitive) {
          const { ciphertext, iv } = await encrypt(f.value, key);
          result.push({ label: f.label, value: ciphertext, sensitive: true, iv });
        } else {
          result.push({ label: f.label, value: f.value, sensitive: false });
        }
      }
      updateItemData(item.id, { fields: result });
      setSaveStatus('saved');
      clearTimeout(savedIndicatorRef.current);
      savedIndicatorRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }, 800);

    return () => clearTimeout(saveTimerRef.current);
  }, [fields, loaded, item.id, updateItemData]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      clearTimeout(savedIndicatorRef.current);
    };
  }, []);

  const addField = useCallback(() => {
    dirtyRef.current = true;
    setFields((prev) => [...prev, { label: '', value: '', sensitive: true }]);
  }, []);

  const removeField = useCallback((index: number) => {
    dirtyRef.current = true;
    setFields((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateField = useCallback(
    (index: number, key: keyof EditableField, value: string | boolean) => {
      dirtyRef.current = true;
      setFields((prev) => prev.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
    },
    [],
  );

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <p className="text-[13px] text-black dark:text-zinc-100">Loading...</p>
      </div>
    );
  }

  // Vault locked with existing encrypted fields — show lock banner
  if (vaultLocked && hasEncryptedFields) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-6 text-amber-500"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="text-[13px] text-black dark:text-zinc-100">
            Vault is locked. Unlock to view or edit encrypted fields.
          </p>
          <Button size="sm" onClick={onRequestUnlock}>
            Unlock vault
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5 text-amber-500"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-black dark:text-zinc-100">{item.name}</h2>
            <p className="text-[11px] text-black/60 dark:text-zinc-300">
              Sensitive values are encrypted before saving
            </p>
          </div>
          {/* Auto-save indicator */}
          {saveStatus !== 'idle' && (
            <span className="text-[11px] text-black/60 dark:text-zinc-300">
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-3">
          {fields.map((field, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-background p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={field.label}
                  onChange={(e) => updateField(i, 'label', e.target.value)}
                  placeholder="Label (e.g. Password)"
                  className="flex-1 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={() => removeField(i)}
                  className="p-1.5 rounded-md text-black/50 dark:text-zinc-400 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Remove field"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <input
                type={field.sensitive ? 'password' : 'text'}
                value={field.value}
                onChange={(e) => updateField(i, 'value', e.target.value)}
                placeholder={field.sensitive ? 'Sensitive value (encrypted)' : 'Value (plaintext)'}
                className="w-full rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[13px] font-mono text-black dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
              />

              <label className="flex items-center gap-2 cursor-pointer">
                <button
                  type="button"
                  onClick={() => updateField(i, 'sensitive', !field.sensitive)}
                  className={cn(
                    'flex size-4 items-center justify-center rounded border transition-colors',
                    field.sensitive
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-border bg-background',
                  )}
                >
                  {field.sensitive && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
                <span className="text-[12px] text-black/70 dark:text-zinc-200">
                  Sensitive (encrypt this value)
                </span>
              </label>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addField}
            className="flex items-center gap-1.5 text-[13px] text-primary hover:underline"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add field
          </button>
        </div>
      </div>
    </div>
  );
});
