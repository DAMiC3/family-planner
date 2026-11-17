"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { channelName, getSupabase } from "@/lib/supabase/client";

const LINKS = [
  { href: "/program", label: "My program", short: "Program", icon: "🗓️" },
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: "📅" },
  { href: "/tasks", label: "Tasks", short: "Tasks", icon: "✅" },
  { href: "/shopping", label: "Shopping", short: "Shop", icon: "🛒" },
  { href: "/meals", label: "Meals", short: "Meals", icon: "🍽️" },
  { href: "/inbox", label: "Inbox", short: "Inbox", icon: "📥" },
  { href: "/family", label: "Family", short: "Family", icon: "👨‍👩‍👧" },
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

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function useActive() {
  const pathname = usePathname();
  return (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) || (href === "/family" && pathname.startsWith("/rules"));
}

/** Desktop / tablet: links in the top bar. */
export function Nav() {
  const active = useActive();
  const unread = useUnreadCount();
  return (
      <nav className="hidden gap-1 sm:flex">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active(l.href) ? "bg-indigo-600 text-white" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {l.label}
            {l.href === "/inbox" && <Badge count={unread} />}
          </Link>
        ))}
      </nav>
  );
}

/** Phones: bottom tab bar. Render outside the (blurred) header so it sticks to the screen. */
export function BottomNav() {
  const active = useActive();
  const unread = useUnreadCount();
  return (
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              active(l.href) ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-500"
            }`}
          >
            <span className="relative text-lg leading-none" aria-hidden>
              {l.icon}
              {l.href === "/inbox" && <Badge count={unread} />}
            </span>
            {l.short}
          </Link>
        ))}
      </nav>
  );
}
