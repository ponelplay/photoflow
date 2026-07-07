import { create } from "zustand";
import {
  api,
  demo,
  isTauri,
  type CatalogEntry,
  type ImageEntry,
  type Recipe,
} from "../lib/backend";
import { useUi } from "./ui";

export interface GridItem extends ImageEntry {
  src: string;
}

interface LibraryState {
  folderPath: string | null;
  folderName: string;
  images: GridItem[];
  loading: boolean;
  error: string | null;
  /** Índexs seleccionats dins d'images */
  selected: Set<number>;
  /** Ancoratge per a la selecció per rangs amb Shift */
  anchor: number | null;

  /** Índex de la foto oberta al visor, o null si el visor és tancat */
  viewerIndex: number | null;

  loadFolder: (path: string, name: string) => Promise<void>;
  selectAt: (index: number, mods: { ctrl: boolean; shift: boolean }) => void;
  clearSelection: () => void;
  selectAll: () => void;
  openViewer: (index: number) => void;
  closeViewer: () => void;
  viewerStep: (delta: number) => void;

  /** Catàleg: valoracions, etiquetes i receptes per ruta */
  entries: Record<string, CatalogEntry>;
  /** Filtres actius sobre la carpeta carregada */
  filterText: string;
  minRating: number;
  filterLabel: string | null;

  /** Índexs (sobre images) visibles amb els filtres actuals, en ordre */
  visibleIndices: () => number[];
  setFilterText: (t: string) => void;
  setMinRating: (n: number) => void;
  setFilterLabel: (l: string | null) => void;
  setRating: (rating: number) => Promise<void>;
  setLabel: (label: string | null) => Promise<void>;
  setRecipe: (path: string, recipe: Recipe | null) => Promise<void>;

  /** Rutes dels fitxers seleccionats, en ordre */
  selectedPaths: () => string[];
  refresh: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  copySelectedTo: (destDir: string) => Promise<void>;
  moveSelectedTo: (destDir: string) => Promise<void>;
  renameOne: (path: string, newName: string) => Promise<boolean>;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  folderPath: null,
  folderName: "",
  images: [],
  loading: false,
  error: null,
  selected: new Set(),
  anchor: null,

  loadFolder: async (path, name) => {
    set({ loading: true, error: null, folderPath: path, folderName: name });
    try {
      const listing = isTauri ? await api.listDir(path) : demo.listing(path);
      // Si mentre carregàvem l'usuari ha triat una altra carpeta, descarta
      if (get().folderPath !== path) return;
      const images = listing.images.map((img, i) => ({
        ...img,
        src: isTauri ? api.thumbSrc(img.path) : demo.thumbSrc(i),
      }));
      const entries = isTauri
        ? await api.catalogGet(images.map((im) => im.path)).catch(() => ({}))
        : {};
      if (get().folderPath !== path) return;
      set({
        images,
        entries,
        loading: false,
        selected: new Set(),
        anchor: null,
      });
    } catch (e) {
      if (get().folderPath !== path) return;
      set({ images: [], loading: false, error: String(e) });
    }
  },

  selectAt: (index, { ctrl, shift }) =>
    set((s) => {
      if (shift && s.anchor !== null) {
        // El rang segueix l'ordre visible (amb filtres actius)
        const visible = get().visibleIndices();
        const pa = visible.indexOf(s.anchor);
        const pb = visible.indexOf(index);
        const [a, b] = pa < pb ? [pa, pb] : [pb, pa];
        const range =
          pa === -1 || pb === -1 ? [index] : visible.slice(a, b + 1);
        const selected = ctrl
          ? new Set([...s.selected, ...range])
          : new Set(range);
        return { selected }; // l'ancoratge no es mou amb Shift
      }
      if (ctrl) {
        const selected = new Set(s.selected);
        if (selected.has(index)) selected.delete(index);
        else selected.add(index);
        return { selected, anchor: index };
      }
      return { selected: new Set([index]), anchor: index };
    }),

  clearSelection: () => set({ selected: new Set(), anchor: null }),
  selectAll: () => set({ selected: new Set(get().visibleIndices()) }),

  entries: {},
  filterText: "",
  minRating: 0,
  filterLabel: null,

  visibleIndices: () => {
    const s = get();
    const text = s.filterText.trim().toLowerCase();
    return s.images.reduce<number[]>((acc, img, i) => {
      if (text && !img.name.toLowerCase().includes(text)) return acc;
      const e = s.entries[img.path];
      if (s.minRating > 0 && (e?.rating ?? 0) < s.minRating) return acc;
      if (s.filterLabel && e?.label !== s.filterLabel) return acc;
      acc.push(i);
      return acc;
    }, []);
  },

