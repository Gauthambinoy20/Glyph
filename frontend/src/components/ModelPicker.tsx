import { useState } from "react";

import type { ModelInfo } from "../api";

interface Props {
  models: ModelInfo[];
  selected: string;
  onSelect: (id: string) => void;
}

/** A dropdown to choose the chat model. Free models are enabled; paid ones are disabled
    unless a paid key is set, and shown with a price note. */
export function ModelPicker({ models, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.id === selected);

  return (
    <div className="picker">
      <button className="picker-btn" onClick={() => setOpen((v) => !v)}>
        {current?.label ?? "Model"}
        <span className="chev">▾</span>
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 30 }}
          />
          <div className="picker-menu">
            {models.map((m) => (
              <button
                key={m.id}
                className="picker-item"
                disabled={!m.available}
                onClick={() => {
                  onSelect(m.id);
                  setOpen(false);
                }}
              >
                <div>
                  <div className="name">
                    {m.label} {m.id === selected && <span className="check">✓</span>}
                  </div>
                  <div className="note">{m.available ? m.note : `${m.note} · needs a key`}</div>
                </div>
                <span className={`tag ${m.tier}`}>{m.tier}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
