"use client";

import { ActButton, ActionForm, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { Card, Empty, Input, PageHeader, RestrictedNotice, Skeleton } from "@/components/ui";
import { check, errorMessage } from "@/lib/form";
import {
  addShoppingItem,
  checkersSearchUrl,
  clearCheckedItems,
  deleteShoppingItem,
  setCheckersLink,
  toggleShoppingItem,
} from "@/lib/planner";
import { useFamilyQuery } from "@/lib/use-family-query";

export function ShoppingView() {
  const ctx = useFamily();
  const { family } = ctx;

  const { data, error, reload } = useFamilyQuery(
    async ({ supabase }) => {
      const lists = await supabase.from("shopping_lists").select("*").eq("family_id", family.id).order("created_at").limit(1);
      check(lists.error);
      const list = lists.data![0];
      if (!list) return { list: null, items: [] };
      const items = await supabase
        .from("shopping_items")
        .select("*")
        .eq("list_id", list.id)
        .order("checked")
        .order("created_at", { ascending: false });
      check(items.error);
      return { list, items: items.data! };
    },
    [],
    ["shopping_items"],
  );

  const checkedCount = data?.items.filter((i) => i.checked).length ?? 0;
  const blocked = ctx.blockedBy("shopping");

  return (
    <>
      <PageHeader title="Shopping list" subtitle="Tap 🛒 to find an item on Checkers Sixty60" />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="mx-auto max-w-xl">
        {!data ? (
          <Skeleton />
        ) : !data.list ? (
          <Empty>No shopping list found.</Empty>
        ) : (
          <>
          <Card
            title={data.list.name}
            action={
              checkedCount > 0 && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    clearCheckedItems(ctx, data.list!.id)
                      .then(reload)
                      .catch((e) => alert(errorMessage(e)))
                  }
                >
                  Clear {checkedCount} ticked
                </Button>
              )
            }
          >
            <RestrictedNotice rule={blocked} what="the shopping list" />
            {!blocked && <ActionForm
              onSubmit={async (f) => { await addShoppingItem(ctx, data.list!.id, f); await reload(); }}
              submitLabel="Add"
              className="mb-4 flex flex-wrap gap-2"
            >
              <Input name="name" required maxLength={200} placeholder="Milk" className="min-w-0 flex-[3]" aria-label="Item" />
              <Input name="quantity" maxLength={50} placeholder="2 L" className="min-w-0 flex-1" aria-label="Quantity" />
            </ActionForm>}

            {data.items.length === 0 ? (
              <Empty>The list is empty.</Empty>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <ActButton
                      run={async () => { await toggleShoppingItem(ctx, i.id, i.checked); await reload(); }}
                      label={i.checked ? "Untick" : "Tick"}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${
                        i.checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-400 hover:border-indigo-500"
                      }`}
                    >
                      {i.checked ? "✓" : ""}
                    </ActButton>
                    <span className={`flex-1 ${i.checked ? "text-zinc-400 line-through" : ""}`}>{i.name}</span>
                    {i.quantity && <span className="text-zinc-500">{i.quantity}</span>}
                    <a
                      href={i.checkers_url ?? checkersSearchUrl(i.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={i.checkers_url ? "Open your saved Checkers product" : "Search Checkers for this"}
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${
                        i.checkers_url
                          ? "bg-emerald-600 text-white hover:bg-emerald-500"
                          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      🛒 {i.checkers_url ? "Product" : "Find"}
                    </a>
                    {!blocked && (
                      <ActButton
                        run={async () => {
                          const url = prompt(
                            "Paste the Checkers product link for this item (open it on checkers.co.za or in Sixty60 → Share → Copy link). Leave empty to remove.",
                            i.checkers_url ?? "",
                          );
                          if (url === null) return;
                          await setCheckersLink(ctx, i.id, url);
                          await reload();
                        }}
                        label={i.checkers_url ? "Change Checkers link" : "Save exact Checkers product"}
                        className="px-1 text-zinc-400 hover:text-indigo-600"
                      >
                        🔗
                      </ActButton>
                    )}
                    {!blocked && (
                      <ActButton run={async () => { await deleteShoppingItem(ctx, i.id); await reload(); }} label="Remove item" className="px-1 text-zinc-400 hover:text-red-600">
                        ✕
                      </ActButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="mt-3 text-xs text-zinc-500">
            🛒 <strong>Find</strong> opens a Checkers search for the item. Tap 🔗 to save the exact product — next time it
            opens straight to it (and the link is remembered when you add that item again). Checkers doesn&apos;t allow
            other apps to fill your Sixty60 cart, so you add each item there yourself.
          </p>
          </>
        )}
      </div>
    </>
  );
}
