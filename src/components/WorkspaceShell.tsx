import { LogOut, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";

export type WorkspaceTab = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number;
};

type WorkspaceShellProps = {
  brand: string;
  subtitle: string;
  tabs: WorkspaceTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  userLabel?: string;
  children: ReactNode;
};

export function WorkspaceShell({
  brand,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  onLogout,
  userLabel,
  children,
}: WorkspaceShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const chooseTab = (tab: string) => {
    onTabChange(tab);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <div className="flex min-h-dvh">
        <aside className="hidden w-72 shrink-0 border-r border-zinc-900 bg-zinc-950 lg:flex lg:flex-col">
          <div className="border-b border-zinc-900 p-6">
            <p className="text-2xl font-black tracking-tight text-primary">APOIS</p>
            <p className="mt-1 text-sm font-bold text-white">{brand}</p>
            <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = tab.id === activeTab;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => chooseTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${selected ? "bg-primary text-black" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  <span className="flex-1">{tab.label}</span>
                  {typeof tab.badge === "number" && tab.badge > 0 ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black ${selected ? "bg-black/15" : "bg-primary/10 text-primary"}`}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-zinc-900 p-4">
            {userLabel ? (
              <p className="mb-3 truncate px-2 text-xs text-zinc-500">{userLabel}</p>
            ) : null}
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </aside>

        {mobileOpen ? (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          />
        ) : null}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-900 bg-zinc-950 transition-transform lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-start justify-between border-b border-zinc-900 p-5">
            <div>
              <p className="text-xl font-black text-primary">APOIS</p>
              <p className="text-sm font-bold">{brand}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg bg-zinc-900 p-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = tab.id === activeTab;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => chooseTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold ${selected ? "bg-primary text-black" : "text-zinc-400"}`}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  <span className="flex-1">{tab.label}</span>
                  {typeof tab.badge === "number" && tab.badge > 0 ? (
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-black">
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={onLogout}
            className="m-4 flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 font-bold text-red-400"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-900 bg-black/90 px-4 backdrop-blur lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-xl bg-zinc-900 p-2 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  {subtitle}
                </p>
                <h1 className="font-black">
                  {tabs.find((tab) => tab.id === activeTab)?.label ?? brand}
                </h1>
              </div>
            </div>
            {userLabel ? (
              <span className="hidden max-w-xs truncate text-xs text-zinc-500 sm:block">
                {userLabel}
              </span>
            ) : null}
          </header>
          <main className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-10 text-center">
      <p className="font-bold text-white">{title}</p>
      <p className="mt-2 text-sm text-zinc-500">{description}</p>
    </div>
  );
}
