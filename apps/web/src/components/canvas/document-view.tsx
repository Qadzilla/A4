import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { useMemo } from 'react';
import type { CanvasItem } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { useTheme } from '../../hooks/useTheme';

interface DocumentViewProps {
  item: CanvasItem;
}

export function DocumentView({ item }: DocumentViewProps) {
  const updateItemData = useCanvasStore((s) => s.updateItemData);
  const { resolvedTheme } = useTheme();

  const initialContent = useMemo(
    () => (item.data?.content as any[] | undefined) ?? undefined,
    [item.id],
  );

  const editor = useCreateBlockNote({ initialContent }, [item.id]);

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
            onChange={() => {
              updateItemData(item.id, { content: editor.document });
            }}
          />
        </div>
      </div>
    </div>
  );
}
