import { useEffect, useState } from "react";
import { useUi } from "../stores/ui";
import { useLibrary } from "../stores/library";
import {
  api,
  demo,
  isTauri,
  formatBytes,
  formatDate,
  LABELS,
  type FileInfo,
  type Histogram,
} from "../lib/backend";
import HistogramChart from "./HistogramChart";
import { StarIcon } from "./Icons";

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="meta-row">
      <span className="key">{k}</span>
      <span className="val">{v}</span>
    </div>
  );
}

export default function InfoPanel() {
  const { infoPanelOpen } = useUi();
  const { images, selected, entries, setRating, setLabel } = useLibrary();
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [hist, setHist] = useState<Histogram | null>(null);

  // Mostra la info de l'última foto seleccionada
  const lastIndex =
    selected.size > 0 ? Math.max(...Array.from(selected)) : null;
  const current = lastIndex !== null ? images[lastIndex] : null;

  useEffect(() => {
    if (!current) {
      setInfo(null);
      setHist(null);
      return;
    }
    let stale = false;
    const load = async () => {
      const [data, h] = await Promise.all([
        isTauri
          ? api.fileInfo(current.path).catch(() => null)
          : Promise.resolve(demo.fileInfo(current.path, lastIndex ?? 0)),
        isTauri
          ? api.histogram(current.path).catch(() => null)
          : Promise.resolve(demo.histogram(lastIndex ?? 0)),
      ]);
      if (!stale) {
        setInfo(data);
        setHist(h);
      }
    };
    load();
    return () => {
      stale = true;
    };
  }, [current?.path]);

  if (!infoPanelOpen) return null;

  if (!current) {
    return (
      <aside className="panel info-panel">
        <h3>Informació</h3>
        <p className="info-hint">
          Selecciona una foto per veure'n els detalls i les metadades.
        </p>
      </aside>
    );
  }

  return (
    <aside className="panel info-panel">
      <h3 title={current.name}>
        {selected.size > 1 ? `${selected.size} elements` : current.name}
      </h3>

      <div className="info-stars" title="Valoració (tecles 1-5, 0 esborra)">
        {[1, 2, 3, 4, 5].map((n) => {
          const rating = entries[current.path]?.rating ?? 0;
          return (
            <button
              key={n}
              className="star-btn"
              data-active={rating >= n}
              onClick={() => setRating(rating === n ? 0 : n)}
            >
              <StarIcon size={16} />
            </button>
          );
        })}
      </div>
      <div className="info-labels" title="Etiqueta de color (tecles 6-9)">
        {LABELS.map((l) => (
          <button
            key={l.id}
            className="label-dot"
            data-active={entries[current.path]?.label === l.id}
            style={{ background: l.color, color: l.color }}
            title={l.name}
            onClick={() =>
              setLabel(entries[current.path]?.label === l.id ? null : l.id)
            }
          />
        ))}
      </div>

      {hist && (
        <div className="meta-group">
          <div className="group-title">Histograma</div>
          <HistogramChart data={hist} />
        </div>
      )}

      <div className="meta-group">
        <div className="group-title">Fitxer</div>
        <Row k="Nom" v={info?.name ?? current.name} />
        <Row k="Mida" v={formatBytes(info?.size ?? current.size)} />
        <Row
          k="Dimensions"
          v={info?.width ? `${info.width} × ${info.height}` : null}
        />
        <Row
          k="Modificat"
          v={formatDate(info?.modified_ms ?? current.modified_ms)}
        />
      </div>

      {(info?.camera || info?.exposure || info?.taken) && (
        <div className="meta-group">
          <div className="group-title">Captura</div>
          <Row k="Càmera" v={info?.camera} />
          <Row k="Objectiu" v={info?.lens} />
          <Row k="Exposició" v={info?.exposure} />
          <Row k="Obertura" v={info?.aperture} />
          <Row k="ISO" v={info?.iso} />
          <Row k="Focal" v={info?.focal} />
          <Row k="Data de captura" v={info?.taken} />
        </div>
      )}
    </aside>
  );
}
