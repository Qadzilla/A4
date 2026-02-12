import { useMutation } from '@tanstack/react-query';
import { toJpeg } from 'html-to-image';
import { useEffect, useRef } from 'react';
import { useTRPC } from '../lib/trpc';

export function useWorkspaceThumbnail(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  workspaceId: string | undefined,
) {
  const trpc = useTRPC();
  const hasCaptured = useRef(false);

  const { mutate } = useMutation(trpc.workspace.updateThumbnail.mutationOptions());

  useEffect(() => {
    if (!workspaceId || hasCaptured.current) return;

    const timer = setTimeout(async () => {
      const node = canvasRef.current;
      if (!node || hasCaptured.current) return;
      hasCaptured.current = true;

      try {
        const dataUrl = await toJpeg(node, {
          width: 320,
          height: 200,
          quality: 0.6,
          canvasWidth: 320,
          canvasHeight: 200,
        });

        mutate({ id: workspaceId, data: { thumbnail: dataUrl } });
      } catch {
        // Thumbnail capture is non-critical — silently ignore
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [workspaceId, canvasRef, mutate]);
}
