"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChartColumn, FileUp, FolderSync, Handshake, LayoutDashboard, Menu, Search, Settings, Users } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isNavActive, navItemsForAccess } from "@/lib/nav";
import { signOut } from "@/server/actions";
import { useCanWriteCrm } from "@/components/workspace-access";

const NAV_ICONS = {
  "/dashboard": LayoutDashboard,
  "/notifications": Bell,
  "/opportunities": Handshake,
  "/reporting": ChartColumn,
  "/leads": Users,
  "/leads/import": FileUp,
  "/reconciliation": FolderSync,
  "/settings": Settings,
} as const;

export function Shell({
  children,
  attentionCount = 0,
}: {
  children: ReactNode;
  attentionCount?: number;
}) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        <Nav attentionCount={attentionCount} />
        <SignOut className="mt-auto p-3" />
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur md:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>Realynk</SheetTitle>
              </SheetHeader>
              <Nav attentionCount={attentionCount} />
              <SignOut className="mt-4 px-3" />
            </SheetContent>
          </Sheet>
          <form action="/search" className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <input
              name="q"
              placeholder="Search contacts, companies, email, LinkedIn"
              className="h-9 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </form>
        </header>
        <main className="px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="border-b border-sidebar-border px-5 py-5">
      <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Realynk Assistants</p>
      <p className="mt-1 text-base font-bold text-foreground">Sales & Growth</p>
    </div>
  );
}

function Nav({ attentionCount = 0 }: { attentionCount?: number }) {
  const pathname = usePathname();
  const canWrite = useCanWriteCrm();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItemsForAccess(canWrite).map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = NAV_ICONS[item.href];
        const showCount = item.href === "/notifications" && attentionCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/70",
            )}
          >
            <Icon className="size-4" />
            <span className="min-w-0 flex-1">{item.label}</span>
            {showCount ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                {attentionCount > 99 ? "99+" : attentionCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOut({ className }: { className?: string }) {
  return (
    <form action={signOut} className={className}>
      <Button type="submit" variant="ghost" size="sm">Sign out</Button>
    </form>
  );
}
