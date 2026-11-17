"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { DriverSelect } from "@/components/driver-select";
import { useFamily } from "@/components/family-provider";
import { Avatar, Empty } from "@/components/ui";
import { addDays, dateInZone, formatDay, formatTime, todayInZone, zonedLocalToUtcIso } from "@/lib/dates";
import { check } from "@/lib/form";
import { shortAddress } from "@/lib/geo";
import { loadMyPlaces } from "@/lib/places";
import type { SavedPlace } from "@/lib/supabase/types";
import { useFamilyQuery } from "@/lib/use-family-query";

type Range = "today" | "tomorrow" | "week";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function MapView() {
  const ctx = useFamily();
  const { family, members } = ctx;
  const tz = family.timezone;
  const today = todayInZone(tz);
  const [range, setRange] = useState<Range>("today");
  const [home, setHome] = useState<SavedPlace | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  const from = range === "tomorrow" ? addDays(today, 1) : today;
  const to = range === "today" ? addDays(today, 1) : range === "tomorrow" ? addDays(today, 2) : addDays(today, 7);

  const { data, error, reload } = useFamilyQuery(
    async (c) => {
      const res = await c.supabase
        .from("events")
        .select("*")
        .eq("family_id", family.id)
        .not("lat", "is", null)
        .eq("status", "approved")
        .gte("starts_at", zonedLocalToUtcIso(from, tz))
        .lt("starts_at", zonedLocalToUtcIso(to, tz))
        .order("starts_at");
      check(res.error);
      return res.data!;
    },
    [from, to, tz],
    ["events"],
  );

  useEffect(() => {
    loadMyPlaces()
      .then((p) => setHome(p.find((x) => x.is_home) ?? null))
      .catch(() => {});
  }, []);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !mapEl.current || map.current) return;
      const m = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView([-26.2, 28.04], 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Draw pins whenever the trips change.
  useEffect(() => {
    if (!ready || !data) return;
    void import("leaflet").then((L) => {
      const m = map.current;
      const g = layer.current;
      if (!m || !g) return;
      g.clearLayers();
      const points: [number, number][] = [];
      const memberById = new Map(members.map((x) => [x.user_id, x]));

      if (home) {
        const icon = L.divIcon({ className: "", html: `<div style="font-size:26px;line-height:26px">🏠</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
        L.marker([home.lat, home.lng], { icon }).bindPopup("<b>Home</b>").addTo(g);
        points.push([home.lat, home.lng]);
      }

      for (const e of data) {
        if (e.lat == null || e.lng == null) continue;
        const who = e.assigned_to ? memberById.get(e.assigned_to) : undefined;
        const driver = e.driver_id ? memberById.get(e.driver_id) : undefined;
        // Same solid red pin as the Map tab icon; ❗ means nobody is driving yet.
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:30px;height:40px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
            <svg width="30" height="40" viewBox="0 0 24 32" aria-hidden="true"><circle cx="12" cy="11.6" r="5" fill="#fff"/><path fill-rule="evenodd" fill="#FF385C" stroke="#fff" stroke-width="1.2" d="M12 0C5.37 0 0 5.2 0 11.6 0 20.3 12 32 12 32s12-11.7 12-20.4C24 5.2 18.63 0 12 0Zm0 6.8a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Z"/></svg>
            ${driver ? "" : `<div style="position:absolute;top:-8px;right:-8px;font-size:14px">❗</div>`}
          </div>`,
          iconSize: [30, 40],
          iconAnchor: [15, 40],
          popupAnchor: [0, -36],
        });
        const when = e.all_day ? formatDay(dateInZone(new Date(e.starts_at), tz)) : `${formatDay(dateInZone(new Date(e.starts_at), tz))} ${formatTime(e.starts_at, tz)}`;
        L.marker([e.lat, e.lng], { icon })
          .bindPopup(
            `<b>${esc(e.title)}</b><br>${esc(when)}<br>${esc(who ? who.display_name : "Everyone")}<br>${driver ? `🚗 ${esc(driver.display_name)}` : "<span style='color:#FF385C;font-weight:600'>Needs a driver</span>"}`,
          )
          .addTo(g);
        points.push([e.lat, e.lng]);
      }
      if (points.length === 1) m.setView(points[0], 14);
      else if (points.length > 1) m.fitBounds(L.latLngBounds(points), { paddingTopLeft: [40, 90], paddingBottomRight: [40, 50], maxZoom: 15 });
    });
  }, [ready, data, home, members, tz]);

  const memberById = new Map(members.map((x) => [x.user_id, x]));
  const needDriver = data?.filter((e) => !e.driver_id).length ?? 0;

  return (
    <div className="-mx-4 -mt-5">
      <div className="relative">
        <div ref={mapEl} className="h-[52dvh] w-full bg-zinc-100" />
        <div className="absolute top-3 left-1/2 z-[500] flex -translate-x-1/2 gap-1 rounded-full bg-white p-1 shadow-[0_6px_16px_rgba(0,0,0,0.15)]">
          {(["today", "tomorrow", "week"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold ${range === r ? "bg-ink text-white" : "text-ink"}`}
            >
              {r === "today" ? "Today" : r === "tomorrow" ? "Tomorrow" : "7 days"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 -mt-5 rounded-t-3xl bg-white px-4 pt-3 shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h1 className="text-xl font-bold">
          {data ? `${data.length} ${data.length === 1 ? "trip" : "trips"}` : "Trips"}
          {needDriver > 0 && <span className="ml-2 text-base font-semibold text-brand-600">· {needDriver} need a driver</span>}
        </h1>
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        {data && data.length === 0 && <Empty>No trips with a place. Tap + to add one.</Empty>}
        <ul className="mt-2 divide-y divide-line/60">
          {data?.map((e) => {
            const who = e.assigned_to ? memberById.get(e.assigned_to) : undefined;
            return (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => e.lat != null && e.lng != null && map.current?.setView([e.lat, e.lng], 15)}
                >
                  {who ? <Avatar name={who.display_name} color={who.color} /> : <span className="text-lg">📍</span>}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{e.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {e.all_day ? "All day" : formatTime(e.starts_at, tz)}
                      {range === "week" ? ` · ${formatDay(dateInZone(new Date(e.starts_at), tz))}` : ""} · {shortAddress(e.location ?? "")}
                    </span>
                  </span>
                </button>
                <DriverSelect ctx={ctx} event={e} onDone={reload} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
