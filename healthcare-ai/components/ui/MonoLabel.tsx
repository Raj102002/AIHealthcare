// Every metadata string in the app -- labels, citations, timestamps, numeric
// readouts -- goes through this one component so the treatment (IBM Plex
// Mono, 11px, uppercase, letter-spacing .12em) is defined exactly once
// instead of hand-rolled per call site.
export default function MonoLabel({
  children,
  className = "",
  as: Tag = "span",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "span" | "p" | "div";
}) {
  return (
    <Tag className={`font-mono text-[11px] uppercase tracking-[0.12em] ${className}`}>
      {children}
    </Tag>
  );
}
