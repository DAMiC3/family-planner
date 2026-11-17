import type { Metadata } from "next";
import { RulesView } from "./view";

export const metadata: Metadata = { title: "Rules" };

export default function Page() {
  return <RulesView />;
}
