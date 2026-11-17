"use client";

// Route planning for a car: drop-offs and pick-ups in time order, starting and ending at home.
// Drive times come from the free OpenStreetMap routing service (OSRM); if it's unavailable we
// fall back to a straight-line estimate.

import type { CalendarEvent } from "@/lib/supabase/types";

export type LatLng = { lat: number; lng: number };

export type Stop = LatLng & {
  key: string;
  eventId: string;
  title: string;
  location: string | null;
  kind: "dropoff" | "pickup";
  /** Must be there by this time. */
  at: Date;
};

export type Step =
  | { type: "leave"; at: Date }
  | { type: "stop"; stop: Stop; arrive: Date; lateMin: number }
  | { type: "home"; arrive: Date; leaveAt: Date }
  | { type: "return"; arrive: Date; afterTimeframe: boolean };

export type Plan = {
  steps: Step[];
  /** Each drive starts and ends at home; the driver goes home between drives. */
  drives: LatLng[][];
  leaveBy: Date;
  returnBy: Date;
  lateStops: { stop: Stop; lateMin: number }[];
  estimated: boolean;
};

/** Minutes to park and drop off / collect someone. */
export const DWELL_MIN = 5;
/** Aim to arrive this many minutes early. */
export const BUFFER_MIN = 5;
/** Only go home in between if you'd get at least this long there. */
export const MIN_HOME_MIN = 15;

const MIN = 60_000;
const OSRM = "https://router.project-osrm.org";

