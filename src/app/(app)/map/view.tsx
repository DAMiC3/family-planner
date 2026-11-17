"use client";

import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/action-form";
import { EventSheet } from "@/components/add-event-sheet";
import { CarSelect, CarsSheet } from "@/components/cars-sheet";
import { DriverSelect } from "@/components/driver-select";
import { useFamily } from "@/components/family-provider";
import { Avatar, Empty } from "@/components/ui";
import { addDays, dateInZone, formatDay, formatTime, todayInZone, zonedLocalToUtcIso } from "@/lib/dates";
import { check, errorMessage } from "@/lib/form";
import { reverseGeocode, shortAddress, type Place } from "@/lib/geo";
import { pinHtml } from "@/lib/pin";
import { loadMyPlaces } from "@/lib/places";
import { moveEventPin, setCar } from "@/lib/planner";
import {
  eventsInTimeframe,
  googleMapsDriveUrl,
  googleMapsPlaceUrl,
  planRoute,
  routeLine,
  stopsFor,
  type LatLng,
  type Plan,
} from "@/lib/route";
import type { CalendarEvent, SavedPlace } from "@/lib/supabase/types";
import { useFamilyQuery } from "@/lib/use-family-query";

type Mode = "trips" | "route";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const toLocalInput = (iso: string, tz: string) => `${dateInZone(new Date(iso), tz)}T${formatTime(iso, tz)}`;

