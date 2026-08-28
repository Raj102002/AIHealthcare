import MonoLabel from "./MonoLabel";

interface Props {
  sourceName: string;
  sectionPath: string;
  url?: string;
}

// Bordered mono chip: source name in bone, title/section in moss. Replaces
// the previous plain-text source list.
export default function CitationChip({ sourceName, sectionPath, url }: Props) {
  const inner = (
    <div className="inline-flex flex-col gap-0.5 border border-rule rounded-md px-2.5 py-1.5 hover:border-assay transition-colors">
      <MonoLabel className="text-bone">{sourceName}</MonoLabel>
      <MonoLabel className="text-moss">{sectionPath}</MonoLabel>
    </div>
  );

  if (!url) return inner;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-block">
      {inner}
    </a>
  );
}
