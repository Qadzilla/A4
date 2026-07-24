import { useTRPC } from '@/lib/trpc';
import { cn } from '@a4/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';

type Template =
  | 'personal-finance'
  | 'small-business'
  | 'investment-portfolio'
  | 'freelancer'
  | 'real-estate'
  | 'blank';

interface TemplateOption {
  id: Template;
  title: string;
  description: string;
  defaultName: string;
  icon: React.ReactNode;
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'personal-finance',
    title: 'Personal Finance',
    description: 'Track spending, budget, and net worth',
    defaultName: 'My Finances',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-0.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2" />
        <path d="M2 9v1c0 1.1.9 2 2 2h1" />
        <circle cx="16" cy="11" r="1" />
      </svg>
    ),
  },
  {
    id: 'small-business',
    title: 'Small Business',
    description: 'Invoices, P&L, and cash flow tracking',
    defaultName: 'My Business',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </svg>
    ),
  },
  {
    id: 'investment-portfolio',
    title: 'Investment Portfolio',
    description: 'Holdings, projections, and performance',
    defaultName: 'My Portfolio',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="m22 12-4-4v3H3v2h15v3z" />
        <path d="M2 17V7" />
      </svg>
    ),
  },
  {
    id: 'freelancer',
    title: 'Freelancer',
    description: 'Invoices, receipts, and tax estimation',
    defaultName: 'Freelance',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M8 18v-2" />
        <path d="M12 18v-4" />
        <path d="M16 18v-6" />
      </svg>
    ),
  },
  {
    id: 'real-estate',
    title: 'Real Estate',
    description: 'Loan calculator, rent vs buy, depreciation',
    defaultName: 'Real Estate',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    id: 'blank',
    title: 'Blank Canvas',
    description: 'Start from scratch with an empty workspace',
    defaultName: 'New Workspace',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </svg>
    ),
  },
];

export default function OnboardingPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');

  const createMutation = useMutation(
    trpc.workspace.createWithTemplate.mutationOptions({
      onSuccess: async (data) => {
        // Mark onboarding completed
        await updateProfileMutation.mutateAsync({ onboardingCompleted: true });
        await queryClient.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        navigate(`/workspaces/${data.id}`);
      },
    }),
  );

  const updateProfileMutation = useMutation(
    trpc.user.updateProfile.mutationOptions(),
  );

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    const t = TEMPLATES.find((t) => t.id === template);
    if (t) setWorkspaceName(t.defaultName);
    setStep(2);
  };

  const handleCreate = () => {
    if (!selectedTemplate || !workspaceName.trim()) return;
    createMutation.mutate({
      name: workspaceName.trim(),
      template: selectedTemplate,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full max-w-4xl mx-auto w-full p-8 animate-in fade-in duration-700 slide-in-from-bottom-4">
      {step === 1 && (
        <div className="w-full space-y-10">
          {/* Header */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
              Let's set up your first workspace
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Pick a starting point. You can always add more tools later — nothing is locked in.
            </p>
          </div>

          {/* Template Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTemplateSelect(t.id)}
                className={cn(
                  'group text-left p-6 rounded-xl border transition-all duration-200',
                  'bg-card hover:bg-muted/30 hover:border-primary/40 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5',
                  'border-border/60',
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="shrink-0 size-10 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-colors">
                    {t.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground text-sm mb-1 group-hover:text-primary transition-colors">
                      {t.title}
                    </h3>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {t.description}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && selectedTemplate && (
        <div className="w-full max-w-md space-y-8 animate-in fade-in duration-500 slide-in-from-right-4">
          {/* Header */}
          <div className="text-center space-y-3">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Name your workspace
            </h1>
            <p className="text-muted-foreground text-sm">
              {TEMPLATES.find((t) => t.id === selectedTemplate)?.description}
            </p>
          </div>

          {/* Name Input */}
          <div className="space-y-3">
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Workspace name"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-border bg-muted/20 text-foreground text-lg font-medium placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!workspaceName.trim() || createMutation.isPending}
              className={cn(
                'flex-1 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm active:scale-[0.98]',
                workspaceName.trim() && !createMutation.isPending
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20'
                  : 'bg-muted text-muted-foreground/50 cursor-not-allowed',
              )}
            >
              {createMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="size-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create Workspace'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
