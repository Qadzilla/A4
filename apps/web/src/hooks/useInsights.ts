import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTRPC } from '../lib/trpc';

export function useInsights({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const { data: unreadData } = useQuery(
    trpc.insights.getUnreadCount.queryOptions({ workspaceId }),
  );

  const { data: listData, isLoading } = useQuery({
    ...trpc.insights.list.queryOptions({ workspaceId, status: 'active' }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const generateMutation = useMutation(
    trpc.insights.generate.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.insights.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.insights.getUnreadCount.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.insights.getLastGeneratedAt.queryKey() });
      },
    }),
  );

  const dismissMutation = useMutation(
    trpc.insights.dismiss.mutationOptions({
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: trpc.insights.list.queryKey() });
        await queryClient.cancelQueries({ queryKey: trpc.insights.getUnreadCount.queryKey() });

        const listKey = trpc.insights.list.queryKey({ workspaceId, status: 'active' });
        const countKey = trpc.insights.getUnreadCount.queryKey({ workspaceId });

        const previousList = queryClient.getQueryData(listKey);
        const previousCount = queryClient.getQueryData(countKey);

        queryClient.setQueryData(listKey, (old: any) =>
          old ? old.filter((item: any) => item.id !== id) : [],
        );
        queryClient.setQueryData(countKey, (old: { count: number } | undefined) =>
          old ? { count: Math.max(0, old.count - 1) } : { count: 0 },
        );

        return { previousList, previousCount, listKey, countKey };
      },
      onError: (_err, _vars, context) => {
        if (context) {
          queryClient.setQueryData(context.listKey, context.previousList);
          queryClient.setQueryData(context.countKey, context.previousCount);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: trpc.insights.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.insights.getUnreadCount.queryKey() });
      },
    }),
  );

  const engageMutation = useMutation(
    trpc.insights.engage.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.insights.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.insights.getUnreadCount.queryKey() });
      },
    }),
  );

  useEffect(() => {
    if (!workspaceId) return;

    let aborted = false;

    (async () => {
      try {
        const result = await queryClient.fetchQuery(
          trpc.insights.getLastGeneratedAt.queryOptions({ workspaceId }),
        );

        if (aborted) return;

        const isFresh =
          result.lastGeneratedAt &&
          Date.now() - new Date(result.lastGeneratedAt).getTime() < 60 * 60 * 1000;

        if (!isFresh) {
          await generateMutation.mutateAsync({ workspaceId });
        }
      } catch {
        // Generation failure is silent
      }
    })();

    return () => {
      aborted = true;
    };
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    insights: (listData ?? []) as any[],
    unreadCount: unreadData?.count,
    isGenerating: generateMutation.isPending,
    isLoading,
    dismissInsight: (id: string) => dismissMutation.mutate({ id }),
    engageInsight: (id: string) => engageMutation.mutateAsync({ id }),
    isPanelOpen,
    setIsPanelOpen,
  };
}
