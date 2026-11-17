"use client";

import { useState } from "react";
import { ActButton, ActionForm, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { Field, Input } from "@/components/ui";
import { errorMessage } from "@/lib/form";
import { addCar, deleteCar, makeDefaultCar, setAutoAssignHours, updateCar } from "@/lib/planner";

export const CAR_COLORS = ["#2563EB", "#16A34A", "#9333EA", "#EA580C", "#0D9488", "#222222", "#CA8A04", "#DB2777"];

/** Parents register cars (name + track colour) and choose the default car. */
export function CarsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useFamily();
  const { cars, isParent, family } = ctx;
  const [color, setColor] = useState(CAR_COLORS[cars.length % CAR_COLORS.length]);
  const [hours, setHours] = useState(String(family.car_auto_assign_hours));
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Cars">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <h2 className="text-base font-semibold">Cars</h2>
          <span className="w-4" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {cars.length === 0 && <p className="mb-4 text-[15px] text-muted">No cars yet.{isParent ? " Add your first one below." : " A parent can add them."}</p>}
          <ul className="divide-y divide-line/60">
            {cars.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                {isParent ? (
                  <input
                    type="color"
                    value={c.color}
                    onChange={(e) => updateCar(ctx, c.id, { color: e.target.value }).catch((err) => alert(errorMessage(err)))}
                    className="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    aria-label={`Colour for ${c.name}`}
                  />
                ) : (
                  <span className="h-6 w-6 rounded-full" style={{ backgroundColor: c.color }} />
                )}
                <span className="flex-1 font-semibold">
                  {c.name}
                  {c.is_default && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">DEFAULT</span>}
                </span>
                {isParent && !c.is_default && (
                  <ActButton run={() => makeDefaultCar(ctx, c.id)} label={`Make ${c.name} the default`} className="text-sm font-semibold underline">
                    Make default
                  </ActButton>
                )}
                {isParent && (
                  <ActButton
                    run={async () => {
                      const n = prompt("Car name", c.name);
                      if (n !== null) await updateCar(ctx, c.id, { name: n.trim().slice(0, 40) });
                    }}
                    label={`Rename ${c.name}`}
                    className="px-1 text-muted"
                  >
                    ✎
                  </ActButton>
                )}
                {isParent && (
                  <ActButton
                    run={async () => {
                      if (confirm(`Remove ${c.name}? Its trips will have no car.`)) await deleteCar(ctx, c.id);
                    }}
                    label={`Remove ${c.name}`}
                    className="px-1 text-muted hover:text-red-600"
                  >
                    ✕
                  </ActButton>
                )}
              </li>
            ))}
          </ul>

          {isParent && (
            <>
              <h3 className="mt-5 mb-2 font-semibold">Add a car</h3>
              <ActionForm onSubmit={(f) => addCar(ctx, f)} submitLabel="Add car">
                <Field label="Name">
                  <Input name="name" required maxLength={40} placeholder="Mom's Polo" />
                </Field>
                <input type="hidden" name="color" value={color} />
                <div>
                  <p className="mb-1.5 text-sm font-semibold">Track colour</p>
                  <div className="flex flex-wrap gap-2">
                    {CAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={`Colour ${c}`}
                        className={`h-9 w-9 rounded-full ${color === c ? "ring-2 ring-ink ring-offset-2" : ""}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </ActionForm>

              <h3 className="mt-6 mb-2 font-semibold">Default car</h3>
              <p className="mb-2 text-sm text-muted">
                If a trip still has no car this many hours before it starts, the default car is assigned automatically.
              </p>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={168} value={hours} onChange={(e) => setHours(e.target.value)} className="w-24!" aria-label="Hours before" />
                <span className="text-[15px]">hours before</span>
                <Button variant="ghost" onClick={() => setAutoAssignHours(ctx, Number(hours)).catch((e) => alert(errorMessage(e)))}>
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pick a car for an event (parents, or people a parent allowed). */
export function CarSelect({
  value,
  onChange,
  name,
  className,
}: {
  value?: string | null;
  onChange?: (carId: string | null) => void;
  name?: string;
  className?: string;
}) {
  const { cars } = useFamily();
  return (
    <select
      name={name}
      value={onChange ? (value ?? "") : undefined}
      defaultValue={onChange ? undefined : (value ?? "")}
      onChange={onChange ? (e) => onChange(e.target.value || null) : undefined}
      className={className ?? "w-full rounded-xl border border-line bg-white px-3.5 py-3 text-base"}
      aria-label="Car"
    >
      <option value="">No car yet — pin floats on the map</option>
      {cars.map((c) => (
        <option key={c.id} value={c.id}>
          🚗 {c.name}
          {c.is_default ? " (default)" : ""}
        </option>
      ))}
    </select>
  );
}
