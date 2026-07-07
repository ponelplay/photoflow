import { useEffect, useRef, useState } from "react";
import { useUi } from "../stores/ui";

/* ── Toasts ────────────────────────────────────────────────── */

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ── Menú contextual ───────────────────────────────────────── */

export interface MenuItem {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Reposiciona si surt de la finestra
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <button
          key={it.label}
          className="menu-item"
          data-danger={it.danger}
          disabled={it.disabled}
          onClick={() => {
            onClose();
            it.onClick();
          }}
        >
          <span>{it.label}</span>
          {it.shortcut && <kbd>{it.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}

/* ── Diàlegs modals ────────────────────────────────────────── */

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        <p>{body}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel·la
          </button>
          <button
            className="btn primary"
            data-danger={danger}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RenameDialog({
  currentName,
  onSubmit,
  onCancel,
}: {
  currentName: string;
  onSubmit: (newName: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Selecciona el nom sense l'extensió, que és el que es vol canviar
    const dot = currentName.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : currentName.length);
  }, [currentName]);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h4>Canvia el nom</h4>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim();
            if (v && v !== currentName) onSubmit(v);
            else onCancel();
          }}
        >
          <input
            ref={inputRef}
            className="text-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onCancel()}
            spellCheck={false}
          />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel·la
            </button>
            <button type="submit" className="btn primary">
              Canvia
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
