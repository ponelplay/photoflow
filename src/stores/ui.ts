import { create } from "zustand";

export type Theme = "system" | "light" | "dark";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

export type ViewMode = "grid" | "timeline";

interface UiState {
  theme: Theme;
  infoPanelOpen: boolean;
  thumbSize: number;
  viewMode: ViewMode;
  toasts: Toast[];
  setTheme: (t: Theme) => void;
  toggleInfoPanel: () => void;
  setThumbSize: (px: number) => void;
  setViewMode: (m: ViewMode) => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
}

export const useUi = create<UiState>((set) => ({
  theme: "system",
  infoPanelOpen: true,
  thumbSize: 148,

  setTheme: (theme) => {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
    set({ theme });
  },

  toggleInfoPanel: () => set((s) => ({ infoPanelOpen: !s.infoPanelOpen })),
  setThumbSize: (thumbSize) => set({ thumbSize }),
  viewMode: "grid",
  setViewMode: (viewMode) => set({ viewMode }),

  toasts: [],
  toast: (text, kind = "info") => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      kind === "error" ? 6000 : 3500
    );
  },
}));
