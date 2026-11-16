import type { Metadata } from "next";
import { Suspense } from "react";
import { addShoppingItem, clearCheckedItems, deleteShoppingItem, toggleShoppingItem } from "@/app/actions/planner";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, IdButton, Input, PageHeader, Skeleton } from "@/components/ui";
import { requireFamily } from "@/lib/family";

export const metadata: Metadata = { title: "Shopping" };

export default function ShoppingPage() {
  return (
    <>
      <PageHeader title="Shopping list" subtitle="Anyone can add — tick things off in the shop" />
      <Suspense fallback={<Skeleton />}>
        <Shopping />
      </Suspense>
    </>
  );
}

async function Shopping() {
  const { supabase, family } = await requireFamily();
  const { data: lists, error } = await supabase
    .from("shopping_lists")
    .select("*")
    .eq("family_id", family.id)
    .order("created_at")
    .limit(1);
  if (error) throw new Error(error.message);
  const list = lists[0];
  if (!list) return <Empty>No shopping list found.</Empty>;

  const { data: items, error: itemsErr } = await supabase
    .from("shopping_items")
    .select("*")
    .eq("list_id", list.id)
    .order("checked")
    .order("created_at", { ascending: false });
  if (itemsErr) throw new Error(itemsErr.message);
  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="mx-auto max-w-xl">
      <Card
        title={list.name}
        action={
          checkedCount > 0 && (
            <form action={clearCheckedItems}>
              <input type="hidden" name="list_id" value={list.id} />
              <SubmitButton variant="ghost">Clear {checkedCount} ticked</SubmitButton>
            </form>
          )
        }
      >
        <ActionForm action={addShoppingItem} submitLabel="Add" className="mb-4 flex flex-wrap gap-2">
          <input type="hidden" name="list_id" value={list.id} />
          <Input name="name" required maxLength={200} placeholder="Milk" className="min-w-0 flex-[3]" aria-label="Item" />
          <Input name="quantity" maxLength={50} placeholder="2 L" className="min-w-0 flex-1" aria-label="Quantity" />
        </ActionForm>

        {items.length === 0 ? (
          <Empty>The list is empty.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                <IdButton
                  action={toggleShoppingItem}
                  id={i.id}
                  extra={{ checked: String(i.checked) }}
                  label={i.checked ? "Untick" : "Tick"}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    i.checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-400 hover:border-indigo-500"
                  }`}
                >
                  {i.checked ? "✓" : ""}
                </IdButton>
                <span className={`flex-1 ${i.checked ? "text-zinc-400 line-through" : ""}`}>{i.name}</span>
                {i.quantity && <span className="text-zinc-500">{i.quantity}</span>}
                <IdButton action={deleteShoppingItem} id={i.id} label="Remove item" className="text-zinc-400 hover:text-red-600">
                  ✕
                </IdButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
