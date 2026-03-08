import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

interface HeaderCardContentProps {
  item: CanvasItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}

const MIN_HEADER_HEIGHT = 40;

export const HeaderCardContent = memo(function HeaderCardContent({
  item,
  isEditing,
  onStartEdit,
  onStopEdit,
}: HeaderCardContentProps) {
  const text = (item.data?.text as string) ?? '';
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const updateItemData = useCanvasStore((s) => s.updateItemData);
  const resizeItem = useCanvasStore((s) => s.resizeItem);

  // Sync draft when text changes externally (e.g. undo, duplicate)
  useEffect(() => {
    if (!isEditing) setDraft(text);
  }, [text, isEditing]);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.selectionStart = inputRef.current.value.length;
    }
  }, [isEditing]);

  // Auto-fit height to content
  useEffect(() => {
    let contentHeight: number;

    if (isEditing && inputRef.current) {
      contentHeight = inputRef.current.offsetHeight;
    } else if (!isEditing && textRef.current) {
      contentHeight = textRef.current.offsetHeight;
    } else {
      return;
    }

    const naturalHeight = Math.max(MIN_HEADER_HEIGHT, contentHeight);

    if (Math.abs(naturalHeight - item.height) > 1) {
      resizeItem(item.id, item.x, item.y, item.width, naturalHeight);
    }
  }, [isEditing, item.id, item.x, item.y, item.width, item.height, resizeItem]);

  const commitEdit = useCallback(() => {
    if (draft !== text) {
      updateItemData(item.id, { text: draft });
    }
    onStopEdit();
  }, [draft, text, item.id, updateItemData, onStopEdit]);

  return (
    <div
      className="flex h-full w-full items-center"
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              commitEdit();
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full bg-transparent text-[32px] font-bold leading-snug text-foreground outline-none placeholder:text-muted-foreground/30"
          placeholder="Heading"
        />
      ) : (
        <span ref={textRef} className="text-[32px] font-bold leading-snug text-foreground">
          {text || <span className="italic text-muted-foreground/30">Double-click to edit</span>}
        </span>
      )}
    </div>
  );
});