export function MapView() {
  const ctx = useFamily();
  const { family, members, cars, isParent, userId } = ctx;
  const tz = family.timezone;
  const today = todayInZone(tz);
  const [mode, setMode] = useState<Mode>("trips");
  const [day, setDay] = useState(today); // trips are shown one day at a time
  const [showCars, setShowCars] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [newPlace, setNewPlace] = useState<Place | null>(null);
  const dropModeRef = useRef(false);
  useEffect(() => {
    dropModeRef.current = dropMode;
  }, [dropMode]);
  const [home, setHome] = useState<SavedPlace | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  // Route planner state
  const [routeCar, setRouteCar] = useState<string>("");
  const [from, setFrom] = useState(() => toLocalInput(new Date().toISOString(), tz));
  const [to, setTo] = useState(() => `${today}T23:59`);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planEvents, setPlanEvents] = useState<CalendarEvent[]>([]);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const rangeFrom = day;
  const rangeTo = addDays(day, 1);

  const { data, error, reload } = useFamilyQuery(
    async (c) => {
      const res = await c.supabase
        .from("events")
        .select("*")
        .eq("family_id", family.id)
        .eq("kind", "event")
        .eq("status", "approved")
        .not("lat", "is", null)
        .gte("starts_at", zonedLocalToUtcIso(rangeFrom, tz))
        .lt("starts_at", zonedLocalToUtcIso(rangeTo, tz))
        .order("starts_at");
      check(res.error);
      return res.data!;
    },
    [rangeFrom, rangeTo, tz],
    ["events"],
  );

  // Upcoming trips I'm driving (decides whether I may use My route, and which cars I can pick).
  const { data: myDrives } = useFamilyQuery(
    async (c) => {
      const res = await c.supabase
        .from("events")
        .select("id, car_id")
        .eq("family_id", family.id)
        .eq("driver_id", userId)
        .eq("status", "approved")
        .gte("starts_at", new Date(Date.now() - 12 * 3600_000).toISOString())
        .lt("starts_at", new Date(Date.now() + 14 * 86400_000).toISOString());
      check(res.error);
      return res.data!;
    },
    [userId],
    ["events"],
  );
  const myCarIds = new Set((myDrives ?? []).map((e) => e.car_id).filter(Boolean) as string[]);
  const routeCars = isParent ? cars : cars.filter((c) => myCarIds.has(c.id));
  const isDriver = (myDrives?.length ?? 0) > 0;
  const canRoute = isParent || isDriver;

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
      const m = L.map(mapEl.current, { zoomControl: false }).setView([-26.2, 28.04], 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      // "+ Pin": tap the map to start a new event there.
      m.on("click", async (e) => {
        if (!dropModeRef.current) return;
        setDropMode(false);
        setNewPlace(await reverseGeocode(e.latlng.lat, e.latlng.lng));
      });
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Draw pins + tracks for whichever mode is showing.
  useEffect(() => {
    if (!ready) return;
    let stale = false;
    void (async () => {
      const L = await import("leaflet");
      const m = map.current;
      const g = layer.current;
      if (!m || !g) return;
      const pts: [number, number][] = [];
      const lines: { color: string; coords: [number, number][]; dashed?: boolean }[] = [];
      const markers: import("leaflet").Marker[] = [];
      const memberById = new Map(members.map((x) => [x.user_id, x]));

      if (home) {
        markers.push(
          L.marker([home.lat, home.lng], {
            icon: L.divIcon({ className: "", html: `<div style="font-size:26px;line-height:26px">🏠</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
          }).bindPopup("<b>Home</b>"),
        );
        pts.push([home.lat, home.lng]);
      }

      if (mode === "route" && plan) {
        const car = cars.find((c) => c.id === routeCar);
        const color = car?.color ?? "#FF385C";
        let n = 0;
        for (const step of plan.steps) {
          if (step.type !== "stop") continue;
          n += 1;
          const s = step.stop;
          markers.push(
            L.marker([s.lat, s.lng], {
              icon: L.divIcon({ className: "", html: pinHtml(color), iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] }),
            }).bindPopup(
              `<b>${n}. ${esc(s.title)}</b><br>${s.kind === "pickup" ? "Pick up" : "Drop off"} by ${esc(formatTime(s.at.toISOString(), tz))}<br><a href="${googleMapsPlaceUrl(s)}" target="_blank" rel="noopener">Open in Google Maps</a>`,
            ),
          );
          pts.push([s.lat, s.lng]);
        }
        for (const d of plan.drives) lines.push({ color, coords: await routeLine(d) });
      } else if (mode === "trips" && data) {
        for (const e of data) {
          if (e.lat == null || e.lng == null) continue;
          const car = cars.find((c) => c.id === e.car_id);
          const who = e.assigned_to ? memberById.get(e.assigned_to) : undefined;
          const driver = e.driver_id ? memberById.get(e.driver_id) : undefined;
          const html = pinHtml(car ? car.color : "#FFFFFF"); // white = no car yet
          const times = [
            `${formatDay(dateInZone(new Date(e.starts_at), tz))} ${formatTime(e.arrive_by ?? e.starts_at, tz)} drop-off`,
            e.pickup_at ? `${formatTime(e.pickup_at, tz)} pick-up` : "",
          ].filter(Boolean);
          const canMove = isParent || e.created_by === userId;
          const marker = L.marker([e.lat, e.lng], {
            draggable: canMove,
            icon: L.divIcon({ className: "", html, iconSize: [30, 40], iconAnchor: [15, 40], popupAnchor: [0, -36] }),
          });
          if (canMove) {
            const ev = e;
            marker.on("dragend", async () => {
              const p = marker.getLatLng();
              if (!confirm(`Move the pin for "${ev.title}" here?`)) {
                marker.setLatLng([ev.lat!, ev.lng!]);
                return;
              }
              try {
                await moveEventPin(ctx, ev, p.lat, p.lng);
              } catch (err) {
                alert(errorMessage(err));
                marker.setLatLng([ev.lat!, ev.lng!]);
              }
            });
          }
          markers.push(
            marker.bindPopup(
              `<b>${esc(e.title)}</b><br>${times.map(esc).join(" · ")}<br>${esc(who ? who.display_name : "Everyone")}<br>` +
                `${car ? `🚗 ${esc(car.name)}` : "<span style='color:#FF385C;font-weight:600'>No car yet</span>"} · ${driver ? esc(driver.display_name) : "no driver"}<br>` +
                `<a href="${googleMapsPlaceUrl({ lat: e.lat, lng: e.lng })}" target="_blank" rel="noopener">Open in Google Maps</a>`,
            ),
          );
          pts.push([e.lat, e.lng]);
        }
        // Each car's track for the selected days, in its own colour.
        for (const car of cars) {
          const stops = stopsFor(data.filter((e) => e.car_id === car.id));
          if (stops.length >= 2) lines.push({ color: car.color, coords: await routeLine(stops) });
        }
      }

      if (stale) return;
      g.clearLayers();
      for (const l of lines) L.polyline(l.coords, { color: l.color, weight: 5, opacity: 0.8 }).addTo(g);
      for (const mk of markers) mk.addTo(g);
      if (pts.length === 1) m.setView(pts[0], 14);
      else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 90], paddingBottomRight: [40, 50], maxZoom: 15 });
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx/userId/isParent are stable for the page
  }, [ready, mode, data, plan, home, members, cars, routeCar, tz]);

  async function runPlan() {
    setPlanError(null);
    setPlan(null);
    if (!home) return setPlanError("Set your Home first (menu → My places) so the route can start and end there.");
    if (!routeCar) return setPlanError("Pick the car you're driving.");
    const fromD = new Date(zonedLocalToUtcIso(from, tz));
    const toD = new Date(zonedLocalToUtcIso(to, tz));
    if (toD <= fromD) return setPlanError("The end of the timeframe must be after the start.");
    if (toD.getTime() - fromD.getTime() > 24 * 3600_000) return setPlanError("A route can cover at most one day (24 hours).");
    setPlanning(true);
    try {
      let q = ctx.supabase
        .from("events")
        .select("*")
        .eq("family_id", family.id)
        .eq("car_id", routeCar)
        .eq("status", "approved")
        .not("lat", "is", null)
        .gte("starts_at", new Date(fromD.getTime() - 24 * 3600_000).toISOString())
        .lte("starts_at", toD.toISOString());
      if (!isParent) q = q.eq("driver_id", userId);
      const res = await q;
      check(res.error);
      const events = eventsInTimeframe(res.data!, fromD, toD);
      setPlanEvents(events);
      const p = await planRoute(home, stopsFor(events), toD);
      if (!p) setPlanError("No trips for this car in that timeframe.");
      setPlan(p);
    } catch (e) {
      setPlanError(errorMessage(e));
    } finally {
      setPlanning(false);
    }
  }

  const memberById = new Map(members.map((x) => [x.user_id, x]));
  const noCar = data?.filter((e) => !e.car_id).length ?? 0;
  const t = (d: Date) => formatTime(d.toISOString(), tz);

  return (
    <div className="-mx-4 -mt-5">
      {/* isolate: keeps Leaflet's own z-indexes from showing through sheets and menus */}
      <div className="relative isolate z-0">
        <div ref={mapEl} className={`h-[48dvh] w-full bg-zinc-100 ${dropMode ? "cursor-crosshair" : ""}`} />
        <button
          type="button"
          onClick={() => setDropMode((d) => !d)}
          className={`absolute right-3 bottom-8 z-[500] rounded-full px-4 py-2.5 text-sm font-bold shadow-[0_6px_16px_rgba(0,0,0,0.2)] ${
            dropMode ? "bg-ink text-white" : "bg-white text-ink"
          }`}
        >
          {dropMode ? "Tap the map… (cancel)" : "＋ Pin"}
        </button>
        {mode === "trips" && (
          <div className="absolute top-3 left-1/2 z-[500] flex -translate-x-1/2 items-center gap-1 rounded-full bg-white p-1 shadow-[0_6px_16px_rgba(0,0,0,0.15)]">
            <button type="button" onClick={() => setDay(addDays(day, -1))} className="h-9 w-9 rounded-full text-lg font-bold" aria-label="Previous day">
              ‹
            </button>
            <button type="button" onClick={() => setDay(today)} className="whitespace-nowrap rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">
              {day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : formatDay(day)}
            </button>
            <button type="button" onClick={() => setDay(addDays(day, 1))} className="h-9 w-9 rounded-full text-lg font-bold" aria-label="Next day">
              ›
            </button>
          </div>
        )}
      </div>

      <div className="relative z-10 -mt-5 rounded-t-3xl bg-white px-4 pt-3 shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <div className="mb-3 flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-full bg-zinc-100 p-1">
            <button type="button" onClick={() => setMode("trips")} className={`flex-1 rounded-full py-2 text-sm font-semibold ${mode === "trips" ? "bg-white shadow" : "text-muted"}`}>
              Trips
            </button>
            <button type="button" onClick={() => setMode("route")} className={`flex-1 rounded-full py-2 text-sm font-semibold ${mode === "route" ? "bg-white shadow" : "text-muted"}`}>
              🧭 My route
            </button>
          </div>
          <button type="button" onClick={() => setShowCars(true)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
            🚗 Cars
          </button>
        </div>

        {mode === "trips" && (
          <>
            <div className="mb-2 flex flex-wrap gap-3 text-sm">
              {cars.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5">
                  <span className="h-3 w-6 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-6 rounded-full border border-ink bg-white" />
                No car yet
              </span>
            </div>
            <h1 className="text-xl font-bold">
              {data ? `${data.length} ${data.length === 1 ? "trip" : "trips"}` : "Trips"}
              {noCar > 0 && <span className="ml-2 text-base font-semibold text-brand-600">· {noCar} without a car</span>}
            </h1>
            <p className="text-sm text-muted">Drag a pin to shift it · ＋ Pin to add one by tapping the map</p>
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
            {data && data.length === 0 && <Empty>No trips with a place. Tap + to add one.</Empty>}
            <ul className="mt-2 divide-y divide-line/60">
              {data?.map((e) => {
                const who = e.assigned_to ? memberById.get(e.assigned_to) : undefined;
                const canCar = ctx.canAssignCars && (isParent || e.created_by === userId);
                const car = cars.find((c) => c.id === e.car_id);
                return (
                  <li key={e.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => e.lat != null && e.lng != null && map.current?.setView([e.lat, e.lng], 15)}
                      >
                        {who ? <Avatar name={who.display_name} color={who.color} /> : <span className="text-lg">📍</span>}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{e.title}</span>
                          <span className="block truncate text-sm text-muted">
                            {formatTime(e.arrive_by ?? e.starts_at, tz)}
                            {e.pickup_at ? ` → pick up ${formatTime(e.pickup_at, tz)}` : ""} · {shortAddress(e.location ?? "")}
                          </span>
                        </span>
                      </button>
                      <a
                        href={googleMapsPlaceUrl({ lat: e.lat!, lng: e.lng! })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-semibold"
                      >
                        Google Maps
                      </a>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
                      {canCar ? (
                        <CarSelect
                          value={e.car_id}
                          onChange={(id) => setCar(ctx, e.id, id).then(reload).catch((err) => alert(errorMessage(err)))}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${car ? "border-line" : "border-brand-600 bg-brand-50 text-brand-700"}`}
                        />
                      ) : (
                        <span className="text-sm">{car ? `🚗 ${car.name}` : <span className="font-semibold text-brand-600">No car yet</span>}</span>
                      )}
                      <DriverSelect ctx={ctx} event={e} onDone={reload} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {mode === "route" &&
          (!canRoute ? (
            <Empty>My route is for drivers. A parent can make you the driver for a trip.</Empty>
          ) : (
            <div className="flex flex-col gap-3 pb-4">
              {!home && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Set your Home in menu → My places — routes start and end there.</p>
              )}
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Car you&apos;re driving
                <select
                  value={routeCar}
                  onChange={(e) => {
                    setRouteCar(e.target.value);
                    setPlan(null);
                  }}
                  className="rounded-xl border border-line bg-white px-3.5 py-3 text-base font-normal"
                >
                  <option value="">Choose a car</option>
                  {routeCars.map((c) => (
                    <option key={c.id} value={c.id}>
                      🚗 {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {!isParent && routeCars.length === 0 && <p className="text-sm text-muted">None of your trips have a car yet.</p>}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  From
                  <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-line px-2.5 py-3 text-base font-normal" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Until
                  <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-line px-2.5 py-3 text-base font-normal" />
                </label>
              </div>
              <Button onClick={runPlan} disabled={planning}>
                {planning ? "Working out the route…" : "Plan my route"}
              </Button>
              {planError && <p role="alert" className="text-sm text-red-600">{planError}</p>}

              {plan && (
                <div className="mt-1">
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-ink p-4 text-white">
                      <p className="text-xs uppercase opacity-70">Leave by</p>
                      <p className="text-3xl font-bold">{t(plan.leaveBy)}</p>
                    </div>
                    <div className="rounded-2xl border border-line p-4">
                      <p className="text-xs uppercase text-muted">Back home by</p>
                      <p className="text-3xl font-bold">{t(plan.returnBy)}</p>
                    </div>
                  </div>
                  {plan.lateStops.length > 0 && (
                    <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                      ⚠️ Not everything fits:{" "}
                      {plan.lateStops.map((l) => `${l.stop.title} (${l.lateMin} min late)`).join(", ")}. Ask a parent to use another car or change a time.
                    </p>
                  )}
                  <ol className="relative ml-3 border-l-2 border-line pl-5">
                    {plan.steps.map((s, i) => (
                      <li key={i} className="mb-4">
                        <span className="absolute -left-[9px] mt-1.5 h-4 w-4 rounded-full border-2 border-white bg-ink" />
                        {s.type === "leave" && (
                          <p>
                            <strong>{t(s.at)}</strong> · 🏠 Leave home
                          </p>
                        )}
                        {s.type === "stop" && (
                          <p>
                            <strong>{t(s.arrive)}</strong> · {s.stop.kind === "pickup" ? "↩️ Pick up" : "📍 Drop off"} at <strong>{s.stop.title}</strong>
                            <span className="block text-sm text-muted">
                              {s.stop.kind === "pickup" ? "Pick up" : "Be there"} by {t(s.stop.at)}
                              {s.lateMin > 0 && <span className="font-semibold text-red-600"> · {s.lateMin} min late</span>}
                              {s.stop.location ? ` · ${shortAddress(s.stop.location)}` : ""}
                            </span>
                          </p>
                        )}
                        {s.type === "home" && (
                          <p>
                            <strong>{t(s.arrive)}</strong> · 🏠 Back home — leave again by <strong>{t(s.leaveAt)}</strong>
                          </p>
                        )}
                        {s.type === "return" && (
                          <p>
                            <strong>{t(s.arrive)}</strong> · 🏠 Home{s.afterTimeframe ? " (after your timeframe)" : ""}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-col gap-2">
                    {plan.drives.map((d, i) => (
                      <a
                        key={i}
                        href={googleMapsDriveUrl(d as LatLng[])}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white"
                      >
                        Open {plan.drives.length > 1 ? `drive ${i + 1} ` : "route "}in Google Maps
                      </a>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {planEvents.length} {planEvents.length === 1 ? "trip" : "trips"} · drive times{" "}
                    {plan.estimated ? "estimated (routing service unavailable)" : "from OpenStreetMap routing"} · 5 min for each drop-off / pick-up.
                  </p>
                </div>
              )}
            </div>
          ))}
      </div>
      <CarsSheet open={showCars} onClose={() => setShowCars(false)} />
      <EventSheet open={newPlace !== null} initialPlace={newPlace} onClose={() => setNewPlace(null)} />
    </div>
  );
}
