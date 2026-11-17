"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AddEventSheet } from "@/components/add-event-sheet";
import { useFamily } from "@/components/family-provider";
import { OfflineBanner } from "@/components/pwa";
import { useSession } from "@/components/session-provider";
import { Avatar } from "@/components/ui";
import { channelName, getSupabase } from "@/lib/supabase/client";

export const TABS = [
  { href: "/program", label: "My program", short: "Program", icon: "📋" },
  { href: "/map", label: "Map", short: "Map", icon: "📍" },
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: "📅" },
  { href: "/tasks", label: "Tasks", short: "Tasks", icon: "✅" },
  { href: "/shopping", label: "Shopping", short: "Shop", icon: "🛒" },
];

/** Live count of unread inbox items for the signed-in user. */
function useUnreadCount() {
  const { session } = useSession();
  const [count, setCount] = useState(0);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const load = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      setCount(count ?? 0);
    };
    void load();
    const channel = supabase
      .channel(channelName(`unread-${userId}`))
      .on("postgres_changes", { event: "*", schema: "family_planner", table: "notifications", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Account menu: everything that isn't a main tab. */
function Menu() {
  const { me, isParent } = useFamily();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const items = [
    { href: "/family", label: "Family & invites", icon: "👨‍👩‍👧" },
    { href: "/rules", label: "House rules", icon: "🔒" },
    ...(isParent ? [{ href: "/history", label: "History", icon: "🕘" }] : []),
    { href: "/places", label: "My places", icon: "⭐" },
    { href: "/inbox", label: "Inbox & notifications", icon: "🔔" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 shadow-sm"
        aria-label="Menu"
        aria-expanded={open}
      >
        <Avatar name={me.display_name} color={me.color} />
        <span className="text-lg leading-none" aria-hidden>
          ☰
        </span>
      </button>
      {open && (
        <div className="absolute top-12 left-0 z-40 w-64 overflow-hidden rounded-2xl border border-line/70 bg-white py-2 shadow-[0_6px_20px_rgba(0,0,0,0.15)]">
          <p className="px-4 pt-1 pb-2 text-sm text-muted">
            Signed in as <strong className="text-ink">{me.display_name}</strong>
          </p>
          {items.map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-[15px] hover:bg-zinc-50">
              <span aria-hidden>{i.icon}</span>
              {i.label}
            </Link>
          ))}
          <button
            type="button"
            className="flex w-full items-center gap-3 border-t border-line/70 px-4 py-3 text-left text-[15px] hover:bg-zinc-50"
            onClick={async () => {
              await getSupabase().auth.signOut();
              router.replace("/login");
            }}
          >
            <span aria-hidden>↩︎</span>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Top bar (menu · 🔔 · ＋) and the phone tab bar. Lives inside the family provider. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const active = useActive();
  const unread = useUnreadCount();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white pt-[env(safe-area-inset-top)]">
        <OfflineBanner />
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Menu />
          <nav className="hidden gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-full px-4 py-2 text-[15px] font-medium ${active(t.href) ? "bg-zinc-100 text-ink" : "text-muted hover:bg-zinc-50"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/inbox" className="relative flex h-10 w-10 items-center justify-center rounded-full text-xl hover:bg-zinc-100" aria-label={`Inbox${unread ? `, ${unread} unread` : ""}`}>
              🔔
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] rounded-full bg-brand-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-2xl leading-none font-light text-white shadow-md active:scale-95"
              aria-label="Add to calendar"
            >
              +
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line/70 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${active(t.href) ? "text-brand-600" : "text-muted"}`}
          >
            <span className={`text-[22px] leading-none ${active(t.href) ? "" : "opacity-70 grayscale-[40%]"}`} aria-hidden>
              {t.icon}
            </span>
            {t.short}
          </Link>
        ))}
      </nav>

      <AddEventSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
