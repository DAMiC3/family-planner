import type { Metadata } from "next";
import { PlacesView } from "./view";

export const metadata: Metadata = { title: "My places" };

export default function Page() {
  return <PlacesView />;
}
