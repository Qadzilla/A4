import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '../../../lib/trpc';

export default function TrashPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: trashedItems = [], isLoading } = useQuery(
    trpc.workspace.listTrashed.queryOptions(),
  );

  const confirmItem = trashedItems.find((i) => i.id === confirmDeleteId);

  const restoreMutation = useMutation(
    trpc.workspace.restore.mutationOptions({
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: trpc.workspace.list.queryKey(), type: 'all' });
        await queryClient.refetchQueries({
          queryKey: trpc.workspace.listTrashed.queryKey(),
          type: 'all',
        });
      },
    }),
  );

  const permanentDeleteMutation = useMutation(
    trpc.workspace.permanentDelete.mutationOptions({
      onSuccess: async () => {
        if (confirmDeleteId) localStorage.removeItem(`a4-canvas-${confirmDeleteId}`);
        setConfirmDeleteId(null);
        await queryClient.refetchQueries({ queryKey: trpc.workspace.list.queryKey(), type: 'all' });
        await queryClient.refetchQueries({
          queryKey: trpc.workspace.listTrashed.queryKey(),
          type: 'all',
        });
      },
    }),
  );

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col animate-in fade-in duration-500">
        <div className="mb-8">
          <div className="h-7 w-24 rounded-lg bg-muted animate-pulse mb-2" />
          <div className="h-4 w-72 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="h-32 bg-muted/20 animate-pulse" />
              <div className="p-5">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse mb-2" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse mb-6" />
                <div className="flex gap-2">
                  <div className="h-9 flex-1 rounded-lg bg-muted animate-pulse" />
                  <div className="h-9 flex-1 rounded-lg bg-muted animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Trash</h1>
        <p className="text-muted-foreground">Restore items or permanently delete them.</p>
      </div>

      {trashedItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
          <div className="size-20 bg-muted/50 flex items-center justify-center rounded-2xl mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-10 text-muted-foreground"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Trash is empty</h2>
          <p className="text-muted-foreground max-w-sm">
            Items you delete will appear here. They are automatically removed after 30 days.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {trashedItems.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col bg-card border border-border/60 rounded-2xl hover:border-destructive/30 transition-all duration-300 hover:shadow-xl hover:shadow-destructive/5 relative overflow-hidden"
            >
              <div className="h-32 bg-muted/20 flex items-center justify-center border-b border-border/40 group-hover:bg-destructive/5 transition-colors">
                <div className="size-12 bg-background rounded-xl shadow-sm flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-6 text-muted-foreground/50"
                  >
                    <rect width="20" height="5" x="2" y="3" rx="1" />
                    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                    <path d="M10 12h4" />
                  </svg>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-base mb-1 line-clamp-1">{item.name}</h3>
                <p className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  Deleted on{' '}
                  {item.deletedAt
                    ? new Date(item.deletedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Unknown'}
                </p>

                <div className="mt-auto flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreMutation.mutate({ id: item.id })}
                    disabled={restoreMutation.isPending}
                    className="flex-1 gap-1.5 rounded-lg h-9 hover:bg-primary/5 hover:text-primary hover:border-primary/20"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5"
                    >
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    Restore
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDeleteId(item.id)}
                    disabled={permanentDeleteMutation.isPending}
                    className="flex-1 gap-1.5 rounded-lg h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm permanent delete modal */}
      <Modal
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <ModalContent className="rounded-2xl border-border/60 shadow-2xl">
          <ModalHeader>
            <ModalTitle>Delete Permanently</ModalTitle>
          </ModalHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete &ldquo;{confirmItem?.name}&rdquo;. This action cannot be
            undone.
          </p>
          <ModalFooter>
            <Button
              variant="outline"
              className="rounded-xl border-border/60"
              onClick={() => setConfirmDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl shadow-lg shadow-destructive/20"
              disabled={permanentDeleteMutation.isPending}
              onClick={() => {
                if (confirmDeleteId) {
                  permanentDeleteMutation.mutate({ id: confirmDeleteId });
                }
              }}
            >
              Delete Forever
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
