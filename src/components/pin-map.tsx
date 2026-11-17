"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef } from "react";
import type { LatLng } from "@/lib/route";
import { PIN_ICON_OPTIONS, pinHtml } from "@/lib/pin";

/**
 * Small map for choosing an exact spot: drag the pin, or tap the map to move it there.
 * With no pin yet, tapping the map drops one.
 */
export function PinMap({
  value,
  onPick,
  center,
  height = 180,
}: {
  value: LatLng | null;
  onPick: (p: LatLng) => void;
  center?: LatLng | null;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      const start = value ?? center ?? { lat: -26.2, lng: 28.04 };
      const m = L.map(el.current, { zoomControl: false, attributionControl: false }).setView([start.lat, start.lng], value ? 16 : 12);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(m);
      m.on("click", (e) => pick.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
      map.current = m;
      // The map may be inside a sheet that's still animating open.
      setTimeout(() => m.invalidateSize(), 200);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once; position updates are handled below
  }, []);

  // Keep the draggable pin in sync with the chosen spot.
  useEffect(() => {
    void import("leaflet").then((L) => {
      const m = map.current;
      if (!m) return;
      if (!value) {
        marker.current?.remove();
        marker.current = null;
        return;
      }
      if (!marker.current) {
        marker.current = L.marker([value.lat, value.lng], {
          draggable: true,
          icon: L.divIcon({ ...PIN_ICON_OPTIONS, html: pinHtml("#FF385C") }),
        }).addTo(m);
        marker.current.on("dragend", () => {
          const p = marker.current!.getLatLng();
          pick.current({ lat: p.lat, lng: p.lng });
        });
        m.setView([value.lat, value.lng], Math.max(m.getZoom(), 16));
      } else {
        marker.current.setLatLng([value.lat, value.lng]);
        if (!m.getBounds().contains([value.lat, value.lng])) m.panTo([value.lat, value.lng]);
      }
    });
  }, [value]);

  return <div ref={el} style={{ height }} className="isolate z-0 w-full overflow-hidden rounded-xl border border-line bg-zinc-100" />;
}
