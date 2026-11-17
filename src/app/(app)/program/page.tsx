import type { Metadata } from "next";
import { ProgramView } from "./view";

export const metadata: Metadata = { title: "My program" };

export default function Page() {
  return <ProgramView />;
}
