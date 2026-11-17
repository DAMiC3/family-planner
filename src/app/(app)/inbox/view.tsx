"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ActButton, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { InviteList } from "@/components/invite-list";
import { PushToggle } from "@/components/push-toggle";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui";
import { deleteNotification, markRead } from "@/lib/planner";
import { channelName } from "@/lib/supabase/client";
import type { Notification } from "@/lib/supabase/types";

const ICONS: Record<string, string> = {
  slot: "✨", slot_decided: "✅", request: "🙋", event: "📅", task: "📝", invite: "✉️", member: "👋",
};

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function InboxView() {
  const { supabase, userId, reloadFamily } = useFamily();
  const router = useRouter();
  const [items, setItems] = useState<Notification[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems(data ?? []);
  }, [supabase, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data from Supabase
    void load();
    const channel = supabase
      .channel(channelName(`inbox-${userId}`))
      .on("postgres_changes", { event: "*", schema: "family_planner", table: "notifications", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, load]);

  const unread = items?.filter((n) => !n.read_at) ?? [];

  return (
    <>
      <PageHeader title="Inbox" subtitle="Invites, requests and updates for you" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <InviteList onAccepted={reloadFamily} />
          <Card
            title={`Notifications${unread.length ? ` (${unread.length} new)` : ""}`}
            action={
              unread.length > 0 && (
                <Button variant="ghost" onClick={() => markRead(unread.map((n) => n.id)).then(load)}>
                  Mark all read
                </Button>
              )
            }
          >
            {!items ? (
              <Skeleton />
            ) : items.length === 0 ? (
              <Empty>Nothing here yet.</Empty>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 py-3">
                    <span className="text-lg" aria-hidden>{ICONS[n.kind] ?? "🔔"}</span>
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={async () => {
                        if (!n.read_at) await markRead([n.id]);
                        if (n.url) router.push(n.url.replace(/\/$/, "") || "/program");
                        else void load();
                      }}
                    >
                      <p className={`text-sm ${n.read_at ? "text-zinc-600" : "font-semibold"}`}>
                        {!n.read_at && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand-600" aria-label="New" />}
                        {n.title}
                      </p>
                      {n.body && <p className="text-sm text-zinc-500">{n.body}</p>}
                      <p className="mt-0.5 text-xs text-zinc-400">{timeAgo(n.created_at)}</p>
                    </button>
                    <ActButton run={async () => { await deleteNotification(n.id); await load(); }} label="Delete" className="px-1 text-zinc-400 hover:text-red-600">
                      ✕
                    </ActButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <PushToggle />
      </div>
    </>
  );
}