  setFilterText: (filterText) => set({ filterText }),
  setMinRating: (minRating) => set({ minRating }),
  setFilterLabel: (filterLabel) => set({ filterLabel }),

  setRating: async (rating) => {
    const paths = get().selectedPaths();
    if (!paths.length) return;
    set((s) => {
      const entries = { ...s.entries };
      for (const p of paths) {
        entries[p] = {
          rating,
          label: entries[p]?.label ?? null,
          recipe: entries[p]?.recipe ?? null,
        };
      }
      return { entries };
    });
    if (isTauri) await api.catalogSetRating(paths, rating).catch(() => {});
  },

  setLabel: async (label) => {
    const paths = get().selectedPaths();
    if (!paths.length) return;
    set((s) => {
      const entries = { ...s.entries };
      for (const p of paths) {
        entries[p] = {
          rating: entries[p]?.rating ?? 0,
          label,
          recipe: entries[p]?.recipe ?? null,
        };
      }
      return { entries };
    });
    if (isTauri) await api.catalogSetLabel(paths, label).catch(() => {});
  },

  setRecipe: async (path, recipe) => {
    set((s) => ({
      entries: {
        ...s.entries,
        [path]: {
          rating: s.entries[path]?.rating ?? 0,
          label: s.entries[path]?.label ?? null,
          recipe,
        },
      },
    }));
    if (isTauri) await api.catalogSetRecipe(path, recipe).catch(() => {});
  },

  selectedPaths: () => {
    const s = get();
    return Array.from(s.selected)
      .sort((a, b) => a - b)
      .map((i) => s.images[i]?.path)
      .filter(Boolean);
  },

  refresh: async () => {
    const s = get();
    if (s.folderPath) await s.loadFolder(s.folderPath, s.folderName);
  },

  deleteSelected: async () => {
    const paths = get().selectedPaths();
    if (!paths.length) return;
    const toast = useUi.getState().toast;
    if (!isTauri) {
      toast("Mode demostració: no s'esborra res");
      return;
    }
    try {
      const n = await api.deleteFiles(paths);
      toast(
        n === 1
          ? "1 foto enviada a la paperera"
          : `${n} fotos enviades a la paperera`
      );
      await get().refresh();
    } catch (e) {
      toast(String(e), "error");
    }
  },

  copySelectedTo: async (destDir) => {
    const paths = get().selectedPaths();
    if (!paths.length) return;
    const toast = useUi.getState().toast;
    if (!isTauri) {
      toast("Mode demostració: no es copia res");
      return;
    }
    try {
      const n = await api.copyFiles(paths, destDir);
      toast(n === 1 ? "1 foto copiada" : `${n} fotos copiades`);
    } catch (e) {
      toast(String(e), "error");
    }
  },

  moveSelectedTo: async (destDir) => {
    const paths = get().selectedPaths();
    if (!paths.length) return;
    const toast = useUi.getState().toast;
    if (!isTauri) {
      toast("Mode demostració: no es mou res");
      return;
    }
    try {
      const n = await api.moveFiles(paths, destDir);
      toast(n === 1 ? "1 foto moguda" : `${n} fotos mogudes`);
      await get().refresh();
    } catch (e) {
      toast(String(e), "error");
    }
  },

  renameOne: async (path, newName) => {
    const toast = useUi.getState().toast;
    if (!isTauri) {
      toast("Mode demostració: no es canvia el nom");
      return true;
    }
    try {
      await api.renameFile(path, newName);
      toast("Nom canviat");
      await get().refresh();
      return true;
    } catch (e) {
      toast(String(e), "error");
      return false;
    }
  },

  viewerIndex: null,
  openViewer: (index) =>
    set({ viewerIndex: index, selected: new Set([index]), anchor: index }),
  closeViewer: () => set({ viewerIndex: null }),
  viewerStep: (delta) =>
    set((s) => {
      if (s.viewerIndex === null || s.images.length === 0) return {};
      // Navega dins el conjunt visible (respecta filtres actius)
      const visible = get().visibleIndices();
      if (visible.length === 0) return {};
      const pos = visible.indexOf(s.viewerIndex);
      const nextPos = Math.min(
        Math.max((pos === -1 ? 0 : pos) + delta, 0),
        visible.length - 1
      );
      const next = visible[nextPos];
      return { viewerIndex: next, selected: new Set([next]), anchor: next };
    }),
}));
