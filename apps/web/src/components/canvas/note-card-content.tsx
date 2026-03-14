import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';

interface NoteCardContentProps {
  item: CanvasItem;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}

/** py-2 (8+8) + border (1+1) */
const VERTICAL_CHROME = 18;
const MIN_NOTE_HEIGHT = 50;

export const NoteCardContent = memo(function NoteCardContent({
  item,
  isEditing,
  onStartEdit,
  onStopEdit,
}: NoteCardContentProps) {
  const text = (item.data?.text as string) ?? '';
  const [draft, setDraft] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const updateItemData = useCanvasStore((s) => s.updateItemData);
  const resizeItem = useCanvasStore((s) => s.resizeItem);

  // Sync draft when text changes externally (e.g. undo, duplicate)
  useEffect(() => {
    if (!isEditing) setDraft(text);
  }, [text, isEditing]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // Auto-fit height to content — grows and shrinks as user types
  useEffect(() => {
    let contentHeight: number;

    if (isEditing && textareaRef.current) {
      const ta = textareaRef.current;
      // Collapse to 0 to measure true content scrollHeight
      ta.style.height = '0px';
      contentHeight = ta.scrollHeight;
      ta.style.height = '';
    } else if (!isEditing && textRef.current) {
      contentHeight = textRef.current.offsetHeight;
    } else {
      return;
    }

    const naturalHeight = Math.max(MIN_NOTE_HEIGHT, contentHeight + VERTICAL_CHROME);

    if (Math.abs(naturalHeight - item.height) > 1) {
      resizeItem(item.id, item.x, item.y, item.width, naturalHeight);
    }
  }, [text, draft, isEditing, item.id, item.x, item.y, item.width, item.height, resizeItem]);

  const commitEdit = useCallback(() => {
    if (draft !== text) {
      updateItemData(item.id, { text: draft });
    }
    onStopEdit();
  }, [draft, text, item.id, updateItemData, onStopEdit]);

  return (
    <div
      className="flex h-full w-full flex-col bg-card shadow-sm"
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      <div className="flex-1 overflow-hidden px-2.5 py-2">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                commitEdit();
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-full w-full resize-none bg-transparent text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
            placeholder="Type a note..."
          />
        ) : (
          <p
            ref={textRef}
            className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground"
          >
            {text || <span className="italic text-muted-foreground/50">Double-click to edit</span>}
          </p>
        )}
      </div>
    </div>
  );
});
