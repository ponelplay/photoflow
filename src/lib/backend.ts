import { invoke, convertFileSrc, Channel } from "@tauri-apps/api/core";

export const isTauri = "__TAURI_INTERNALS__" in window;

export interface Drive {
  name: string;
  path: string;
}
export interface QuickLink {
  name: string;
  path: string;
}
export interface FolderEntry {
  name: string;
  path: string;
}
export interface ImageEntry {
  name: string;
  path: string;
  size: number;
  modified_ms: number;
}
export interface DirListing {
  folders: FolderEntry[];
  images: ImageEntry[];
}
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified_ms: number;
  width: number | null;
  height: number | null;
  camera: string | null;
  lens: string | null;
  exposure: string | null;
  aperture: string | null;
  iso: string | null;
  focal: string | null;
  taken: string | null;
}

export interface Histogram {
  luma: number[];
  r: number[];
  g: number[];
  b: number[];
}

export const api = {
  histogram: (path: string) => invoke<Histogram>("histogram", { path }),
  listDrives: () => invoke<Drive[]>("list_drives"),
  quickLinks: () => invoke<QuickLink[]>("quick_links"),
  listDir: (path: string) => invoke<DirListing>("list_dir", { path }),
  fileInfo: (path: string) => invoke<FileInfo>("file_info", { path }),
  thumbSrc: (path: string) => convertFileSrc(path, "thumb"),
  photoSrc: (path: string) => convertFileSrc(path, "photo"),
  deleteFiles: (paths: string[]) => invoke<number>("delete_files", { paths }),
  copyFiles: (paths: string[], destDir: string) =>
    invoke<number>("copy_files", { paths, destDir }),
  moveFiles: (paths: string[], destDir: string) =>
    invoke<number>("move_files", { paths, destDir }),
  renameFile: (path: string, newName: string) =>
    invoke<string>("rename_file", { path, newName }),
  batchRenamePreview: (paths: string[], pattern: string, start: number) =>
    invoke<RenamePair[]>("batch_rename_preview", { paths, pattern, start }),
  batchRenameApply: (pairs: { path: string; new_name: string }[]) =>
    invoke<number>("batch_rename_apply", { pairs }),
  catalogGet: (paths: string[]) =>
    invoke<Record<string, CatalogEntry>>("catalog_get", { paths }),
  catalogSetRating: (paths: string[], rating: number) =>
    invoke<void>("catalog_set_rating", { paths, rating }),
  catalogSetLabel: (paths: string[], label: string | null) =>
    invoke<void>("catalog_set_label", { paths, label }),
  catalogSetRecipe: (path: string, recipe: Recipe | null) =>
    invoke<void>("catalog_set_recipe", { path, recipe }),
  exportEdited: (path: string, recipe: Recipe) =>
    invoke<string>("export_edited", { path, recipe }),
  findDuplicates: (paths: string[], threshold = 5) =>
    invoke<string[][]>("find_duplicates", { paths, threshold }),
  importFile: async (file: File, destDir: string) => {
    const body = new Uint8Array(await file.arrayBuffer());
    return invoke<string>("import_file", body, {
      headers: {
        "x-file-name": encodeURIComponent(file.name),
        "x-dest-dir": encodeURIComponent(destDir),
      },
    });
  },
  batchConvert: (
    paths: string[],
    opts: ConvertOpts,
    onProgress: (p: ConvertProgress) => void
  ) => {
    const channel = new Channel<ConvertProgress>();
    channel.onmessage = onProgress;
    return invoke<ConvertResult>("batch_convert", {
      paths,
      opts,
      onProgress: channel,
    });
  },
};

export interface Recipe {
  rot: number;
  crop: [number, number, number, number] | null;
  brightness: number;
  contrast: number;
  saturation: number;
}
export interface CatalogEntry {
  rating: number;
  label: string | null;
  recipe: Recipe | null;
}

