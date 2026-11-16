"use client";

import { ActButton, ActionForm, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { Card, Empty, Input, PageHeader, Skeleton } from "@/components/ui";
import { check, errorMessage } from "@/lib/form";
import { addShoppingItem, clearCheckedItems, deleteShoppingItem, toggleShoppingItem } from "@/lib/planner";
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

  return (
    <>
      <PageHeader title="Shopping list" subtitle="Anyone can add — tick things off in the shop" />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="mx-auto max-w-xl">
        {!data ? (
          <Skeleton />
        ) : !data.list ? (
          <Empty>No shopping list found.</Empty>
        ) : (
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
            <ActionForm
              onSubmit={async (f) => { await addShoppingItem(ctx, data.list!.id, f); await reload(); }}
              submitLabel="Add"
              className="mb-4 flex flex-wrap gap-2"
            >
              <Input name="name" required maxLength={200} placeholder="Milk" className="min-w-0 flex-[3]" aria-label="Item" />
              <Input name="quantity" maxLength={50} placeholder="2 L" className="min-w-0 flex-1" aria-label="Quantity" />
            </ActionForm>

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
                    <ActButton run={async () => { await deleteShoppingItem(ctx, i.id); await reload(); }} label="Remove item" className="px-1 text-zinc-400 hover:text-red-600">
                      ✕
                    </ActButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
