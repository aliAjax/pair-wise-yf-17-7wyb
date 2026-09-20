import { useState } from "react";
import { createBatch } from "../business/storage";
import type { MaintenanceBatch } from "../domain/types";
import { BatchStatusBadge } from "./StatusBadge";
import { formatDateTime } from "./format";

interface SidebarProps {
  batches: MaintenanceBatch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
}

export function Sidebar({ batches, selectedId, onSelect, onCreated }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [venue, setVenue] = useState("");
  const [stop, setStop] = useState("");
  const [rows, setRows] = useState<Array<{ pipeNo: string; pitch: string }>>([
    { pipeNo: "", pitch: "" },
  ]);
  const [error, setError] = useState("");

  function submit() {
    try {
      const slots = rows
        .map((r) => ({ pipeNo: r.pipeNo.trim(), pitch: r.pitch.trim() }))
        .filter((r) => r.pipeNo.length > 0);
      const batch = createBatch({ venue, stop, slots });
      setVenue("");
      setStop("");
      setRows([{ pipeNo: "", pitch: "" }]);
      setError("");
      setOpen(false);
      onCreated(batch.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建批次失败");
    }
  }

  return (
    <aside className="panel sidebar">
      <div className="heading">
        <div>
          <p>维护批次</p>
          <h2>音栓列表</h2>
        </div>
        <button className="primary" onClick={() => setOpen((v) => !v)}>
          {open ? "收起" : "新建批次"}
        </button>
      </div>

      {open && (
        <div className="new-batch">
          <label>
            <span>场馆名称</span>
            <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="如 St.Mary" />
          </label>
          <label>
            <span>音栓</span>
            <input value={stop} onChange={(e) => setStop(e.target.value)} placeholder="如 Trumpet 8'" />
          </label>
          <div className="slot-editor">
            <span>计划测量音管（缺测将整批待复核）</span>
            {rows.map((row, i) => (
              <div className="slot-row" key={i}>
                <input
                  value={row.pipeNo}
                  placeholder="音管编号"
                  onChange={(e) =>
                    setRows(rows.map((r, j) => (j === i ? { ...r, pipeNo: e.target.value } : r)))
                  }
                />
                <input
                  value={row.pitch}
                  placeholder="音高"
                  onChange={(e) =>
                    setRows(rows.map((r, j) => (j === i ? { ...r, pitch: e.target.value } : r)))
                  }
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRows([...rows, { pipeNo: "", pitch: "" }])}
            >
              + 增加音管
            </button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="primary" onClick={submit}>
            创建并打开
          </button>
        </div>
      )}

      <div className="batch-list">
        {batches.length === 0 && <p className="muted">暂无批次，先新建一个维护批次。</p>}
        {batches.map((b) => (
          <button
            key={b.id}
            className={"batch-item" + (b.id === selectedId ? " selected" : "")}
            onClick={() => onSelect(b.id)}
          >
            <span className="batch-item-head">
              <b>{b.venue}</b>
              <BatchStatusBadge status={b.status} />
            </span>
            <span className="batch-item-sub">
              {b.stop} · {b.code}
            </span>
            <span className="batch-item-sub muted">{formatDateTime(b.createdAt)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
