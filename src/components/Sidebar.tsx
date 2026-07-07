import { useEffect, useState } from "react";
import { useLibrary } from "../stores/library";
import {
  api,
  demo,
  isTauri,
  type Drive,
  type FolderEntry,
  type QuickLink,
} from "../lib/backend";
import { FolderIcon, ImageIcon, StarIcon, ClockIcon, ChevronIcon } from "./Icons";

/** Gestors comuns perquè un element de l'arbre accepti fotos arrossegades */
function useDropTarget(destPath: string) {
  const { copySelectedTo, moveSelectedTo } = useLibrary();
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes("application/x-photoflow")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        if (!e.dataTransfer.types.includes("application/x-photoflow")) return;
        if (e.ctrlKey) copySelectedTo(destPath);
        else moveSelectedTo(destPath);
      },
    },
  };
}

/** Node de l'arbre amb càrrega mandrosa dels fills */
function TreeNode({ name, path }: { name: string; path: string }) {
  const { folderPath, loadFolder } = useLibrary();
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FolderEntry[] | null>(null);
  const { over, handlers } = useDropTarget(path);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && children === null) {
      try {
        const listing = isTauri ? await api.listDir(path) : demo.listing(path);
        setChildren(listing.folders);
      } catch {
        setChildren([]); // sense permisos o unitat buida
      }
    }
  };

  // Mantenir un arrossegament sobre una carpeta tancada l'expandeix
  useEffect(() => {
    if (!over || open) return;
    const t = window.setTimeout(toggle, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, open]);

  return (
    <div>
      <button
        className="tree-item"
        data-selected={folderPath === path}
        data-open={open}
        data-drop={over}
        onClick={() => {
          loadFolder(path, name);
          if (!open) toggle();
        }}
        {...handlers}
      >
        <span
          className="chevron"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <ChevronIcon />
        </span>
        <FolderIcon size={15} />
        <span className="tree-label">{name}</span>
      </button>
      {open && children && children.length > 0 && (
        <div className="tree-children">
          {children.map((c) => (
            <TreeNode key={c.path} name={c.name} path={c.path} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuickLinkItem({ link }: { link: QuickLink }) {
  const { folderPath, loadFolder } = useLibrary();
  const { over, handlers } = useDropTarget(link.path);
  return (
    <button
      className="tree-item"
      data-selected={folderPath === link.path}
      data-drop={over}
      onClick={() => loadFolder(link.path, link.name)}
      {...handlers}
    >
      <span className="chevron" />
      <ImageIcon size={15} />
      {link.name}
    </button>
  );
}

export default function Sidebar() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [quick, setQuick] = useState<QuickLink[]>([]);

  useEffect(() => {
    if (isTauri) {
      api.listDrives().then(setDrives).catch(() => setDrives([]));
      api.quickLinks().then(setQuick).catch(() => setQuick([]));
    } else {
      setDrives(demo.drives);
      setQuick(demo.quickLinks);
    }
  }, []);

  return (
    <aside className="panel sidebar">
      <div className="sidebar-section">
        <div className="sidebar-heading">Col·leccions</div>
        <button className="tree-item" title="Properament">
          <span className="chevron" />
          <ClockIcon size={15} />
          Recents
        </button>
        <button className="tree-item" title="Properament">
          <span className="chevron" />
          <StarIcon size={15} />
          Preferides
        </button>
      </div>

      {quick.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-heading">Accessos ràpids</div>
          {quick.map((q) => (
            <QuickLinkItem key={q.path} link={q} />
          ))}
        </div>
      )}

      <div className="sidebar-section">
        <div className="sidebar-heading">Aquest equip</div>
        {drives.map((d) => (
          <TreeNode key={d.path} name={d.name} path={d.path} />
        ))}
      </div>
    </aside>
  );
}
