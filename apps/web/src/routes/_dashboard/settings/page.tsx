import { useDevUser } from '@/hooks/useDevUser';
import { useTRPC } from '@/lib/trpc';
import { Button, cn } from '@a4/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

type Tab = 'profile' | 'plan' | 'api-keys' | 'notifications';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'plan',
    label: 'Plan & Usage',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
];

function ProfileTab() {
  const { user } = useDevUser();
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User';
  const email = user.primaryEmailAddress?.emailAddress ?? '';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Personal Information</h2>
          <p className="text-sm text-muted-foreground">
            Your account details managed by your identity provider.
          </p>
        </div>

        <div className="grid gap-6 max-w-lg">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider ml-1">
              Display Name
            </label>
            <div className="p-3 border border-border/60 rounded-xl bg-muted/20 text-sm font-medium">
              {displayName}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider ml-1">
              Email Address
            </label>
            <div className="p-3 border border-border/60 rounded-xl bg-muted/20 text-sm font-medium flex items-center justify-between">
              {email}
              <span className="text-[10px] bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded-full font-bold uppercase">
                Verified
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t border-border/60">
        <h2 className="text-xl font-bold text-destructive mb-2">Danger Zone</h2>
        <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-xl bg-destructive/5">
          <div className="space-y-1">
            <p className="font-semibold text-destructive">Delete Account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <Button
            disabled
            variant="destructive"
            className="rounded-xl shadow-lg shadow-destructive/20"
          >
            Delete Account
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function PlanTab() {
  const trpc = useTRPC();
  const { data: plan } = useQuery(trpc.billing.getCurrentPlan.queryOptions());
  const { data: usage } = useQuery(trpc.billing.getUsage.queryOptions());

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Current Plan */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Current Plan</h2>
          <p className="text-sm text-muted-foreground">Your subscription and account limits.</p>
        </div>

        {plan && (
          <div className="p-5 border border-border/60 rounded-xl bg-muted/10 max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">
                  All features included during early access
                </p>
              </div>
              <span className="text-xs bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1 rounded-full font-bold uppercase">
                {plan.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-muted/20 rounded-lg">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  Workspaces
                </p>
                <p className="font-bold mt-1">Up to {plan.limits.workspaces}</p>
              </div>
              <div className="p-3 bg-muted/20 rounded-lg">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  Files / workspace
                </p>
                <p className="font-bold mt-1">Up to {plan.limits.filesPerWorkspace}</p>
              </div>
              <div className="p-3 bg-muted/20 rounded-lg">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  Max file size
                </p>
                <p className="font-bold mt-1">{plan.limits.fileSizeMb} MB</p>
              </div>
              <div className="p-3 bg-muted/20 rounded-lg">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  AI messages / day
                </p>
                <p className="font-bold mt-1">Up to {plan.limits.aiMessagesPerDay}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Usage */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Usage</h2>
          <p className="text-sm text-muted-foreground">
            Your current resource usage across all workspaces.
          </p>
        </div>

        {usage && (
          <div className="grid gap-4 max-w-lg">
            <div className="flex items-center justify-between p-4 border border-border/60 rounded-xl">
              <div>
                <p className="text-sm font-medium">Workspaces</p>
                <p className="text-xs text-muted-foreground">Active workspaces created</p>
              </div>
              <span className="font-mono font-bold text-lg tabular-nums">{usage.workspaces}</span>
            </div>
            <div className="flex items-center justify-between p-4 border border-border/60 rounded-xl">
              <div>
                <p className="text-sm font-medium">Uploaded Files</p>
                <p className="text-xs text-muted-foreground">Documents across all workspaces</p>
              </div>
              <span className="font-mono font-bold text-lg tabular-nums">{usage.files}</span>
            </div>
            <div className="flex items-center justify-between p-4 border border-border/60 rounded-xl">
              <div>
                <p className="text-sm font-medium">AI Tokens Used</p>
                <p className="text-xs text-muted-foreground">
                  {formatTokens(usage.aiTokens.input)} in / {formatTokens(usage.aiTokens.output)}{' '}
                  out
                </p>
              </div>
              <span className="font-mono font-bold text-lg tabular-nums">
                {formatTokens(usage.aiTokens.input + usage.aiTokens.output)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const PROVIDERS = [
  { id: 'anthropic' as const, label: 'Anthropic', placeholder: 'sk-ant-…' },
  { id: 'openai' as const, label: 'OpenAI', placeholder: 'sk-…' },
];

function ApiKeyRow({
  provider,
  label,
  placeholder,
  configuredHint,
}: {
  provider: 'anthropic' | 'openai';
  label: string;
  placeholder: string;
  configuredHint: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.user.getApiKeyStatus.queryKey() });

  const setMutation = useMutation(
    trpc.user.setApiKey.mutationOptions({
      onSuccess: () => {
        setDraft('');
        setError(null);
        invalidate();
      },
      onError: (err) => setError(err.message),
    }),
  );
  const deleteMutation = useMutation(
    trpc.user.deleteApiKey.mutationOptions({ onSuccess: invalidate }),
  );

  return (
    <div className="p-4 border border-border/60 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {configuredHint ? (
            <p className="text-xs text-muted-foreground font-mono">
              Key ending in …{configuredHint}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Using A4's shared key</p>
          )}
        </div>
        {configuredHint && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate({ provider })}
          >
            Remove
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-muted/20 font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Button
          size="sm"
          className="shadow-sm active:scale-[0.98]"
          disabled={draft.trim().length < 8 || setMutation.isPending}
          onClick={() => setMutation.mutate({ provider, key: draft.trim() })}
        >
          {setMutation.isPending ? 'Validating…' : configuredHint ? 'Replace' : 'Save'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ApiKeysTab() {
  const trpc = useTRPC();
  const { data: status } = useQuery(trpc.user.getApiKeyStatus.queryOptions());

  if (status && !status.enabled) {
    return (
      <div className="py-12 text-center text-muted-foreground animate-in fade-in duration-300">
        <h3 className="text-lg font-bold mb-1 text-foreground">Bring Your Own Key</h3>
        <p className="text-sm max-w-sm mx-auto">
          BYOK is not configured on this server. AI features run on A4's shared keys.
        </p>
      </div>
    );
  }

  const hintFor = (provider: string) =>
    status?.keys.find((k) => k.provider === provider)?.keyHint ?? null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <h2 className="text-xl font-bold mb-1">API Keys</h2>
        <p className="text-sm text-muted-foreground max-w-lg">
          Use your own provider keys for Paige and document processing. Keys are validated,
          encrypted at rest, and never shown again after saving. AI usage on your own keys is not
          billed against your A4 allowance.
        </p>
      </div>
      <div className="grid gap-4 max-w-lg">
        {PROVIDERS.map((p) => (
          <ApiKeyRow
            key={p.id}
            provider={p.id}
            label={p.label}
            placeholder={p.placeholder}
            configuredHint={hintFor(p.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="p-4 rounded-full bg-muted/30 mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-8 opacity-50"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>
      <h3 className="text-lg font-bold mb-1">Notification Preferences</h3>
      <p className="text-sm max-w-xs mx-auto">
        Email and in-app notification settings coming soon.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  return (
    <div className="p-8 max-w-6xl mx-auto w-full h-full flex flex-col animate-in fade-in duration-500">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account preferences and workspace settings.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-10 flex-1">
        {/* Sidebar */}
        <div className="w-full lg:w-64 flex flex-col gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium text-left transition-all rounded-xl flex items-center gap-3',
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
            >
              <span className={cn(activeTab === tab.id && 'text-primary')}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-8 bg-card border border-border/60 rounded-3xl p-8 shadow-sm h-fit">
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'plan' && <PlanTab />}
          {activeTab === 'api-keys' && <ApiKeysTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
        </div>
      </div>
    </div>
  );
}
