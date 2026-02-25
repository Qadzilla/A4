import { Button, cn } from '@a4/ui';
import { useState } from 'react';

type Tab = 'profile' | 'security' | 'notifications';

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
    id: 'security',
    label: 'Security',
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
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold mb-1">Personal Information</h2>
          <p className="text-sm text-muted-foreground">Update your personal details.</p>
        </div>

        <div className="grid gap-6 max-w-lg">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider ml-1">
              Display Name
            </label>
            <div className="p-3 border border-border/60 rounded-xl bg-muted/20 text-sm font-medium">
              Zaid
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider ml-1">
              Email Address
            </label>
            <div className="p-3 border border-border/60 rounded-xl bg-muted/20 text-sm font-medium flex items-center justify-between">
              dev@a4.ai
              <span className="text-[10px] bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-0.5 rounded-full font-bold uppercase">
                Verified
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground tracking-wider ml-1">
              User ID
            </label>
            <div className="p-3 border border-border/60 rounded-xl bg-muted/20 text-sm font-mono text-muted-foreground">
              dev-user-8392
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

function SecurityTab() {
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
          <path d="m15.5 7.5-1 1" />
          <path d="m21 2-9.3 9.3" />
          <path d="M3.5 21c1.406-1.406 3.373-4.415 5.063-6.813a2 2 0 0 1 3.25 0c1.69 2.398 3.657 5.407 5.063 6.813" />
          <path d="M7.5 15.5 6 17" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      </div>
      <h3 className="text-lg font-bold mb-1">Security Settings</h3>
      <p className="text-sm max-w-xs mx-auto">
        Two-factor authentication and password management coming soon.
      </p>
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
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'notifications' && <NotificationsTab />}
        </div>
      </div>
    </div>
  );
}
