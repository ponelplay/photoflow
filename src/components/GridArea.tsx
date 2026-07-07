import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUi } from "../stores/ui";
import { useLibrary } from "../stores/library";
import { pickFolder, LABELS, api, isTauri } from "../lib/backend";
import { CheckIcon, ImageIcon, StarIcon } from "./Icons";
import { ContextMenu, ConfirmDialog, RenameDialog, type MenuItem } from "./Overlays";
import { BatchRenameDialog, BatchConvertDialog } from "./BatchDialogs";
import Compare from "./Compare";
import DuplicatesDialog from "./DuplicatesDialog";
import Culling from "./Culling";

const IMAGE_RE = /\.(jpe?g|jfif|png|gif|bmp|webp|tiff?)$/i;

export default function GridArea() {
  const { thumbSize, setThumbSize, viewMode, setViewMode } = useUi();
  const {
    folderPath,
    folderName,
    images,
    loading,
    error,
    selected,
    selectAt,
    selectAll,
    clearSelection,
    openViewer,
    viewerIndex,
    deleteSelected,
    copySelectedTo,
    moveSelectedTo,
    renameOne,
    entries,
    filterText,
    minRating,
    filterLabel,
    setMinRating,
    setFilterLabel,
    visibleIndices,
    setRating,
    setLabel,
  } = useLibrary();

  const visible = visibleIndices();
  const filtersActive = !!filterText.trim() || minRating > 0 || !!filterLabel;

  // ── Virtualització: només es renderitzen les files en pantalla ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setViewport({ w: el.clientWidth, h: el.clientHeight })
    );
    ro.observe(el);
    setViewport({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [folderPath, images.length]);

  const GAP = 12;
  const cell = thumbSize;
  const cols = Math.max(1, Math.floor((viewport.w - GAP * 2) / (cell + GAP)));
  const rowH = cell + GAP;
  const totalRows = Math.ceil(visible.length / cols);
  const totalH = totalRows * rowH + GAP;
  const OVERSCAN = 2;
  const firstRow = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const lastRow = Math.min(
    totalRows - 1,
    Math.ceil((scrollTop + viewport.h) / rowH) + OVERSCAN
  );
  const slice: { idx: number; row: number; col: number }[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = 0; col < cols; col++) {
      const v = row * cols + col;
      if (v < visible.length) slice.push({ idx: visible[v], row, col });
    }
  }

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [batchDialog, setBatchDialog] = useState<"rename" | "convert" | null>(
    null
  );
  const [compareOpen, setCompareOpen] = useState(false);
  const [dupesOpen, setDupesOpen] = useState(false);
  const [cullingOpen, setCullingOpen] = useState(false);
  const [importOver, setImportOver] = useState(false);
  const toast = useUi((s) => s.toast);
  const { refresh } = useLibrary();

  const importDropped = async (files: File[]) => {
    const imgs = files.filter((f) => IMAGE_RE.test(f.name));
    if (!imgs.length || !folderPath) return;
    if (!isTauri) {
      toast("Mode demostració: no s'importa res");
      return;
    }
    let done = 0;
    for (const f of imgs) {
      try {
        await api.importFile(f, folderPath);
        done++;
      } catch (e) {
        toast(`${f.name}: ${e}`, "error");
      }
    }
    if (done > 0) {
      toast(done === 1 ? "1 foto importada" : `${done} fotos importades`);
      await refresh();
    }
  };

  const single =
    selected.size === 1 ? images[Array.from(selected)[0]] : null;
  const canCompare = selected.size >= 2 && selected.size <= 4;
  const compareItems = Array.from(selected)
    .sort((a, b) => a - b)
    .slice(0, 4)
    .map((i) => images[i])
    .filter(Boolean);

  // Línia de temps: agrupa el conjunt visible per mes, més recent primer
  const timelineGroups = (() => {
    if (viewMode !== "timeline") return [];
    const sorted = [...visible].sort(
      (a, b) => images[b].modified_ms - images[a].modified_ms
    );
    const groups: { key: string; title: string; items: number[] }[] = [];
    for (const i of sorted) {
      const d = new Date(images[i].modified_ms);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const last = groups[groups.length - 1];
      if (last?.key === key) last.items.push(i);
      else
        groups.push({
          key,
          title: d.toLocaleDateString("ca", {
            month: "long",
            year: "numeric",
          }),
          items: [i],
        });
    }
    return groups;
  })();

  const copyTo = async () => {
    const dest = await pickFolder("Copia les fotos a…");
    if (dest) copySelectedTo(dest);
  };
  const moveTo = async () => {
    const dest = await pickFolder("Mou les fotos a…");
    if (dest) moveSelectedTo(dest);
  };

  // Teclat de la graella (inactiu amb el visor obert o un diàleg actiu)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewerIndex !== null || confirmDelete || renameTarget || cullingOpen)
        return;
      if (e.target instanceof HTMLInputElement) return;
      if (
        e.key.toLowerCase() === "t" &&
        !e.ctrlKey &&
        !e.metaKey &&
        images.length > 0 &&
        !cullingOpen
      ) {
        setCullingOpen(true);
        return;
      }
      if (e.key === "Delete" && selected.size > 0) setConfirmDelete(true);
      else if (e.key === "F2" && single) setRenameTarget(single.path);
      else if (e.key === "Escape") clearSelection();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (!e.ctrlKey && !e.metaKey && selected.size > 0) {
        // Valoració 0-5 i etiquetes 6-9, com al mode triatge
        if (e.key >= "0" && e.key <= "5") setRating(Number(e.key));
        else if (e.key >= "6" && e.key <= "9")
          setLabel(LABELS[Number(e.key) - 6].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, confirmDelete, renameTarget, cullingOpen, images.length, selected, single, selectAll, clearSelection, setRating, setLabel]);

  const menuItems: MenuItem[] = [
    {
      label: "Obre",
      shortcut: "↵",
      disabled: !single,
      onClick: () => {
        const idx = Array.from(selected)[0];
        if (idx !== undefined) openViewer(idx);
      },
    },
    { label: "Copia a…", onClick: copyTo },
    { label: "Mou a…", onClick: moveTo },
    {
      label: `Renomena per lots (${selected.size})…`,
      onClick: () => setBatchDialog("rename"),
    },
    {
      label: `Converteix (${selected.size})…`,
      onClick: () => setBatchDialog("convert"),
    },
    {
      label: "Canvia el nom",
      shortcut: "F2",
      disabled: !single,
      onClick: () => single && setRenameTarget(single.path),
    },
    {
      label: `Compara (${selected.size})`,
      disabled: !canCompare,
      onClick: () => setCompareOpen(true),
    },
    {
      label:
        selected.size > 1 ? `Elimina (${selected.size})` : "Elimina",
      shortcut: "Supr",
      danger: true,
      onClick: () => setConfirmDelete(true),
    },
  ];

  /** Miniatura amb tots els gestors; `style` per al posicionament virtual */
  const thumbEl = (i: number, style?: React.CSSProperties) => {
    const img = images[i];
    const entry = entries[img.path];
    return (
      <div
        key={img.path}
        className="thumb"
        style={style}
        data-selected={selected.has(i)}
        draggable
        onDragStart={(e) => {
          // Arrossegar una foto no seleccionada la selecciona sola
          if (!selected.has(i)) selectAt(i, { ctrl: false, shift: false });
          e.dataTransfer.setData("application/x-photoflow", "1");
          e.dataTransfer.effectAllowed = "copyMove";
        }}
        onMouseDown={(e) => {
          if (e.shiftKey) e.preventDefault();
        }}
        onClick={(e) =>
          selectAt(i, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })
        }
        onDoubleClick={() => openViewer(i)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!selected.has(i)) selectAt(i, { ctrl: false, shift: false });
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <img
          src={img.src}
          alt={img.name}
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        <span className="check">
          <CheckIcon />
        </span>
        {(entry?.rating ?? 0) > 0 && (
          <span className="thumb-stars">{"★".repeat(entry!.rating)}</span>
        )}
        {entry?.label && (
          <span
            className="thumb-label-dot"
            style={{
              background: LABELS.find((l) => l.id === entry.label)?.color,
            }}
          />
        )}
        <span className="label">{img.name}</span>
      </div>
    );
  };

  return (
    <section
      className="panel grid-area"
      data-import={importOver}
      onDragOver={(e) => {
        if (!folderPath) return;
        const t = e.dataTransfer.types;
        if (t.includes("application/x-photoflow") || !t.includes("Files"))
          return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setImportOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setImportOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setImportOver(false);
        importDropped(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="grid-toolbar">
        <div className="breadcrumb" title={folderPath ?? ""}>
          <span>Aquest equip</span>
          {folderName && (
            <>
              <span className="sep">›</span>
              <span className="current">{folderName}</span>
            </>
          )}
        </div>
        <div className="filter-strip">
          <div className="star-filter" title="Filtra per valoració mínima">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className="star-btn"
                data-active={minRating >= n}
                onClick={() => setMinRating(minRating === n ? 0 : n)}
              >
                <StarIcon size={13} />
              </button>
            ))}
          </div>
          <div className="label-filter" title="Filtra per etiqueta">
            {LABELS.map((l) => (
              <button
                key={l.id}
                className="label-dot"
                data-active={filterLabel === l.id}
                style={{ background: l.color }}
                title={l.name}
                onClick={() =>
                  setFilterLabel(filterLabel === l.id ? null : l.id)
                }
              />
            ))}
          </div>
        </div>
        <div className="spacer" />
        {selected.size > 0 && (
          <div className="toolbar-actions">
            {canCompare && (
              <button
                className="toolbar-btn"
                onClick={() => setCompareOpen(true)}
                title="Compara les fotos seleccionades costat a costat"
              >
                Compara ({selected.size})
              </button>
            )}
            <button
              className="toolbar-btn"
              onClick={() => setBatchDialog("rename")}
              title="Renomena la selecció amb un patró"
            >
              Renomena{selected.size > 1 ? ` (${selected.size})` : ""}…
            </button>
            <button
              className="toolbar-btn"
              onClick={() => setBatchDialog("convert")}
              title="Converteix o redimensiona la selecció"
            >
              Converteix{selected.size > 1 ? ` (${selected.size})` : ""}…
            </button>
          </div>
        )}
        {images.length > 0 && selected.size === 0 && (
          <div className="toolbar-actions">
            <button
              className="toolbar-btn"
              onClick={() => setCullingOpen(true)}
              title="Mode triatge: revisa i valora amb teclat (T)"
            >
              Triatge
            </button>
            {images.length > 1 && (
              <button
                className="toolbar-btn subtle"
                onClick={() => setDupesOpen(true)}
                title="Cerca fotos duplicades o quasi-idèntiques en aquesta carpeta"
              >
                Duplicats
              </button>
            )}
          </div>
        )}
        <div className="view-toggle" title="Vista">
          <button
            className="icon-btn"
            data-active={viewMode === "grid"}
            title="Graella"
            onClick={() => setViewMode("grid")}
          >
            <ImageIcon size={15} />
          </button>
          <button
            className="icon-btn"
            data-active={viewMode === "timeline"}
            title="Línia de temps (per data)"
            onClick={() => setViewMode("timeline")}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M8 2v12M8 4.5h5M8 8h3.5M8 11.5h5" />
              <circle cx="3.5" cy="4.5" r="1.2" />
              <circle cx="3.5" cy="11.5" r="1.2" />
            </svg>
          </button>
        </div>
        <div className="zoom-slider">
          <ImageIcon size={12} />
          <input
            type="range"
            min={96}
            max={280}
            value={thumbSize}
            onChange={(e) => setThumbSize(Number(e.target.value))}
            title="Mida de les miniatures"
          />
          <ImageIcon size={18} />
        </div>
      </div>

      {!folderPath ? (
        <div className="empty-state">
          <div className="glyph">📁</div>
          <h2>Tria una carpeta</h2>
          <p>
            Navega per les unitats i carpetes de la barra lateral per veure les
            teves fotos.
          </p>
        </div>
      ) : loading ? (
        <div className="empty-state">
          <div className="glyph">⏳</div>
          <h2>Carregant…</h2>
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="glyph">⚠️</div>
          <h2>No s'ha pogut obrir</h2>
          <p>{error}</p>
        </div>
      ) : images.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">🖼</div>
          <h2>Cap foto aquí</h2>
          <p>Aquesta carpeta no conté imatges. Prova amb una subcarpeta.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">🔍</div>
          <h2>Cap coincidència</h2>
          <p>Cap foto compleix els filtres actius. Prova d'afluixar-los.</p>
        </div>
      ) : viewMode === "timeline" ? (
        <div className="grid-scroll">
          <div className="timeline">
            {timelineGroups.map((g) => (
              <section key={g.key} className="timeline-section">
                <h5>
                  {g.title} <span>{g.items.length}</span>
                </h5>
                <div
                  className="timeline-grid"
                  style={
                    { "--thumb-size": `${thumbSize}px` } as React.CSSProperties
                  }
                >
                  {g.items.map((i) => thumbEl(i))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="grid-scroll"
          ref={scrollRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div className="thumb-canvas" style={{ height: totalH }}>
            {slice.map(({ idx: i, row, col }) =>
              thumbEl(i, {
                position: "absolute",
                left: GAP + col * (cell + GAP),
                top: GAP + row * rowH,
                width: cell,
                height: cell,
              })
            )}
          </div>
        </div>
      )}

      <div className="statusbar">
        <span>
          {filtersActive
            ? `${visible.length} de ${images.length} elements`
            : `${images.length} elements`}
        </span>
        {selected.size > 0 && <span>{selected.size} seleccionats</span>}
        <span style={{ marginLeft: "auto" }} title={folderPath ?? ""}>
          {folderPath ?? ""}
        </span>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Envia a la paperera"
          body={
            selected.size === 1
              ? `Vols enviar «${single?.name}» a la paperera de reciclatge?`
              : `Vols enviar ${selected.size} fotos a la paperera de reciclatge?`
          }
          confirmLabel="Envia a la paperera"
          danger
          onConfirm={() => {
            setConfirmDelete(false);
            deleteSelected();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {batchDialog === "rename" && (
        <BatchRenameDialog onClose={() => setBatchDialog(null)} />
      )}
      {batchDialog === "convert" && (
        <BatchConvertDialog onClose={() => setBatchDialog(null)} />
      )}

      {compareOpen && compareItems.length >= 2 && (
        <Compare items={compareItems} onClose={() => setCompareOpen(false)} />
      )}
      {dupesOpen && <DuplicatesDialog onClose={() => setDupesOpen(false)} />}
      {cullingOpen && <Culling onClose={() => setCullingOpen(false)} />}

      {renameTarget && single && (
        <RenameDialog
          currentName={single.name}
          onSubmit={async (newName) => {
            setRenameTarget(null);
            await renameOne(renameTarget, newName);
          }}
          onCancel={() => setRenameTarget(null)}
        />
      )}
    </section>
  );
}
