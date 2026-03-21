import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Decision-Impact Fitness Tracker",
    short_name: "Fitness Tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1117",
    theme_color: "#f59e0b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
