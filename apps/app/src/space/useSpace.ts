import { BRAND } from '@/brand';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

/**
 * The workspace concept left the UI in the pivot — every user gets one
 * implicit space, created on first load. The workspaces table survives as
 * plumbing underneath (everything server-side is scoped by it).
 */
export function useSpace(): {
  spaceId: string | null;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
} {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const creatingRef = useRef(false);

  const {
    data: workspaces,
    isLoading,
    isError,
    refetch,
  } = useQuery(trpc.workspace.list.queryOptions());

  const createMutation = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() }),
    }),
  );

  const spaceId = workspaces && workspaces.length > 0 ? (workspaces[0]?.id ?? null) : null;

  useEffect(() => {
    if (!isLoading && workspaces && workspaces.length === 0 && !creatingRef.current) {
      creatingRef.current = true;
      createMutation.mutate({ name: BRAND.spaceName });
    }
  }, [isLoading, workspaces, createMutation]);

  return {
    spaceId,
    isLoading: isLoading || (workspaces?.length === 0 && !spaceId),
    isError,
    retry: () => void refetch(),
  };
}
