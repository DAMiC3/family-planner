"use client";

import { FieldError, check } from "@/lib/form";
import type { Place } from "@/lib/geo";
import { getSupabase } from "@/lib/supabase/client";
import type { SavedPlace } from "@/lib/supabase/types";

/** My saved places (only ever mine — the database hides everyone else's). Home first. */
export async function loadMyPlaces(): Promise<SavedPlace[]> {
  const { data, error } = await getSupabase().from("saved_places").select("*").order("is_home", { ascending: false }).order("name");
  check(error);
  return data ?? [];
}

export async function savePlace(place: Place, opts: { name?: string; home?: boolean } = {}) {
  const supabase = getSupabase();
  const name = (opts.home ? "Home" : (opts.name ?? place.name)).trim().slice(0, 60);
  if (!name) throw new FieldError("Give the place a name");
  if (opts.home) {
    // Replace any existing Home.
    check((await supabase.from("saved_places").delete().eq("is_home", true)).error);
  }
  check(
    (
      await supabase.from("saved_places").insert({
        name,
        address: place.address.slice(0, 300),
        lat: place.lat,
        lng: place.lng,
        is_home: Boolean(opts.home),
      })
    ).error,
  );
}

export async function renamePlace(id: string, name: string) {
  const n = name.trim().slice(0, 60);
  if (!n) throw new FieldError("Give the place a name");
  check((await getSupabase().from("saved_places").update({ name: n }).eq("id", id)).error);
}

export async function deletePlace(id: string) {
  check((await getSupabase().from("saved_places").delete().eq("id", id)).error);
}
