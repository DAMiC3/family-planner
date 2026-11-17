import type { Metadata } from "next";
import { MapView } from "./view";

export const metadata: Metadata = { title: "Map" };

export default function Page() {
  return <MapView />;
}
