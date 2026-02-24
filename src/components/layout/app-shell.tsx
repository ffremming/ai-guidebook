'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

type NavItem = {
  href: string;
  label: string;
};

type AppShellProps = {
  title: string;
  navItems: NavItem[];
  topSlot?: React.ReactNode;
  children: React.ReactNode;
};

function linkClasses(isActive: boolean): string {
  if (isActive) {
    return 'bg-slate-900 text-white';
  }

  return 'text-slate-700 hover:bg-slate-100';
}

export function AppShell({ title, navItems, topSlot, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">AI Guidebook</p>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            Sign out
          </button>
        </div>
      </header>

      {topSlot}

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 py-4 sm:px-6 md:grid-cols-[220px_1fr]">
        <aside className="hidden md:block">
          <nav className="sticky top-4 space-y-1 rounded-xl border border-slate-200 bg-white p-2">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-md px-3 py-2 text-sm font-medium ${linkClasses(isActive)}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div>{children}</div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur md:hidden">
        <ul
          className="mx-auto grid max-w-md gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(navItems.length, 4))}, minmax(0, 1fr))` }}
        >
          {navItems.slice(0, 4).map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-md px-2 py-2 text-center text-xs font-semibold ${linkClasses(isActive)}`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
