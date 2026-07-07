import { useCallback, useEffect, useRef, useState } from "react";
import { useLibrary } from "../stores/library";
import { api, isTauri } from "../lib/backend";
import {
  ChevronIcon,
  CloseIcon,
  RotateCwIcon,
  RotateCcwIcon,
  EditIcon,
  StarIcon,
} from "./Icons";
import Editor from "./Editor";

const MAX_SCALE = 8;

function fullSrc(item: { path: string; src: string }): string {
  return isTauri ? api.photoSrc(item.path) : item.src;
}

/**
 * Model de vista centrat: (px, py) és el desplaçament del centre de la
 * imatge respecte al centre del contenidor, en píxels de pantalla.
 * rot és la rotació visual (0/90/180/270), no toca mai el fitxer.
 */
interface ViewState {
  scale: number;
  px: number;
  py: number;
  rot: number;
  fit: boolean;
}

export default function Viewer() {
  const {
    images,
    viewerIndex,
    closeViewer,
    viewerStep,
    entries,
    setRating,
    visibleIndices,
  } = useLibrary();
  const [editing, setEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<ViewState>({
    scale: 1,
    px: 0,
    py: 0,
    rot: 0,
    fit: true,
  });
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<number>();
  const drag = useRef<{ x: number; y: number } | null>(null);

  const item = viewerIndex !== null ? images[viewerIndex] : null;

  /** Escala d'ajust tenint en compte la rotació (a 90/270 s'intercanvien costats) */
  const fitScale = useCallback((rot: number) => {
    const c = containerRef.current;
    const im = imgRef.current;
    if (!c || !im || !im.naturalWidth || !c.clientWidth) return 1;
    const sideways = rot % 180 !== 0;
    const rw = sideways ? im.naturalHeight : im.naturalWidth;
    const rh = sideways ? im.naturalWidth : im.naturalHeight;
    return Math.min(c.clientWidth / rw, c.clientHeight / rh, 1);
  }, []);

  const applyFit = useCallback(() => {
    setView((v) => ({ ...v, scale: fitScale(v.rot), px: 0, py: 0, fit: true }));
  }, [fitScale]);

  const rotate = useCallback(
    (delta: number) => {
      setView((v) => {
        const rot = (v.rot + delta + 360) % 360;
        // En girar sempre reajustem: és el que esperes per "veure-la bé"
        return { scale: fitScale(rot), px: 0, py: 0, rot, fit: true };
      });
    },
    [fitScale]
  );

  /** Zoom mantenint fix el punt P del contenidor */
  const zoomAt = useCallback(
    (pxAt: number, pyAt: number, factor: number) => {
      const c = containerRef.current;
      if (!c) return;
      setView((v) => {
        const target = Math.min(
          Math.max(v.scale * factor, fitScale(v.rot) * 0.5),
          MAX_SCALE
        );
        const k = target / v.scale;
        const cx = c.clientWidth / 2 + v.px;
        const cy = c.clientHeight / 2 + v.py;
        const nx = pxAt + (cx - pxAt) * k;
        const ny = pyAt + (cy - pyAt) * k;
        return {
          ...v,
          scale: target,
          px: nx - c.clientWidth / 2,
          py: ny - c.clientHeight / 2,
          fit: false,
        };
      });
    },
    [fitScale]
  );

  // En canviar de foto: neteja la rotació; l'onLoad farà l'ajust
  useEffect(() => {
    setView((v) => ({ ...v, rot: 0, fit: true }));
  }, [viewerIndex]);

  // Teclat: Esc, fletxes, +/-, 0 ajusta, 1-5 valora, E edita, R gira
  useEffect(() => {
    if (viewerIndex === null || editing) return;
    const onKey = (e: KeyboardEvent) => {
      const c = containerRef.current;
      const cx = (c?.clientWidth ?? 0) / 2;
      const cy = (c?.clientHeight ?? 0) / 2;
      switch (e.key) {
        case "Escape":
          closeViewer();
          break;
        case "ArrowLeft":
          viewerStep(-1);
          break;
        case "ArrowRight":
          viewerStep(1);
          break;
        case "+":
        case "=":
          zoomAt(cx, cy, 1.25);
          break;
        case "-":
          zoomAt(cx, cy, 0.8);
          break;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
          // Valoració directa mentre revises: la base del mode triatge
          setRating(Number(e.key));
          break;
        case "r":
          rotate(90);
          break;
        case "R":
          rotate(-90);
          break;
        case "e":
        case "E":
          setEditing(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, editing, closeViewer, viewerStep, zoomAt, applyFit, rotate, setRating]);

  // Precàrrega de la foto anterior i següent
  useEffect(() => {
    if (viewerIndex === null) return;
    for (const d of [-1, 1]) {
      const adj = images[viewerIndex + d];
      if (adj) new Image().src = fullSrc(adj);
    }
  }, [viewerIndex, images]);

  // Els controls s'amaguen sols quan el ratolí queda quiet
  const pokeControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2200);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  // Reajusta si canvia la mida de la finestra (només en mode ajustat)
  const fitRef = useRef(view.fit);
  fitRef.current = view.fit;
  useEffect(() => {
    if (viewerIndex === null) return;
    const onResize = () => {
      if (fitRef.current) applyFit();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [viewerIndex, applyFit]);

  if (viewerIndex === null || !item) return null;

  const zoomPct = Math.round(view.scale * 100);
  const entry = entries[item.path];
  const recipe = entry?.recipe ?? null;
  // La recepta es previsualitza amb CSS: gratuït i sense tocar el fitxer
  const recipeFilter = recipe
    ? `brightness(${1 + recipe.brightness / 100}) contrast(${
        1 + recipe.contrast / 100
      }) saturate(${1 + recipe.saturation / 100})`
    : undefined;
  const visible = visibleIndices();
  const pos = visible.indexOf(viewerIndex);
  const rating = entry?.rating ?? 0;

  return (
    <div
      className="viewer"
      ref={containerRef}
      data-controls={controlsVisible}
      onMouseMove={(e) => {
        pokeControls();
        if (drag.current) {
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setView((v) => ({ ...v, px: v.px + dx, py: v.py + dy, fit: false }));
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 0) drag.current = { x: e.clientX, y: e.clientY };
      }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
      onWheel={(e) => {
        const rect = containerRef.current!.getBoundingClientRect();
        zoomAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          e.deltaY < 0 ? 1.2 : 1 / 1.2
        );
      }}
      onDoubleClick={(e) => {
        if (view.fit) {
          const rect = containerRef.current!.getBoundingClientRect();
          zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1 / view.scale);
        } else {
          applyFit();
        }
      }}
    >
      <img
        ref={imgRef}
        src={fullSrc(item)}
        alt={item.name}
        draggable={false}
        onLoad={applyFit}
        style={{
          transform: `translate(calc(-50% + ${view.px}px), calc(-50% + ${view.py}px)) scale(${view.scale}) rotate(${
            view.rot + (recipe?.rot ?? 0)
          }deg)`,
          filter: recipeFilter,
        }}
      />

      <div className="viewer-topbar">
        <span className="viewer-title" title={item.path}>
          {item.name}
          {recipe && <span className="viewer-edited"> · editada</span>}
        </span>
        <span className="viewer-stars" title="Valoració (tecles 1-5, 0 esborra)">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className="star-btn"
              data-active={rating >= n}
              onClick={(e) => {
                e.stopPropagation();
                setRating(rating === n ? 0 : n);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <StarIcon size={14} />
            </button>
          ))}
        </span>
        <span className="viewer-meta">
          {(pos === -1 ? viewerIndex : pos) + 1} /{" "}
          {visible.length || images.length} · {zoomPct}%
          {view.rot !== 0 && ` · ${view.rot}°`}
        </span>
        <button
          className="viewer-btn"
          title="Edita (E)"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <EditIcon />
        </button>
        <button
          className="viewer-btn"
          title="Gira a l'esquerra (Maj+R)"
          onClick={(e) => {
            e.stopPropagation();
            rotate(-90);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <RotateCcwIcon />
        </button>
        <button
          className="viewer-btn"
          title="Gira a la dreta (R)"
          onClick={(e) => {
            e.stopPropagation();
            rotate(90);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <RotateCwIcon />
        </button>
        <button
          className="viewer-btn"
          title="Tanca (Esc)"
          onClick={closeViewer}
        >
          <CloseIcon />
        </button>
      </div>

      {editing && (
        <Editor
          item={item}
          recipe={recipe}
          onClose={() => setEditing(false)}
        />
      )}

      {pos > 0 && (
        <button
          className="viewer-nav prev"
          title="Anterior (←)"
          onClick={(e) => {
            e.stopPropagation();
            viewerStep(-1);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <ChevronIcon size={22} />
        </button>
      )}
      {pos !== -1 && pos < visible.length - 1 && (
        <button
          className="viewer-nav next"
          title="Següent (→)"
          onClick={(e) => {
            e.stopPropagation();
            viewerStep(1);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <ChevronIcon size={22} />
        </button>
      )}
    </div>
  );
}
