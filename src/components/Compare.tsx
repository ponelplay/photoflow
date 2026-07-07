import { useEffect, useRef, useState } from "react";
import { useLibrary, type GridItem } from "../stores/library";
import { api, isTauri } from "../lib/backend";
import { CloseIcon } from "./Icons";

/**
 * Comparació de 2-4 fotos amb zoom i desplaçament SINCRONITZATS:
 * el que fas en un panell s'aplica a tots alhora.
 */
export default function Compare({
  items,
  onClose,
}: {
  items: GridItem[];
  onClose: () => void;
}) {
  const { entries } = useLibrary();
  const [view, setView] = useState({ scale: 1, px: 0, py: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "0") setView({ scale: 1, px: 0, py: 0 });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const cols = items.length <= 2 ? items.length : 2;

  return (
    <div
      className="compare"
      onMouseMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        setView((v) => ({ ...v, px: v.px + dx, py: v.py + dy }));
      }}
      onMouseDown={(e) => {
        if (e.button === 0) drag.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
      onWheel={(e) => {
        const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
        setView((v) => ({
          ...v,
          scale: Math.min(Math.max(v.scale * factor, 0.5), 8),
        }));
      }}
      onDoubleClick={() => setView({ scale: 1, px: 0, py: 0 })}
    >
      <div className="compare-topbar">
        <span className="viewer-meta">
          Comparació · {Math.round(view.scale * 100)}% · roda = zoom,
          arrossega = mou, doble clic = reinicia
        </span>
        <button className="viewer-btn" title="Tanca (Esc)" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div
        className="compare-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {items.map((item) => {
          const rating = entries[item.path]?.rating ?? 0;
          return (
            <figure key={item.path} className="compare-pane">
              <div className="compare-img-wrap">
                <img
                  src={isTauri ? api.photoSrc(item.path) : item.src}
                  alt={item.name}
                  draggable={false}
                  style={{
                    transform: `translate(${view.px}px, ${view.py}px) scale(${view.scale})`,
                  }}
                />
              </div>
              <figcaption>
                {item.name}
                {rating > 0 && (
                  <span className="compare-stars"> {"★".repeat(rating)}</span>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
