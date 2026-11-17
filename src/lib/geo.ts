"use client";

/** A place picked on the map / in the add-event form. */
export type Place = { name: string; address: string; lat: number; lng: number };

type NominatimResult = { display_name: string; lat: string; lon: string; name?: string };

/**
 * Look up an address with OpenStreetMap's free Nominatim service.
 * Their rules: one search per button press (no search-as-you-type), and show attribution.
 */
export async function searchAddress(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=0&accept-language=en&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Address search is busy — try again in a moment");
  const rows = (await res.json()) as NominatimResult[];
  return rows.map((r) => ({
    name: r.name || r.display_name.split(",")[0],
    address: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}

/** Short, readable version of a long OpenStreetMap address. */
export function shortAddress(address: string) {
  return address.split(",").slice(0, 3).join(",").trim();
}
