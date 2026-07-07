import { useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "../stores/library";
import { useUi } from "../stores/ui";
import { api, isTauri, LABELS } from "../lib/backend";

/**
 * Mode triatge: revisió ràpida només amb teclat.
 * 1-5 valora i avança · 6-9 etiqueta i avança · X marca per descartar
 * i avança · fletxes naveguen · Retrocés torna · Esc acaba (amb resum).
 */
export default function Culling({ onClose }: { onClose: () => void }) {
  const { images, visibleIndices, entries, setRating, setLabel, selectAt, refresh } =
    useLibrary();
  const toast = useUi((s) => s.toast);

  // Instantània de l'ordre en obrir: els filtres no remouen fotos a mig triatge
  const order = useRef(visibleIndices()).current;
  const [pos, setPos] = useState(0);
  const [discards, setDiscards] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState(false);
  const [rated, setRated] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const idx = order[pos];
  const item = idx !== undefined ? images[idx] : undefined;
  const entry = item ? entries[item.path] : undefined;

  const advance = () => {
    if (pos + 1 >= order.length) setSummary(true);
    else setPos(pos + 1);
  };

  // Sincronitza la selecció perquè el panell d'info segueixi el triatge
  useEffect(() => {
    if (idx !== undefined) selectAt(idx, { ctrl: false, shift: false });
  }, [idx, selectAt]);

  // Precàrrega de les dues següents
  useEffect(() => {
    for (const d of [1, 2]) {
      const adj = images[order[pos + d]];
      if (adj) new Image().src = isTauri ? api.photoSrc(adj.path) : adj.src;
    }
  }, [pos, order, images]);

  useEffect(() => {
    if (summary) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (!item) return;
      if (e.key >= "0" && e.key <= "5") {
        setRating(Number(e.key));
        setRated((s) => new Set(s).add(item.path));
        advance();
      } else if (e.key >= "6" && e.key <= "9") {
        setLabel(LABELS[Number(e.key) - 6].id);
        setRated((s) => new Set(s).add(item.path));
        advance();
      } else if (e.key.toLowerCase() === "x") {
        setDiscards((s) => {
          const next = new Set(s);
          if (next.has(item.path)) next.delete(item.path);
          else next.add(item.path);
          return next;
        });
        advance();
      } else if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft" || e.key === "Backspace")
        setPos((p) => Math.max(0, p - 1));
      else if (e.key === "Escape") setSummary(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, pos, summary]);

  const finish = async (deleteDiscards: boolean) => {
    if (deleteDiscards && discards.size > 0) {
      if (!isTauri) {
        toast("Mode demostració: no s'esborra res");
        onClose();
        return;
      }
      setBusy(true);
      try {
        const n = await api.deleteFiles(Array.from(discards));
        toast(`Triatge acabat: ${n} descartades a la paperera`);
        await refresh();
      } catch (e) {
        toast(String(e), "error");
      }
    } else {
      toast(`Triatge acabat: ${rated.size} valorades`);
    }
    onClose();
  };

  const discarded = item ? discards.has(item.path) : false;
  const label = useMemo(
    () => LABELS.find((l) => l.id === entry?.label),
    [entry?.label]
  );

  if (summary) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <h4>Triatge acabat</h4>
          <p>
            Has revisat {Math.min(pos + 1, order.length)} de {order.length}{" "}
            fotos: {rated.size} valorades i {discards.size} marcades per
            descartar.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setSummary(false)}>
              Continua el triatge
            </button>
            <button className="btn" disabled={busy} onClick={() => finish(false)}>
              Conserva-ho tot
            </button>
            {discards.size > 0 && (
              <button
                className="btn primary"
                data-danger="true"
                disabled={busy}
                onClick={() => finish(true)}
              >
                {busy
                  ? "Enviant…"
                  : `Envia ${discards.size} a la paperera`}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className="culling" data-discarded={discarded}>
      <div className="culling-hud">
        <span className="culling-pos">
          Triatge · {pos + 1} / {order.length}
        </span>
        <span className="culling-name" title={item.path}>
          {item.name}
        </span>
        <span className="culling-state">
          {(entry?.rating ?? 0) > 0 && (
            <b className="culling-stars">{"★".repeat(entry!.rating)}</b>
          )}
          {label && (
            <b className="label-dot" style={{ background: label.color, opacity: 1 }} />
          )}
          {discards.size > 0 && (
            <b className="culling-discards">✕ {discards.size}</b>
          )}
        </span>
      </div>

      <div className="culling-stage">
        <img
          src={isTauri ? api.photoSrc(item.path) : item.src}
          alt={item.name}
          draggable={false}
        />
        {discarded && <div className="culling-x">✕</div>}
      </div>

      <div className="culling-help">
        <kbd>1-5</kbd> valora · <kbd>6-9</kbd> etiqueta · <kbd>X</kbd> descarta ·{" "}
        <kbd>←</kbd> enrere · <kbd>→</kbd> salta · <kbd>Esc</kbd> acaba
      </div>
    </div>
  );
}
