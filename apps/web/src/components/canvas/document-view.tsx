import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { memo, useCallback, useMemo } from 'react';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { useTheme } from '../../hooks/useTheme';

interface DocumentViewProps {
  item: CanvasItem;
}

// Custom memo comparator: only re-render when switching documents (item.id),
// NOT when item.data changes. The editor owns content state internally —
// re-rendering on data changes creates an infinite loop:
// onChange → updateItemData → items change → new activeItem ref → re-render → onChange…
export const DocumentView = memo(function DocumentView({ item }: DocumentViewProps) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);
  const { resolvedTheme } = useTheme();

  const initialContent = useMemo(
    () => (item.data?.content as any[] | undefined) ?? undefined,
    [item.id],
  );

  const editor = useCreateBlockNote({ initialContent }, [item.id]);

  const onChange = useCallback(() => {
    updateItemData(item.id, { content: editor.document });
  }, [item.id, editor, updateItemData]);

  return (
    <div className="flex-1 flex items-start justify-center overflow-auto bg-muted/30 py-12 px-8">
      <div
        className="bg-white dark:bg-zinc-50 shadow-lg border border-border/40 rounded-sm"
        style={{ width: 816, minHeight: 1056 }}
      >
        <div className="p-16">
          <BlockNoteView
            editor={editor}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  );
}, (prev, next) => prev.item.id === next.item.id);
