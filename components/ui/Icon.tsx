/**
 * Inline SVG-iconen in Tabler-stijl (24×24, stroke 2, round caps).
 * Het v14-design gebruikt de Tabler-webfont via CDN; hier inline
 * zodat er geen externe font-dependency en FOUT-flits is.
 */

const paths: Record<string, string[]> = {
  phone: [
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2",
  ],
  whatsapp: [
    "M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21",
    "M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1",
  ],
  "calendar-check": [
    "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
    "M16 3v4M8 3v4M4 11h16",
    "M9.5 16l1.7 1.7L14.5 14",
  ],
  "arrow-right": ["M5 12h14", "M13 6l6 6-6 6"],
  check: ["M5 12l5 5L20 7"],
  car: [
    "M7 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
    "M13 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
    "M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9m-6-6h15",
  ],
  plane: [
    "M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2-7H6l-2 2H1l2-4-2-4h3l2 2h5L9 3h3l4 7z",
  ],
  briefcase: [
    "M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
    "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2",
    "M4 13h16",
  ],
  user: [
    "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
    "M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2",
  ],
  users: [
    "M5 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
    "M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2",
    "M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9",
  ],
  confetti: [
    "M12 3l1.7 3.4L17 8l-3.3 1.6L12 13l-1.7-3.4L7 8l3.3-1.6z",
    "M19 15l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z",
    "M5 15l.8 1.7 1.7.8-1.7.8L5 20l-.8-1.7-1.7-.8 1.7-.8z",
  ],
  receipt: [
    "M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2z",
    "M9 8h6M9 12h6",
  ],
  armchair: [
    "M5 11a2 2 0 0 1 2 2v2h10v-2a2 2 0 1 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z",
    "M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5",
    "M6 19v2M18 19v2",
  ],
  "message-check": [
    "M8 9h8M8 13h4",
    "M11 18H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6",
    "M15 19l2 2 4-4",
  ],
  leaf: [
    "M5 21c.5-4.5 2.5-8 7-10",
    "M19 5c0 8-3.8 13-10 13-1.2 0-2.5-.3-3.5-1C5 15.5 5 13 5 11c0-4 3.5-7 9-7 2 0 3.7.3 5 1z",
  ],
  luggage: [
    "M6 8h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z",
    "M9 8V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3",
    "M9 21v1M15 21v1",
  ],
  "map-pin": [
    "M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z",
    "M9 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  ],
  "shield-check": [
    "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z",
    "M9.5 12l1.8 1.8L15 10",
  ],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  bolt: ["M13 3L4 14h6l-1 7 9-11h-6z"],
  sun: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  ],
  mail: [
    "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M3 7l9 6 9-6",
  ],
  "circle-check": [
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    "M9 12l2 2 4-4",
  ],
  lock: [
    "M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z",
    "M8 11V7a4 4 0 0 1 8 0v4",
    "M12 15v2",
  ],
  "credit-card": [
    "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M3 10h18",
    "M7 15h4",
  ],
  x: ["M6 6l12 12M18 6L6 18"],
  quote: [
    "M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v7a3 3 0 0 1-3 3",
    "M19 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v7a3 3 0 0 1-3 3",
  ],
  coin: [
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    "M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 6v2M12 16v2",
  ],
  heart: [
    "M12 20l-7.1-7.1a4.6 4.6 0 0 1 6.5-6.5l.6.6.6-.6a4.6 4.6 0 0 1 6.5 6.5z",
  ],
  award: [
    "M8 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
    "M9.5 12.4L8 21l4-2.5 4 2.5-1.5-8.6",
  ],
  "file-invoice": [
    "M14 3v4a1 1 0 0 0 1 1h4",
    "M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z",
    "M9 8h2M9 12h6M9 16h6",
  ],
  "user-check": [
    "M5 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
    "M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 3.7 2.5",
    "M15 19l2 2 4-4",
  ],
  repeat: [
    "M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3-3 3",
    "M20 12v3a3 3 0 0 1-3 3H4m3 3l-3-3 3-3",
  ],
  building: [
    "M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16",
    "M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1",
  ],
  "trending-up": ["M3 17l6-6 4 4 8-8", "M14 7h7v7"],
  sparkles: [
    "M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zM16 6a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zM9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6z",
  ],
  "chevron-down": ["M6 9l6 6 6-6"],
  "info-circle": [
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    "M12 8h.01M11 12h1v4h1",
  ],
  flag: ["M5 21V5", "M5 5c6-3 8 3 14 0v9c-6 3-8-3-14 0"],
  star: [
    "M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.2l5.9-.9z",
  ],
  send: ["M10 14L21 3", "M21 3l-6.5 18a.5.5 0 0 1-1 0L10 14l-7-3.5a.5.5 0 0 1 0-1z"],
  "chart-bar": [
    "M4 20h16",
    "M5 12h3v8H5zM10 7h3v13h-3zM15 3h3v17h-3z",
  ],
  rotate: ["M20 11A8 8 0 1 0 12 20", "M20 4v7h-7"],
  camera: [
    "M4 8a2 2 0 0 1 2-2h1l2-3h6l2 3h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
    "M9 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  ],
  globe: [
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    "M3.6 9h16.8M3.6 15h16.8",
    "M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18",
  ],
  "id-badge": [
    "M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z",
    "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0M10 3h4",
  ],
  "layout-dashboard": [
    "M4 4h6v8H4zM4 16h6v4H4zM14 12h6v8h-6zM14 4h6v4h-6z",
  ],
};

export default function Icon({
  name,
  size = 20,
  className,
}: {
  name: keyof typeof paths | string;
  size?: number;
  className?: string;
}) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}
