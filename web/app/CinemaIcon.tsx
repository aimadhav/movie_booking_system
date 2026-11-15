type IconName =
  | "arrow"
  | "chevron"
  | "search"
  | "pin"
  | "user"
  | "ticket"
  | "close"
  | "screen"
  | "sound"
  | "seat"
  | "check"
  | "clock"
  | "spark";

const paths: Record<IconName, string> = {
  arrow: "M4 12h15m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  search: "m20 20-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  pin: "M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  user: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  ticket: "M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Zm12 0v3m0 3v2m0 3v3",
  close: "m6 6 12 12M6 18 18 6",
  screen: "M3 3h18v13H3V3Zm9 13v5m-5 0h10",
  sound: "M3 9h4l5-5v16l-5-5H3V9Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16",
  seat: "M6 12V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7M4 10v7h16v-7M6 17v4m12-4v4M7 13h10",
  check: "m5 12 4 4L19 6",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
  spark: "m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z",
};

export function CinemaIcon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
