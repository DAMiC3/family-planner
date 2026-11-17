import type { Metadata } from "next";
import { ManageView } from "./view";

export const metadata: Metadata = { title: "Manage" };

export default function Page() {
  return <ManageView />;
}
