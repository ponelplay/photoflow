import { useUi } from "../stores/ui";
import { useLibrary } from "../stores/library";
import {
  SearchIcon,
  InfoIcon,
  SunIcon,
  MoonIcon,
  MinimizeIcon,
  MaximizeIcon,
  CloseIcon,
} from "./Icons";

const isTauri = "__TAURI_INTERNALS__" in window;

async function winAction(action: "minimize" | "toggleMaximize" | "close") {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  if (action === "minimize") await win.minimize();
  else if (action === "toggleMaximize") await win.toggleMaximize();
  else await win.close();
}

export default function Titlebar() {
  const { theme, setTheme, infoPanelOpen, toggleInfoPanel } = useUi();
  const { filterText, setFilterText } = useLibrary();

  const cycleTheme = () => {
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(isDark ? "light" : "dark");
  };

  const isDarkNow =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="logo-dot" />
        PhotoFlow
      </div>

      <div className="titlebar-search">
        <SearchIcon />
        <input
          placeholder="Cerca a la carpeta actual…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setFilterText("");
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      <div className="titlebar-actions">
        <button
          className="icon-btn"
          title={isDarkNow ? "Tema clar" : "Tema fosc"}
          onClick={cycleTheme}
        >
          {isDarkNow ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          className="icon-btn"
          title="Panell d'informació"
          data-active={infoPanelOpen}
          onClick={toggleInfoPanel}
        >
          <InfoIcon />
        </button>
      </div>

      {isTauri && (
        <div className="win-controls">
          <button title="Minimitza" onClick={() => winAction("minimize")}>
            <MinimizeIcon />
          </button>
          <button title="Maximitza" onClick={() => winAction("toggleMaximize")}>
            <MaximizeIcon />
          </button>
          <button
            className="close"
            title="Tanca"
            onClick={() => winAction("close")}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </header>
  );
}
