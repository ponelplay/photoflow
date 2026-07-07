import { useEffect, useState } from "react";
import { useLibrary } from "../stores/library";
import { useUi } from "../stores/ui";
import { api, isTauri, formatBytes } from "../lib/backend";

/**
 * Cerca fotos duplicades o quasi-idèntiques a la carpeta actual.
 * Per defecte preselecciona totes menys la primera de cada grup
 * (la que es conserva).
 */
export default function DuplicatesDialog({ onClose }: { onClose: () => void }) {
  const { images, refresh } = useLibrary();
  const toast = useUi((s) => s.toast);
  const [groups, setGroups] = useState<string[][] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const byPath = new Map(images.map((im) => [im.path, im]));

  useEffect(() => {
    const run = async () => {
      if (!isTauri) {
        // Mode demostració: dues "duplicades" de mostra
        const g =
          images.length >= 4
            ? [[images[0].path, images[1].path]]
            : [];
        setGroups(g);
        setChecked(new Set(g.flatMap((grp) => grp.slice(1))));
        return;
      }
      try {
        const g = await api.findDuplicates(images.map((im) => im.path));
        setGroups(g);
        setChecked(new Set(g.flatMap((grp) => grp.slice(1))));
      } catch (e) {
        toast(String(e), "error");
        onClose();
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteChecked = async () => {
    if (!isTauri) {
      toast("Mode demostració: no s'esborra res");
      onClose();
      return;
    }
    setBusy(true);
    try {
      const n = await api.deleteFiles(Array.from(checked));
      toast(`${n} duplicades enviades a la paperera`);
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
        <h4>Duplicats a la carpeta</h4>

        {groups === null ? (
          <p className="modal-note">Analitzant {images.length} fotos…</p>
        ) : groups.length === 0 ? (
          <p className="modal-note">
            Cap duplicat trobat entre les {images.length} fotos. 👌
          </p>
        ) : (
          <>
            <p className="modal-note">
              {groups.length} {groups.length === 1 ? "grup" : "grups"} de fotos
              quasi-idèntiques. Marcades les còpies; desmarca el que vulguis
              conservar.
            </p>
            <div className="dupe-list">
              {groups.map((group, gi) => (
                <div key={gi} className="dupe-group">
                  {group.map((p) => {
                    const item = byPath.get(p);
                    return (
                      <label key={p} className="dupe-item" title={p}>
                        <input
                          type="checkbox"
                          checked={checked.has(p)}
                          onChange={(e) => {
                            const next = new Set(checked);
                            if (e.target.checked) next.add(p);
                            else next.delete(p);
                            setChecked(next);
                          }}
                        />
                        {item && <img src={item.src} alt={item.name} />}
                        <span className="dupe-name">
                          {item?.name ?? p.split("\\").pop()}
                          <small>{item ? formatBytes(item.size) : ""}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Tanca
          </button>
          {(groups?.length ?? 0) > 0 && (
            <button
              className="btn primary"
              data-danger="true"
              disabled={busy || checked.size === 0}
              onClick={deleteChecked}
            >
              {busy
                ? "Enviant…"
                : `Envia ${checked.size} a la paperera`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