/** Turn events into drop-off / pick-up stops. All-day events and events without a place are skipped. */
export function stopsFor(events: CalendarEvent[]): Stop[] {
  const stops: Stop[] = [];
  for (const e of events) {
    if (e.lat == null || e.lng == null || e.all_day) continue;
    const base = { eventId: e.id, title: e.title, location: e.location, lat: e.lat, lng: e.lng };
    stops.push({ ...base, key: `${e.id}:d`, kind: "dropoff", at: new Date(e.arrive_by ?? e.starts_at) });
    if (e.pickup_at) stops.push({ ...base, key: `${e.id}:p`, kind: "pickup", at: new Date(e.pickup_at) });
  }
  return stops.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Events with a stop inside [from, to] — all their stops are included. */
export function eventsInTimeframe(events: CalendarEvent[], from: Date, to: Date) {
  return events.filter((e) =>
    stopsFor([e]).some((s) => s.at.getTime() >= from.getTime() && s.at.getTime() <= to.getTime()),
  );
}

function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough city driving estimate: road distance ≈ 1.35× straight line, 35 km/h average. */
function estimateSeconds(a: LatLng, b: LatLng) {
  return ((haversineKm(a, b) * 1.35) / 35) * 3600;
}

async function fetchJson(url: string, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const coordStr = (pts: LatLng[]) => pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");

/** Driving-time matrix in seconds between all points. */
async function durationMatrix(points: LatLng[]): Promise<{ m: number[][]; estimated: boolean }> {
  try {
    const data = await fetchJson(`${OSRM}/table/v1/driving/${coordStr(points)}?annotations=duration`);
    if (data.code === "Ok" && Array.isArray(data.durations)) {
      const m = (data.durations as (number | null)[][]).map((row, i) =>
        row.map((v, j) => (v == null ? estimateSeconds(points[i], points[j]) : v)),
      );
      return { m, estimated: false };
    }
  } catch {
    /* fall back below */
  }
  return { m: points.map((a) => points.map((b) => estimateSeconds(a, b))), estimated: true };
}

/** Driving time in seconds from a to b (OSRM, or an estimate if it's unavailable). */
export async function travelSeconds(a: LatLng, b: LatLng): Promise<number> {
  try {
    const data = await fetchJson(`${OSRM}/route/v1/driving/${coordStr([a, b])}?overview=false`, 6000);
    const d = data?.routes?.[0]?.duration;
    if (typeof d === "number") return d;
  } catch {
    /* estimate below */
  }
  return estimateSeconds(a, b);
}

/**
 * When someone has to leave home to be at `place` by `arriveIso`
 * (drive time + BUFFER_MIN early). null if we don't know where home is.
 */
export async function estimateLeaveBy(home: LatLng | null, place: LatLng, arriveIso: string): Promise<string | null> {
  if (!home) return null;
  const secs = await travelSeconds(home, place);
  return new Date(new Date(arriveIso).getTime() - secs * 1000 - BUFFER_MIN * MIN).toISOString();
}

/** Road geometry for a sequence of points (falls back to straight lines). */
export async function routeLine(points: LatLng[]): Promise<[number, number][]> {
  if (points.length < 2) return points.map((p) => [p.lat, p.lng]);
  try {
    const data = await fetchJson(`${OSRM}/route/v1/driving/${coordStr(points)}?overview=full&geometries=geojson`);
    const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (coords?.length) return coords.map(([lng, lat]) => [lat, lng]);
  } catch {
    /* straight lines */
  }
  return points.map((p) => [p.lat, p.lng]);
}

/**
 * Plan the day for one car. Leaves home just in time for the first stop, goes home between
 * stops only when there's time (never if it would make you late), and always ends at home.
 */
export async function planRoute(home: LatLng, stops: Stop[], timeframeEnd: Date): Promise<Plan | null> {
  if (!stops.length) return null;
  const points: LatLng[] = [home, ...stops];
  const { m, estimated } = await durationMatrix(points);
  const D = (a: number, b: number) => m[a][b] * 1000; // ms; index 0 = home, i+1 = stops[i]

  const steps: Step[] = [];
  const drives: LatLng[][] = [];
  const lateStops: { stop: Stop; lateMin: number }[] = [];

  const leaveBy = new Date(stops[0].at.getTime() - D(0, 1) - BUFFER_MIN * MIN);
  steps.push({ type: "leave", at: leaveBy });
  let drive: LatLng[] = [home];
  let pos = 0;
  let time = leaveBy.getTime();
  let returnBy = leaveBy;

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const idx = i + 1;
    const arrive = time + D(pos, idx);
    const lateMin = Math.max(0, Math.round((arrive - s.at.getTime()) / MIN));
    if (lateMin > 0) lateStops.push({ stop: s, lateMin });
    steps.push({ type: "stop", stop: s, arrive: new Date(arrive), lateMin });
    drive.push(s);
    // Pick-ups wait for the pick-up time; drop-offs leave straight away.
    const depart = (s.kind === "pickup" ? Math.max(arrive, s.at.getTime()) : arrive) + DWELL_MIN * MIN;

    const next = stops[i + 1];
    if (!next) {
      const back = depart + D(idx, 0);
      returnBy = new Date(back);
      steps.push({ type: "return", arrive: returnBy, afterTimeframe: back > timeframeEnd.getTime() });
      drive.push(home);
      drives.push(drive);
      break;
    }
    const homeArrive = depart + D(idx, 0);
    const leaveHomeAt = next.at.getTime() - D(0, idx + 1) - BUFFER_MIN * MIN;
    if (homeArrive + MIN_HOME_MIN * MIN <= leaveHomeAt) {
      steps.push({ type: "home", arrive: new Date(homeArrive), leaveAt: new Date(leaveHomeAt) });
      drive.push(home);
      drives.push(drive);
      drive = [home];
      pos = 0;
      time = leaveHomeAt;
    } else {
      pos = idx;
      time = depart;
    }
  }

  return { steps, drives, leaveBy, returnBy, lateStops, estimated };
}

/** Google Maps directions for one drive (start → stops → end). */
export function googleMapsDriveUrl(points: LatLng[]) {
  const fmt = (p: LatLng) => `${p.lat},${p.lng}`;
  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1).map(fmt).join("|");
  const params = new URLSearchParams({ api: "1", origin: fmt(origin), destination: fmt(destination), travelmode: "driving" });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Google Maps directions to a single place from wherever you are. */
export function googleMapsPlaceUrl(p: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
}
