import { TopBar } from "./primitives";
import { Icons } from "./icons";

export function Placeholder({
  title,
  crumbs,
  description,
  endpointHint,
}: {
  title: string;
  crumbs?: string[];
  description: string;
  endpointHint?: string;
}) {
  return (
    <>
      <TopBar title={title} crumbs={crumbs} />
      <div className="content narrow">
        <div className="card" style={{ padding: 0 }}>
          <div className="empty">
            <div className="icon-wrap"><Icons.Sparkle size={26} /></div>
            <h4>Écran back-office à venir</h4>
            <p>{description}</p>
            {endpointHint && (
              <p className="mono" style={{ marginTop: 8, color: "var(--ink-500)", fontSize: 11.5 }}>
                {endpointHint}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
