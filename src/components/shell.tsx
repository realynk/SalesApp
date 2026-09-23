"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Briefcase, ChartColumn, FolderSync, Handshake, LayoutDashboard, Menu, Search, Settings, Sprout, Users } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { signOut } from "@/server/actions";

const NAV = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/reconciliation", label: "Reconciliation", icon: FolderSync },
  { href: "/opportunities", label: "Opportunities", icon: Handshake },
  { href: "/follow-ups", label: "Nurture", icon: Sprout },
  { href: "/recruitment", label: "Recruitment", icon: Briefcase },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({
  children,
  name,
  attentionCount,
}: {
  children: ReactNode;
  name: string;
  attentionCount: number;
}) {
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
        <Brand />
        <Nav />
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
              <Nav />
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
          <Link href="/notifications" className="relative inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm">
            <Bell className="size-4" />
            <span className="hidden sm:inline">Attention</span>
            {attentionCount > 0 ? <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{attentionCount}</span> : null}
          </Link>
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-sm text-muted-foreground">{name}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">Sign out</Button>
            </form>
          </div>
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

function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
