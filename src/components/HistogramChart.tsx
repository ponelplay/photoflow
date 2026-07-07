import { useMemo } from "react";
import type { Histogram } from "../lib/backend";

const W = 256;
const H = 64;

/** Camí SVG d'una corba de bins normalitzada a l'alçada H */
function linePath(bins: number[], max: number, close: boolean): string {
  const pts = bins
    .map((v, x) => `${x},${(H - 1 - (v / max) * (H - 3)).toFixed(1)}`)
    .join(" L");
  return close ? `M0,${H} L${pts} L${W - 1},${H} Z` : `M${pts}`;
}

export default function HistogramChart({ data }: { data: Histogram }) {
  const paths = useMemo(() => {
    const max = Math.max(
      1,
      ...data.luma,
      ...data.r,
      ...data.g,
      ...data.b
    );
    return {
      luma: linePath(data.luma, max, true),
      r: linePath(data.r, max, false),
      g: linePath(data.g, max, false),
      b: linePath(data.b, max, false),
    };
  }, [data]);

  return (
    <div className="histogram">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Histograma de lluminositat i canals RGB"
      >
        <path d={paths.luma} className="hist-luma" />
        <path d={paths.r} className="hist-line" style={{ stroke: "var(--ch-r)" }} />
        <path d={paths.g} className="hist-line" style={{ stroke: "var(--ch-g)" }} />
        <path d={paths.b} className="hist-line" style={{ stroke: "var(--ch-b)" }} />
      </svg>
      <div className="hist-legend">
        <span>Fosc</span>
        <span className="hist-channels">
          <b style={{ color: "var(--ch-r)" }}>R</b>
          <b style={{ color: "var(--ch-g)" }}>G</b>
          <b style={{ color: "var(--ch-b)" }}>B</b>
        </span>
        <span>Clar</span>
      </div>
    </div>
  );
}
