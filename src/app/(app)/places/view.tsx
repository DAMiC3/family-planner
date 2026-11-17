"use client";

import { useCallback, useEffect, useState } from "react";
import { ActButton } from "@/components/action-form";
import { LocationPicker } from "@/components/location-picker";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/form";
import { shortAddress, type Place } from "@/lib/geo";
import { deletePlace, loadMyPlaces, renamePlace } from "@/lib/places";
import type { SavedPlace } from "@/lib/supabase/types";

/** Your private saved places (Home + favourites). Nobody else in the family can see these. */
export function PlacesView() {
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  const [picked, setPicked] = useState<Place | null>(null);
  const [key, setKey] = useState(0);

  const load = useCallback(() => loadMyPlaces().then(setPlaces).catch(() => setPlaces([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="My places" subtitle="Only you can see these. They show up when you add an event." />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Saved">
          {!places ? (
            <Skeleton />
          ) : places.length === 0 ? (
            <Empty>No places yet. Add your Home first.</Empty>
          ) : (
            <ul className="divide-y divide-line/60">
              {places.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className="text-xl" aria-hidden>{p.is_home ? "🏠" : "⭐"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="truncate text-sm text-muted">{shortAddress(p.address)}</p>
                  </div>
                  {!p.is_home && (
                    <ActButton
                      run={async () => {
                        const n = prompt("New name", p.name);
                        if (n === null) return;
                        try {
                          await renamePlace(p.id, n);
                        } catch (e) {
                          alert(errorMessage(e));
                        }
                        await load();
                      }}
                      label="Rename"
                      className="px-1 text-muted"
                    >
                      ✎
                    </ActButton>
                  )}
                  <ActButton
                    run={async () => {
                      if (confirm(`Remove ${p.name}?`)) {
                        await deletePlace(p.id);
                        await load();
                      }
                    }}
                    label="Remove"
                    className="px-1 text-muted hover:text-red-600"
                  >
                    ✕
                  </ActButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Add a place">
          <LocationPicker
            key={key}
            value={picked}
            onSaved={() => {
              void load();
              setPicked(null);
              setKey((k) => k + 1);
            }}
            onChange={(p) => {
              setPicked(p);
              void load();
              if (!p) setKey((k) => k + 1);
            }}
          />
          <p className="mt-3 text-sm text-muted">Search, pick a result, then choose “As my Home” or “As a saved place”.</p>
        </Card>
      </div>
    </>
  );
}
