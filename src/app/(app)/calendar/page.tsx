import type { Metadata } from "next";
import { CalendarView } from "./view";

export const metadata: Metadata = { title: "Calendar" };

export default function Page() {
  return <CalendarView />;
}
