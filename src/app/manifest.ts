import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/base-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE_PATH}/`,
    name: "Family Planner",
    short_name: "Planner",
    description: "Calendar, chores, shopping lists and meal plans for the whole family.",
    start_url: `${BASE_PATH}/program/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My program", url: `${BASE_PATH}/program/` },
      { name: "Map", url: `${BASE_PATH}/map/` },
      { name: "Calendar", url: `${BASE_PATH}/calendar/` },
      { name: "Shopping list", url: `${BASE_PATH}/shopping/` },
    ],
  };
}
