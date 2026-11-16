import type { Metadata } from "next";
import { MealsView } from "./view";

export const metadata: Metadata = { title: "Meals" };

export default function Page() {
  return <MealsView />;
}