export const EMPTY_RECIPE: Recipe = {
  rot: 0,
  crop: null,
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export const LABELS = [
  { id: "red", name: "Vermell", color: "#d05353" },
  { id: "yellow", name: "Groc", color: "#d1a13a" },
  { id: "green", name: "Verd", color: "#3f8a52" },
  { id: "blue", name: "Blau", color: "#5a86d8" },
] as const;

export interface RenamePair {
  path: string;
  old_name: string;
  new_name: string;
}
export interface ConvertOpts {
  format: "jpeg" | "png" | "webp";
  quality: number;
  maxSide: number | null;
  destDir: string | null;
}
export interface ConvertProgress {
  done: number;
  total: number;
  current: string;
}
export interface ConvertResult {
  done: number;
  dest: string;
  errors: string[];
}

/** Obre el selector de carpetes natiu; null si l'usuari cancel·la */
export async function pickFolder(title: string): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const result = await open({ directory: true, title });
  return typeof result === "string" ? result : null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("ca", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/* ── Mode demostració (preview al navegador, sense Tauri) ──── */

function placeholderThumb(i: number): string {
  const hues = [32, 38, 26, 205, 160, 12, 45, 220];
  const h = hues[i % hues.length];
  const l1 = 55 + ((i * 7) % 20);
  const l2 = 25 + ((i * 11) % 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h} 60% ${l1}%)"/>
      <stop offset="1" stop-color="hsl(${(h + 30) % 360} 50% ${l2}%)"/>
    </linearGradient></defs>
    <rect width="300" height="300" fill="url(#g)"/>
    <circle cx="${60 + ((i * 37) % 180)}" cy="${50 + ((i * 53) % 120)}" r="${28 + ((i * 13) % 30)}"
      fill="hsl(${(h + 60) % 360} 70% 80% / 0.35)"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const demo = {
  drives: [{ name: "C:", path: "C:\\" }] as Drive[],
  quickLinks: [
    { name: "Imatges", path: "demo://Imatges" },
    { name: "Escriptori", path: "demo://Escriptori" },
    { name: "Baixades", path: "demo://Baixades" },
  ] as QuickLink[],
  listing(path: string): DirListing {
    const isRoot = path.endsWith(":\\");
    return {
      folders: isRoot
        ? [
            { name: "Viatges", path: `${path}Viatges` },
            { name: "Família", path: `${path}Família` },
          ]
        : [],
      images: Array.from({ length: 24 }, (_, i) => ({
        name: `IMG_${4210 + i}.jpg`,
        path: `${path}\\IMG_${4210 + i}.jpg`,
        size: 3_400_000 + i * 137_000,
        modified_ms: Date.UTC(2026, 6, 1, 18, 42) + i * 60_000,
      })),
    };
  },
  thumbSrc: placeholderThumb,
  renamePreview(
    names: string[],
    pattern: string,
    start: number
  ): RenamePair[] {
    const digits = Math.max(3, String(start + names.length).length);
    return names.map((old, i) => {
      const stem = old.replace(/\.[^.]+$/, "");
      const ext = old.slice(stem.length);
      let base = pattern
        .replaceAll("{data}", "2026-07-01")
        .replaceAll("{hora}", "18-42-05")
        .replaceAll("{contador}", String(start + i).padStart(digits, "0"))
        .replaceAll("{nom}", stem);
      if (!base.trim()) base = stem;
      return { path: old, old_name: old, new_name: `${base}${ext}` };
    });
  },

  histogram(i: number): Histogram {
    // Mescla de gaussianes sintètica, diferent per cada foto de mostra
    const gauss = (mu: number, sigma: number, amp: number) => (x: number) =>
      amp * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));
    const mk = (offset: number) => {
      const f1 = gauss(70 + ((i * 13 + offset) % 60), 28, 900);
      const f2 = gauss(180 + ((i * 7 + offset) % 50), 22, 600);
      return Array.from({ length: 256 }, (_, x) =>
        Math.round(f1(x) + f2(x) + 40)
      );
    };
    const r = mk(0);
    const g = mk(25);
    const b = mk(50);
    const luma = r.map((v, x) =>
      Math.round(0.2126 * v + 0.7152 * g[x] + 0.0722 * b[x])
    );
    return { luma, r, g, b };
  },

  fileInfo(path: string, i: number): FileInfo {
    return {
      name: path.split("\\").pop() ?? path,
      path,
      size: 3_400_000 + i * 137_000,
      modified_ms: Date.UTC(2026, 6, 1, 18, 42) + i * 60_000,
      width: 6000,
      height: 4000,
      camera: "Sony α7 IV",
      lens: "FE 35mm F1.8",
      exposure: "1/250 s",
      aperture: "f/2.8",
      iso: "200",
      focal: "35 mm",
      taken: "2026-07-01 18:42",
    };
  },
};
