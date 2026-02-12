import {
  Button,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Textarea,
  cn,
} from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTRPC } from '../../../../lib/trpc';

export default function FolderDetailPage() {
  const { id: folderId } = useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editingWorkspace, setEditingWorkspace] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingType, setCreatingType] = useState<'workspace' | 'folder'>('workspace');
  const [newDescription, setNewDescription] = useState('');

  // biome-ignore lint/style/noNonNullAssertion: route param always defined for this route
  const id = folderId!;

  const { data: folder } = useQuery(trpc.workspace.getById.queryOptions({ id }));
  const { data: children = [], isLoading } = useQuery(
    trpc.workspace.listByFolder.queryOptions({ folderId: id }),
  );

  const createMutation = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.workspace.listByFolder.queryKey({ folderId: id }),
        });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        if (data.type === 'folder') {
          navigate(`/workspaces/${data.id}/folder`);
        } else {
          navigate(`/workspaces/${data.id}`);
        }
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.workspace.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.workspace.listByFolder.queryKey({ folderId: id }),
        });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        setEditingWorkspace(null);
      },
    }),
  );

  const deleteMutation = useMutation(
    trpc.workspace.delete.mutationOptions({
      onSuccess: async () => {
        await queryClient.refetchQueries({ queryKey: trpc.workspace.list.queryKey(), type: 'all' });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.listByFolder.queryKey({ folderId: id }) });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.listTrashed.queryKey() });
      },
    }),
  );

  const restoreMutation = useMutation(
    trpc.workspace.restore.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.listTrashed.queryKey() });
        await queryClient.invalidateQueries({
          queryKey: trpc.workspace.getById.queryKey({ id }),
        });
      },
    }),
  );

  const permanentDeleteMutation = useMutation(
    trpc.workspace.permanentDelete.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.listTrashed.queryKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        navigate('/workspaces');
      },
    }),
  );

  const handleOpenCreate = () => {
    setCreatingType('workspace');
    setCreateOpen(true);
  };

  // Trashed folder access guard
  if (folder?.deletedAt) {
    return (
      <Modal open onOpenChange={() => navigate('/workspaces')}>
        <ModalContent className="rounded-2xl border-border/60 shadow-2xl bg-background/95 backdrop-blur-xl">
          <ModalHeader>
            <ModalTitle className="text-xl">Folder in Trash</ModalTitle>
          </ModalHeader>
          <p className="text-sm text-muted-foreground">
            This folder is in the trash and cannot be accessed.
          </p>
          <ModalFooter>
            <Button
              variant="outline"
              className="rounded-xl h-10 border-border/60"
              disabled={restoreMutation.isPending}
              onClick={() =>
                restoreMutation.mutate(
                  { id },
                  { onSuccess: () => navigate(`/workspaces/${id}/folder`) },
                )
              }
            >
              Restore
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl h-10 shadow-lg shadow-destructive/20"
              disabled={permanentDeleteMutation.isPending}
              onClick={() => permanentDeleteMutation.mutate({ id })}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col animate-in fade-in duration-500">
        <div className="mb-10">
          <div className="h-4 w-32 rounded bg-muted animate-pulse mb-4" />
          <div className="h-8 w-48 rounded-lg bg-muted animate-pulse mb-2" />
          <div className="h-4 w-64 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="h-40 bg-muted/20 animate-pulse" />
              <div className="p-5">
                <div className="h-5 w-3/4 rounded bg-muted animate-pulse mb-4" />
                <div className="h-3 w-full rounded bg-muted animate-pulse mb-2" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse mb-4" />
                <div className="pt-3 border-t border-border/40">
                  <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-4 text-sm text-muted-foreground">
        <Link to="/workspaces" className="hover:text-foreground transition-colors">
          Workspaces
        </Link>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 opacity-40">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="text-foreground font-medium">{folder?.name ?? 'Folder'}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-7 text-muted-foreground">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <h1 className="text-3xl font-bold tracking-tight">{folder?.name ?? 'Folder'}</h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="rounded-xl border-border/60 shadow-lg bg-background/95 backdrop-blur-sm">
                <DropdownMenuItem
                  className="rounded-lg cursor-pointer"
                  onClick={() => {
                    if (folder) setEditingWorkspace({ id: folder.id, name: folder.name });
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive rounded-lg cursor-pointer"
                  onClick={() => {
                    deleteMutation.mutate(
                      { id },
                      { onSuccess: () => navigate('/workspaces') },
                    );
                  }}
                >
                  Move to Trash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-muted-foreground">Contents of this folder.</p>
        </div>
        {children.length > 0 && (
          <Button
            onClick={handleOpenCreate}
            disabled={createMutation.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-full px-5 shadow-sm shadow-primary/20 transition-all hover:-translate-y-0.5 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Workspace
          </Button>
        )}
      </div>

      {children.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 rounded-3xl">
          <div className="size-20 bg-muted/50 flex items-center justify-center rounded-2xl mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="size-10 text-muted-foreground">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-3">This folder is empty</h2>
          <p className="text-muted-foreground mb-8 max-w-sm">Add workspaces to this folder to get started.</p>
          <Button
            onClick={handleOpenCreate}
            disabled={createMutation.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-8 h-12 text-base shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            Create Workspace
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {children.map((ws) => (
            <div key={ws.id} className="group flex flex-col bg-card border border-border/60 rounded-2xl hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-black/5 hover:-translate-y-1 overflow-hidden relative">
              <Link
                to={ws.type === 'folder' ? `/workspaces/${ws.id}/folder` : `/workspaces/${ws.id}`}
                className="block flex-1"
              >
                {/* Thumbnail */}
                <div className="h-40 bg-muted/20 relative overflow-hidden group-hover:bg-primary/5 transition-colors border-b border-border/40">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {ws.type === 'folder' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-12 text-muted-foreground/30 group-hover:text-primary/60 group-hover:scale-110 transition-all duration-500">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : ws.thumbnail ? (
                      <img src={ws.thumbnail} alt="" className="h-full w-full object-cover object-top absolute inset-0" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-12 text-muted-foreground/30 group-hover:text-primary/60 group-hover:scale-110 transition-all duration-500">
                        <rect width="7" height="7" x="3" y="3" rx="1" />
                        <rect width="7" height="7" x="14" y="3" rx="1" />
                        <rect width="7" height="7" x="3" y="14" rx="1" />
                        <rect width="7" height="7" x="14" y="14" rx="1" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1 mr-2">
                      {ws.name}
                    </h3>
                  </div>

                  {ws.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">{ws.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground/40 italic mb-4 flex-1">No description</p>
                  )}

                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium pt-3 border-t border-border/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {new Date(ws.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </Link>

              {/* Action Menu - Absolute positioned */}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="p-1.5 bg-background/80 backdrop-blur-sm border border-border/50 rounded-lg hover:bg-background hover:text-foreground text-muted-foreground shadow-sm hover:shadow-md transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="rounded-xl border-border/60 shadow-lg bg-background/95 backdrop-blur-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <DropdownMenuItem
                      className="rounded-lg cursor-pointer"
                      onClick={() => setEditingWorkspace({ id: ws.id, name: ws.name })}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive rounded-lg cursor-pointer"
                      onClick={() => deleteMutation.mutate({ id: ws.id })}
                    >
                      Move to Trash
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Workspace Modal */}
      <Modal open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setNewDescription(''); }}>
        <ModalContent className="sm:max-w-md rounded-2xl border-border/60 shadow-2xl bg-background/95 backdrop-blur-xl">
          <ModalHeader>
            <ModalTitle className="text-xl">New Workspace</ModalTitle>
          </ModalHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const name = (formData.get('name') as string).trim();
              if (!name) return;
              setCreateOpen(false);
              createMutation.mutate({ name, type: creatingType, parentId: id, description: newDescription || undefined });
              setNewDescription('');
            }}
          >
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setCreatingType('workspace')}
                  className={cn(
                    'flex flex-col items-center justify-center gap-3 p-6 border rounded-xl transition-all duration-200',
                    creatingType === 'workspace'
                      ? 'border-primary ring-2 ring-primary/10 bg-primary/5 text-primary'
                      : 'border-border/60 hover:bg-muted/30 hover:border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-8">
                    <rect width="7" height="7" x="3" y="3" rx="1" />
                    <rect width="7" height="7" x="14" y="3" rx="1" />
                    <rect width="7" height="7" x="3" y="14" rx="1" />
                    <rect width="7" height="7" x="14" y="14" rx="1" />
                  </svg>
                  <span className="text-sm font-bold">Canvas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingType('folder')}
                  className={cn(
                    'flex flex-col items-center justify-center gap-3 p-6 border rounded-xl transition-all duration-200',
                    creatingType === 'folder'
                      ? 'border-primary ring-2 ring-primary/10 bg-primary/5 text-primary'
                      : 'border-border/60 hover:bg-muted/30 hover:border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-8">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-sm font-bold">Sub-folder</span>
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Name</label>
                <Input
                  name="name"
                  key={`${createOpen}`}
                  autoFocus
                  placeholder={creatingType === 'folder' ? 'e.g. Financial Reports' : 'e.g. Q1 Analysis'}
                  className="w-full h-12 rounded-xl border-border/60 bg-muted/20 focus:bg-background transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Description (optional)</label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Brief description..."
                  className="w-full rounded-xl border-border/60 bg-muted/20 focus:bg-background transition-all min-h-[80px] resize-none"
                />
              </div>
            </div>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl h-10 border-border/60">
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-10 shadow-lg shadow-primary/20">
                Create Workspace
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      {/* Rename dialog */}
      <Modal
        open={editingWorkspace !== null}
        onOpenChange={(open) => {
          if (!open) setEditingWorkspace(null);
        }}
      >
        <ModalContent className="sm:max-w-md rounded-2xl border-border/60 shadow-2xl bg-background/95 backdrop-blur-xl">
          <ModalHeader>
            <ModalTitle className="text-xl">Rename Workspace</ModalTitle>
          </ModalHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingWorkspace) return;
              const formData = new FormData(e.currentTarget);
              const name = (formData.get('name') as string).trim();
              if (!name) return;
              updateMutation.mutate({ id: editingWorkspace.id, data: { name } });
            }}
          >
            <div className="space-y-2 py-4">
              <label className="text-xs font-bold uppercase text-muted-foreground ml-1">Name</label>
              <Input
                name="name"
                defaultValue={editingWorkspace?.name ?? ''}
                key={editingWorkspace?.id}
                autoFocus
                placeholder="Workspace name"
                className="w-full h-12 rounded-xl border-border/60 bg-muted/20 focus:bg-background transition-all"
              />
            </div>
            <ModalFooter>
              <Button type="button" variant="outline" onClick={() => setEditingWorkspace(null)} className="rounded-xl h-10 border-border/60">
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-10 shadow-lg shadow-primary/20">
                Save
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}
