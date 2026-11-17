"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/form";
import { searchAddress, shortAddress, type Place } from "@/lib/geo";
import { loadMyPlaces, savePlace } from "@/lib/places";
import type { SavedPlace } from "@/lib/supabase/types";

/**
 * Pick where something happens: tap one of *your* saved places (Home first),
 * or search an address and optionally save it for next time.
 */
export function LocationPicker({
  value,
  onChange,
  onSaved,
}: {
  value: Place | null;
  onChange: (p: Place | null) => void;
  onSaved?: () => void;
}) {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveAs, setSaveAs] = useState<"none" | "home" | "place">("none");
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState(false);

  const reload = useCallback(() => loadMyPlaces().then(setPlaces).catch(() => {}), []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const home = places.find((p) => p.is_home);
  const fromSaved = value && places.some((p) => p.lat === value.lat && p.lng === value.lng);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const found = await searchAddress(query);
      setResults(found);
      if (!found.length) setError("No matches — try adding the suburb or town");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    if (!value || saveAs === "none") return;
    try {
      await savePlace(value, { home: saveAs === "home", name: saveName || value.name });
      setSaved(true);
      await reload();
      onSaved?.();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink">Where</span>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {!home && (
          <span className="shrink-0 rounded-full border border-dashed border-line px-3 py-2 text-sm text-muted">🏠 Home — search it below and save</span>
        )}
        {places.map((p) => {
          const selected = value?.lat === p.lat && value?.lng === p.lng;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange({ name: p.name, address: p.address, lat: p.lat, lng: p.lng });
                setResults(null);
                setSaveAs("none");
              }}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium ${
                selected ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"
              }`}
            >
              {p.is_home ? "🏠 " : "⭐ "}
              {p.name}
            </button>
          );
        })}
      </div>

      {value ? (
        <div className="flex items-start gap-2 rounded-xl border border-ink p-3">
          <span aria-hidden>📍</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{value.name}</p>
            <p className="truncate text-sm text-muted">{shortAddress(value.address)}</p>
          </div>
          <button type="button" className="text-muted" aria-label="Clear location" onClick={() => onChange(null)}>
            ✕
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="Search an address or place"
            className="min-w-0 flex-1 rounded-xl border border-line px-3.5 py-3 text-base focus:border-ink focus:outline-none"
            aria-label="Search address"
          />
          <button
            type="button"
            onClick={search}
            disabled={busy || query.trim().length < 3}
            className="rounded-xl bg-ink px-4 font-semibold text-white disabled:opacity-40"
          >
            {busy ? "…" : "Search"}
          </button>
        </div>
      )}

      {!value && results && results.length > 0 && (
        <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full px-3.5 py-2.5 text-left hover:bg-zinc-50"
                onClick={() => {
                  onChange(r);
                  setResults(null);
                  setSaved(false);
                  setSaveName(r.name);
                  setSaveAs(home ? "none" : "home");
                }}
              >
                <p className="font-medium">{r.name}</p>
                <p className="truncate text-sm text-muted">{shortAddress(r.address)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {value && !fromSaved && !saved && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-3 text-sm">
          <span className="font-medium">Save for next time?</span>
          <select
            value={saveAs}
            onChange={(e) => setSaveAs(e.target.value as typeof saveAs)}
            className="rounded-lg border border-line bg-white px-2 py-1.5"
            aria-label="Save as"
          >
            <option value="none">Don&apos;t save</option>
            <option value="home">As my Home</option>
            <option value="place">As a saved place</option>
          </select>
          {saveAs === "place" && (
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              maxLength={60}
              placeholder="Name, e.g. School"
              className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1.5"
              aria-label="Place name"
            />
          )}
          {saveAs !== "none" && (
            <button type="button" onClick={saveCurrent} className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white">
              Save
            </button>
          )}
        </div>
      )}
      {saved && <p className="text-sm text-emerald-700">Saved to your places ✓ (only you can see them)</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <p className="text-[11px] text-muted">Address search © OpenStreetMap contributors</p>
    </div>
  );
}
