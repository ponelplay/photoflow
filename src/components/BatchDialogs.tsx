import { useEffect, useRef, useState } from "react";
import { useLibrary } from "../stores/library";
import { useUi } from "../stores/ui";
import {
  api,
  demo,
  isTauri,
  pickFolder,
  type ConvertProgress,
  type RenamePair,
} from "../lib/backend";

const TOKENS = ["{data}", "{hora}", "{contador}", "{nom}"] as const;

/* ── Renomenat per lots ─────────────────────────────────────── */

export function BatchRenameDialog({ onClose }: { onClose: () => void }) {
  const { selectedPaths, refresh } = useLibrary();
  const toast = useUi((s) => s.toast);
  const [pattern, setPattern] = useState("{data}_{contador}");
  const [start, setStart] = useState(1);
  const [preview, setPreview] = useState<RenamePair[]>([]);
  const [busy, setBusy] = useState(false);
  const paths = useRef(selectedPaths()).current;
  const inputRef = useRef<HTMLInputElement>(null);

  // Vista prèvia amb debounce per no metrallar el backend mentre escrius
  useEffect(() => {
    const t = window.setTimeout(async () => {
      if (isTauri) {
        setPreview(
          await api.batchRenamePreview(paths, pattern, start).catch(() => [])
        );
      } else {
        setPreview(
          demo.renamePreview(
            paths.map((p) => p.split("\\").pop() ?? p),
            pattern,
            start
          )
        );
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [pattern, start, paths]);

  const apply = async () => {
    if (!isTauri) {
      toast("Mode demostració: no es canvia cap nom");
      onClose();
      return;
    }
    setBusy(true);
    try {
      const n = await api.batchRenameApply(
        preview.map((p) => ({ path: p.path, new_name: p.new_name }))
      );
      toast(n === 1 ? "1 fitxer renomenat" : `${n} fitxers renomenats`);
      await refresh();
      onClose();
    } catch (e) {
      toast(String(e), "error");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h4>Renomena {paths.length} fotos</h4>

        <div className="field-row">
          <input
            ref={inputRef}
            className="text-input"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            spellCheck={false}
            placeholder="Patró, p. ex. {data}_Viatge_{contador}"
          />
          <label className="field-inline">
            Inici
            <input
              className="text-input num"
              type="number"
              min={0}
              value={start}
              onChange={(e) => setStart(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <div className="token-row">
          {TOKENS.map((t) => (
            <button
              key={t}
              className="token-chip"
              onClick={() => {
                setPattern((p) => p + t);
                inputRef.current?.focus();
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="rename-preview">
          {preview.slice(0, 60).map((p) => (
            <div key={p.path} className="rename-row">
              <span className="old">{p.old_name}</span>
              <span className="arrow">→</span>
              <span className="new">{p.new_name}</span>
            </div>
          ))}
          {preview.length > 60 && (
            <div className="rename-row more">
              … i {preview.length - 60} més amb el mateix patró
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel·la
          </button>
          <button
            className="btn primary"
            disabled={busy || preview.length === 0}
            onClick={apply}
          >
            {busy ? "Renomenant…" : "Renomena-les"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Conversió per lots ─────────────────────────────────────── */

export function BatchConvertDialog({ onClose }: { onClose: () => void }) {
  const { selectedPaths } = useLibrary();
  const toast = useUi((s) => s.toast);
  const paths = useRef(selectedPaths()).current;

  const [format, setFormat] = useState<"jpeg" | "png" | "webp">("jpeg");
  const [quality, setQuality] = useState(85);
  const [maxSide, setMaxSide] = useState<string>("1920");
  const [destDir, setDestDir] = useState<string | null>(null);
  const [progress, setProgress] = useState<ConvertProgress | null>(null);

  const run = async () => {
    if (!isTauri) {
      toast("Mode demostració: no es converteix res");
      onClose();
      return;
    }
    setProgress({ done: 0, total: paths.length, current: "" });
    try {
      const result = await api.batchConvert(
        paths,
        {
          format,
          quality,
          maxSide: maxSide.trim() ? Number(maxSide) : null,
          destDir,
        },
        setProgress
      );
      if (result.errors.length) {
        toast(
          `${result.done} convertides, ${result.errors.length} amb error`,
          "error"
        );
      } else {
        toast(`${result.done} fotos convertides a ${result.dest}`);
      }
      onClose();
    } catch (e) {
      toast(String(e), "error");
      setProgress(null);
    }
  };

  const converting = progress !== null;

  return (
    <div className="modal-backdrop" onMouseDown={converting ? undefined : onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h4>Converteix {paths.length} fotos</h4>

        {!converting ? (
          <>
            <div className="field-row">
              <label className="field-inline">
                Format
                <select
                  className="text-input"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                >
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WebP (sense pèrdua)</option>
                </select>
              </label>
              {format === "jpeg" && (
                <label className="field-inline grow">
                  Qualitat {quality}
                  <input
                    type="range"
                    min={40}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                  />
                </label>
              )}
            </div>

            <div className="field-row">
              <label className="field-inline">
                Costat llarg màxim (px)
                <input
                  className="text-input num"
                  type="number"
                  min={0}
                  placeholder="original"
                  value={maxSide}
                  onChange={(e) => setMaxSide(e.target.value)}
                />
              </label>
            </div>

            <div className="field-row">
              <button
                className="btn"
                onClick={async () => {
                  const d = await pickFolder("Carpeta de sortida");
                  if (d) setDestDir(d);
                }}
              >
                Destinació…
              </button>
              <span className="dest-label" title={destDir ?? ""}>
                {destDir ?? "Subcarpeta «PhotoFlow» al costat dels originals"}
              </span>
            </div>

            <p className="modal-note">
              Els originals no es toquen mai: es creen còpies noves.
            </p>

            <div className="modal-actions">
              <button className="btn" onClick={onClose}>
                Cancel·la
              </button>
              <button className="btn primary" onClick={run}>
                Converteix
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`,
                }}
              />
            </div>
            <p className="modal-note">
              {progress.done} / {progress.total} · {progress.current}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
