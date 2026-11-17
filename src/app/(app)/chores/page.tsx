import type { Metadata } from "next";
import { ChoresView } from "./view";

export const metadata: Metadata = { title: "Chores" };

export default function Page() {
  return <ChoresView />;
}
