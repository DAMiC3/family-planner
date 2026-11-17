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
        const color = who?.color ?? "#FF385C";
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:34px;height:42px">
            <div style="position:absolute;inset:0 0 8px 0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>
            <div style="position:absolute;top:6px;left:0;right:0;text-align:center;color:#fff;font:700 13px sans-serif">${esc((who?.display_name ?? "★").slice(0, 1).toUpperCase())}</div>
            ${driver ? "" : `<div style="position:absolute;top:-6px;right:-6px;font-size:14px">❗</div>`}
          </div>`,
          iconSize: [34, 42],
          iconAnchor: [17, 40],
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
      else if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
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
