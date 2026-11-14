import { useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  ClipboardCheck,
  FilePlus2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { SEAL_EMBLEM_PATH } from '../../constants/civicData';
import type { PortalView, UserProfile } from '../../types/domain';

export interface NavTab {
  id: string;
  label: string;
  icon: 'dashboard' | 'submit' | 'track' | 'queue' | 'departments' | 'analytics' | 'recurring' | 'logs';
}

export function AppShell({
  profile,
  isBootstrappedAdmin,
  activePortal,
  onPortalChange,
  navTabs,
  activeTab,
  onTabChange,
  primaryAction,
  onSignOut,
  children,
}: {
  profile: UserProfile;
  isBootstrappedAdmin: boolean;
  activePortal: PortalView;
  onPortalChange: (p: PortalView) => void;
  navTabs: NavTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  primaryAction?: { label: string; onClick: () => void };
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sealLoaded, setSealLoaded] = useState(true);

  const canAccessOfficer =
    isBootstrappedAdmin || profile.role === 'admin' || profile.role === 'officer';
  const canAccessAdmin = isBootstrappedAdmin || profile.role === 'admin';

  const portalLabel: Record<PortalView, string> = {
    citizen: 'Citizen Portal',
    officer: 'Government Officer Dashboard',
    admin: 'Administrator Dashboard',
  };

  const activeTabLabel = navTabs.find((t) => t.id === activeTab)?.label || 'Overview';

  const renderIcon = (icon: NavTab['icon']) => {
    const cls = 'h-4 w-4 shrink-0';
    switch (icon) {
      case 'dashboard':
        return <LayoutDashboard className={cls} />;
      case 'submit':
        return <FilePlus2 className={cls} />;
      case 'track':
        return <ListChecks className={cls} />;
      case 'queue':
        return <ClipboardCheck className={cls} />;
      case 'departments':
        return <Building2 className={cls} />;
      case 'analytics':
        return <BarChart3 className={cls} />;
      case 'recurring':
        return <Activity className={cls} />;
      case 'logs':
        return <Shield className={cls} />;
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-navy-900 text-slate-100">
      {/* Brand Lockup */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          {sealLoaded ? (
            <img
              src={SEAL_EMBLEM_PATH}
              alt="JANASEVA AI Seal"
              referrerPolicy="no-referrer"
              onError={() => setSealLoaded(false)}
              className="h-9 w-9 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
              <Shield className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
              JANASEVA AI
            </p>
            <p className="text-[11px] text-teal-300 truncate">Civic Grievance Grid</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Multi-Portal Role Switcher (for Officers/Admins) */}
      {(canAccessOfficer || canAccessAdmin) && (
        <div className="border-b border-white/10 px-4 py-3">
          <p className="px-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Active Workspace
          </p>
          <div className="mt-2 grid gap-1">
            <button
              type="button"
              onClick={() => {
                onPortalChange('citizen');
                setMobileOpen(false);
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
                activePortal === 'citizen'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Citizen Portal</span>
            </button>
            {canAccessOfficer && (
              <button
                type="button"
                onClick={() => {
                  onPortalChange('officer');
                  setMobileOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
                  activePortal === 'officer'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Officer Dashboard</span>
              </button>
            )}
            {canAccessAdmin && (
              <button
                type="button"
                onClick={() => {
                  onPortalChange('admin');
                  setMobileOpen(false);
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-semibold transition-colors ${
                  activePortal === 'admin'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Administrator Console</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Portal Navigation">
        <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          {portalLabel[activePortal]}
        </p>
        {navTabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onTabChange(tab.id);
                setMobileOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/12 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {renderIcon(tab.icon)}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account Footer */}
      <div className="border-t border-white/10 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{profile.fullName}</p>
          <p className="truncate text-xs text-slate-400">
            {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)} · {profile.ward || profile.city || 'Municipal Grid'}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-navy-950 lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-navy-950/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[85vw]">{sidebarContent}</div>
        </div>
      ) : null}

      {/* Main Content Viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="hidden font-semibold text-slate-500 sm:inline whitespace-nowrap">
                  {portalLabel[activePortal]}
                </span>
                <span className="hidden text-slate-400 sm:inline" aria-hidden="true">
                  /
                </span>
                <span className="truncate font-display font-bold text-navy-900">
                  {activeTabLabel}
                </span>
              </div>
            </div>

            {primaryAction ? (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
              >
                {primaryAction.label}
              </button>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
