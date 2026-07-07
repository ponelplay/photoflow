import { useCallback, useEffect, useRef, useState } from "react";
import { useLibrary, type GridItem } from "../stores/library";
import { useUi } from "../stores/ui";
import {
  api,
  isTauri,
  EMPTY_RECIPE,
  type Recipe,
} from "../lib/backend";
import { RotateCwIcon, RotateCcwIcon } from "./Icons";

type Handle = "nw" | "ne" | "sw" | "se" | "move";

const MIN_CROP = 0.05;

export default function Editor({
  item,
  recipe,
  onClose,
}: {
  item: GridItem;
  recipe: Recipe | null;
  onClose: () => void;
}) {
  const { setRecipe, refresh } = useLibrary();
  const toast = useUi((s) => s.toast);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [r, setR] = useState<Recipe>({ ...EMPTY_RECIPE, ...(recipe ?? {}) });
  const [cropping, setCropping] = useState(!!r.crop);
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    crop: [number, number, number, number];
  } | null>(null);

  const crop: [number, number, number, number] = r.crop ?? [0, 0, 1, 1];

  /** Caixa on es mostra la imatge (ajustada i centrada, tenint en compte la rotació) */
  const layout = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || !img.naturalWidth) return;
    const sideways = r.rot % 180 !== 0;
    const rw = sideways ? img.naturalHeight : img.naturalWidth;
    const rh = sideways ? img.naturalWidth : img.naturalHeight;
    const scale = Math.min(
      (stage.clientWidth - 32) / rw,
      (stage.clientHeight - 32) / rh
    );
    const w = rw * scale;
    const h = rh * scale;
    setBox({
      x: (stage.clientWidth - w) / 2,
      y: (stage.clientHeight - h) / 2,
      w,
      h,
    });
  }, [r.rot]);

  useEffect(() => {
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, [layout]);

  // Esc tanca l'editor (sense desar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const startDrag = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { handle, startX: e.clientX, startY: e.clientY, crop };
  };

  const onDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !box.w) return;
    const dx = (e.clientX - d.startX) / box.w;
    const dy = (e.clientY - d.startY) / box.h;
    let [x, y, w, h] = d.crop;
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(Math.max(v, lo), hi);

    if (d.handle === "move") {
      x = clamp(x + dx, 0, 1 - w);
      y = clamp(y + dy, 0, 1 - h);
    } else {
      if (d.handle.includes("w")) {
        const nx = clamp(x + dx, 0, x + w - MIN_CROP);
        w = w + (x - nx);
        x = nx;
      }
      if (d.handle.includes("e")) w = clamp(w + dx, MIN_CROP, 1 - x);
      if (d.handle.includes("n")) {
        const ny = clamp(y + dy, 0, y + h - MIN_CROP);
        h = h + (y - ny);
        y = ny;
      }
      if (d.handle.includes("s")) h = clamp(h + dy, MIN_CROP, 1 - y);
    }
    setR((prev) => ({ ...prev, crop: [x, y, w, h] }));
  };

  const endDrag = () => (drag.current = null);

  const currentRecipe = (): Recipe | null => {
    const out: Recipe = {
      ...r,
      crop:
        cropping &&
        r.crop &&
        !(r.crop[0] === 0 && r.crop[1] === 0 && r.crop[2] === 1 && r.crop[3] === 1)
          ? r.crop
          : null,
    };
    const noop =
      out.rot === 0 &&
      !out.crop &&
      !out.brightness &&
      !out.contrast &&
      !out.saturation;
    return noop ? null : out;
  };

  const saveRecipe = async () => {
    await setRecipe(item.path, currentRecipe());
    toast(
      currentRecipe()
        ? "Recepta desada — l'original no s'ha tocat"
        : "Recepta esborrada"
    );
    onClose();
  };

  const exportCopy = async () => {
    const rec = currentRecipe();
    if (!rec) {
      toast("No hi ha canvis per exportar");
      return;
    }
    if (!isTauri) {
      toast("Mode demostració: no s'exporta res");
      return;
    }
    setBusy(true);
    try {
      const path = await api.exportEdited(item.path, rec);
      toast(`Còpia desada: ${path.split("\\").pop()}`);
      await refresh();
      onClose();
    } catch (e) {
      toast(String(e), "error");
      setBusy(false);
    }
  };

  const filter = `brightness(${1 + r.brightness / 100}) contrast(${
    1 + r.contrast / 100
  }) saturate(${1 + r.saturation / 100})`;

  const cropPx = {
    left: box.x + crop[0] * box.w,
    top: box.y + crop[1] * box.h,
    width: crop[2] * box.w,
    height: crop[3] * box.h,
  };

  return (
    <div className="editor">
      <div
        className="editor-stage"
        ref={stageRef}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
      >
        <img
          ref={imgRef}
          src={isTauri ? api.photoSrc(item.path) : item.src}
          alt={item.name}
          draggable={false}
          onLoad={layout}
          style={{
            left: box.x + box.w / 2,
            top: box.y + box.h / 2,
            width:
              r.rot % 180 !== 0
                ? `${box.h}px`
                : `${box.w}px`,
            transform: `translate(-50%, -50%) rotate(${r.rot}deg)`,
            filter,
          }}
        />

        {cropping && box.w > 0 && (
          <>
            {/* Ombra fora del retall: quatre franges */}
            <div className="crop-shade" style={{ left: 0, top: 0, right: 0, height: cropPx.top }} />
            <div className="crop-shade" style={{ left: 0, top: cropPx.top + cropPx.height, right: 0, bottom: 0 }} />
            <div className="crop-shade" style={{ left: 0, top: cropPx.top, width: cropPx.left, height: cropPx.height }} />
            <div className="crop-shade" style={{ left: cropPx.left + cropPx.width, top: cropPx.top, right: 0, height: cropPx.height }} />
            <div
              className="crop-rect"
              style={cropPx}
              onPointerDown={startDrag("move")}
            >
              {(["nw", "ne", "sw", "se"] as const).map((h) => (
                <span
                  key={h}
                  className={`crop-handle ${h}`}
                  onPointerDown={startDrag(h)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="editor-panel">
        <h4>Edició</h4>
        <p className="modal-note">
          No destructiva: l'original no es modifica mai.
        </p>

        <div className="editor-group">
          <div className="group-title">Rotació</div>
          <div className="editor-row">
            <button
              className="btn"
              onClick={() => setR((p) => ({ ...p, rot: (p.rot + 270) % 360 }))}
            >
              <RotateCcwIcon size={14} /> Esquerra
            </button>
            <button
              className="btn"
              onClick={() => setR((p) => ({ ...p, rot: (p.rot + 90) % 360 }))}
            >
              <RotateCwIcon size={14} /> Dreta
            </button>
          </div>
        </div>

        <div className="editor-group">
          <div className="group-title">Retall</div>
          <div className="editor-row">
            <button
              className="btn"
              data-active={cropping}
              onClick={() => {
                setCropping(!cropping);
                if (!cropping && !r.crop)
                  setR((p) => ({ ...p, crop: [0.1, 0.1, 0.8, 0.8] }));
              }}
            >
              {cropping ? "Treu el retall" : "Retalla"}
            </button>
          </div>
        </div>

        <div className="editor-group">
          <div className="group-title">Llum i color</div>
          {(
            [
              ["Brillantor", "brightness"],
              ["Contrast", "contrast"],
              ["Saturació", "saturation"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="editor-slider">
              <span>
                {label} <b>{r[key] > 0 ? `+${r[key]}` : r[key]}</b>
              </span>
              <input
                type="range"
                min={-100}
                max={100}
                value={r[key]}
                onChange={(e) =>
                  setR((p) => ({ ...p, [key]: Number(e.target.value) }))
                }
                onDoubleClick={() => setR((p) => ({ ...p, [key]: 0 }))}
              />
            </label>
          ))}
        </div>

        <div className="editor-actions">
          <button
            className="btn"
            onClick={() => {
              setR({ ...EMPTY_RECIPE });
              setCropping(false);
            }}
          >
            Restableix
          </button>
          <button className="btn" disabled={busy} onClick={exportCopy}>
            {busy ? "Exportant…" : "Exporta còpia"}
          </button>
          <button className="btn primary" onClick={saveRecipe}>
            Desa la recepta
          </button>
        </div>
        <button className="btn editor-close" onClick={onClose}>
          Tanca sense desar
        </button>
      </div>
    </div>
  );
}
