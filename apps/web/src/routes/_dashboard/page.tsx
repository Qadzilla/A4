import { useTRPC } from '@/lib/trpc';
import { cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

type ChatMode = 'project' | 'quick';

export default function HomePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: workspaces = [] } = useQuery(trpc.workspace.list.queryOptions());
  const recentWorkspaces = workspaces.filter((ws) => !ws.deletedAt).slice(0, 3);

  // Lookup for parent folder names
  const workspaceById = new Map(workspaces.map((ws) => [ws.id, ws]));
  const [mode, setMode] = useState<ChatMode>('project');
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const createMutation = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        navigate(`/workspaces/${data.id}`);
      },
    }),
  );

  const handleSubmit = () => {
    if (!message.trim()) return;
    if (mode === 'project') {
      createMutation.mutate({ name: message.trim(), type: 'workspace' });
    }
    // TODO: quick mode needs AI pipeline
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full max-w-5xl mx-auto w-full p-8 animate-in fade-in duration-700 slide-in-from-bottom-4">
      {/* Hero Greeting */}
      <div className="mb-12 text-center space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
          Hi Zaid, what do you want to build?
        </h1>
        <p className="text-muted-foreground text-lg">
          Start a new project or analyze your existing financial data.
        </p>
      </div>

      {/* Modern Chat Input - Omnibar Style */}
      <div className={cn(
        'w-full max-w-3xl transition-all duration-300 relative z-10',
        isFocused ? 'scale-[1.02]' : 'scale-100',
      )}>
        <div className={cn(
          'bg-background border rounded-3xl overflow-hidden transition-all duration-300 shadow-sm',
          isFocused
            ? 'border-primary/50 ring-4 ring-primary/10 shadow-xl shadow-primary/5'
            : 'border-border shadow-md hover:border-primary/30 hover:shadow-lg',
        )}>
          {/* Text Area */}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={mode === 'project' ? 'Describe a new project...' : 'Ask for quick info or analysis...'}
            className="w-full bg-transparent px-6 pt-6 pb-2 min-h-[80px] resize-none outline-none text-lg placeholder:text-muted-foreground/50 font-medium"
          />

          {/* Bottom Toolbar */}
          <div className="px-4 pb-4 pt-2 flex items-center justify-between">
            {/* Mode Toggle Pill */}
            <div className="relative flex bg-muted/40 p-1 rounded-full border border-border/50 backdrop-blur-sm">
              {/* Sliding indicator */}
              <div
                className="absolute top-1 bottom-1 w-[calc(50%-2px)] rounded-full bg-primary/5 shadow-[0_0_6px_var(--color-primary)] ring-1 ring-primary/20 transition-transform duration-300 ease-out"
                style={{ transform: mode === 'quick' ? 'translateX(calc(100% + 4px))' : 'translateX(0)' }}
              />
              <button
                type="button"
                onClick={() => setMode('project')}
                className={cn(
                  'relative z-10 px-4 py-1.5 text-xs font-semibold rounded-full transition-colors duration-300 flex items-center gap-1.5',
                  mode === 'project'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Project
              </button>
              <button
                type="button"
                onClick={() => setMode('quick')}
                className={cn(
                  'relative z-10 px-4 py-1.5 text-xs font-semibold rounded-full transition-colors duration-300 flex items-center gap-1.5',
                  mode === 'quick'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                </svg>
                Analysis
              </button>
            </div>

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!message.trim()}
              className={cn(
                'size-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm',
                message.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95 shadow-md shadow-primary/20'
                  : 'bg-muted text-muted-foreground/50 cursor-not-allowed',
              )}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
              >
                <path d="m5 12 7-7 7 7" />
                <path d="M12 19V5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Workspaces - Modern Cards */}
      {recentWorkspaces.length > 0 && (
        <div className="w-full max-w-4xl mt-16 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          <div className="flex items-center justify-between mb-6 px-1">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Recent Workspaces</h2>
            <Link to="/workspaces" className="text-sm font-medium text-primary hover:underline underline-offset-4">View all</Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentWorkspaces.map((ws) => (
              <Link
                key={ws.id}
                to={ws.type === 'folder' ? `/workspaces/${ws.id}/folder` : `/workspaces/${ws.id}`}
                className="group block bg-card border border-border/60 rounded-2xl hover:border-primary/40 transition-all duration-300 hover:shadow-xl hover:shadow-black/5 hover:-translate-y-1 overflow-hidden"
              >
                {/* Card Thumbnail */}
                <div className="h-32 bg-muted/20 relative overflow-hidden group-hover:bg-primary/5 transition-colors">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {ws.type === 'folder' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="size-10 text-muted-foreground/30 group-hover:text-primary/60 group-hover:scale-110 transition-all duration-300">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : ws.thumbnail ? (
                      <img
                        src={ws.thumbnail}
                        alt=""
                        className="h-full w-full object-cover object-top absolute inset-0"
                      />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="size-10 text-muted-foreground/30 group-hover:text-primary/60 group-hover:scale-110 transition-all duration-300">
                        <rect width="7" height="7" x="3" y="3" rx="1" />
                        <rect width="7" height="7" x="14" y="3" rx="1" />
                        <rect width="7" height="7" x="3" y="14" rx="1" />
                        <rect width="7" height="7" x="14" y="14" rx="1" />
                      </svg>
                    )}
                  </div>
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-card/20 to-transparent" />
                </div>

                {/* Card Content */}
                <div className="p-5">
                  <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors truncate mb-1.5">
                    {ws.name}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-1.5">
                      {ws.type === 'folder' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
                          <rect width="7" height="7" x="3" y="3" rx="1" />
                          <rect width="7" height="7" x="14" y="3" rx="1" />
                          <rect width="7" height="7" x="3" y="14" rx="1" />
                          <rect width="7" height="7" x="14" y="14" rx="1" />
                        </svg>
                      )}
                      Workspace
                    </span>
                    <span>{new Date(ws.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
