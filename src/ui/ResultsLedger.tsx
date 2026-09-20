import { useState } from "react";
import type { TuningState } from "../domain/types";
import { CENT_LIMIT } from "../domain/rules";
import { formatCents, formatDateTime, formatHumidity, formatTemp } from "./format";

export function ResultsLedger({ state }: { state: TuningState }) {
  const [showArchive, setShowArchive] = useState(true);
  const current = Object.values(state.current).sort((a, b) =>
    a.pipeKey.localeCompare(b.pipeKey, "zh"),
  );
  const archive = [...state.archive].sort((a, b) => b.supersededAt - a.supersededAt);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>有效结果台账</p>
          <h2>每根音管仅一条有效结果</h2>
          <span className="muted">
            放行快照接管当前结果；复调成功后上一条结果保留为只读，不再参与放行。
          </span>
        </div>
        <button onClick={() => setShowArchive((v) => !v)}>
          {showArchive ? "隐藏只读档" : `显示只读档（${archive.length}）`}
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>场馆 / 音栓 / 音管</th>
              <th>偏差</th>
              <th>温/湿度</th>
              <th>簧片</th>
              <th>来源批次</th>
              <th>放行时间</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {current.map((r) => (
              <tr key={r.pipeKey}>
                <td><b>{r.pipeKey}</b></td>
                <td><span className={Math.abs(r.measurement.cents) > CENT_LIMIT ? "text-fault" : "text-ok"}>{formatCents(r.measurement.cents)}</span></td>
                <td>{formatTemp(r.measurement.temperature)} / {formatHumidity(r.measurement.humidity)}</td>
                <td>{r.measurement.reed === "normal" ? "正常" : "异常"}</td>
                <td className="muted">{r.batchId.startsWith("b-seed") ? r.batchId : r.batchId.slice(0, 16)}…</td>
                <td>{formatDateTime(r.releasedAt)}</td>
                <td className="muted">{r.measurement.note || "—"}</td>
              </tr>
            ))}
            {current.length === 0 && (
              <tr><td colSpan={7} className="muted">暂无放行结果。</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showArchive && (
        <>
          <h3 className="archive-title">只读历史（复调接管保留） · {archive.length}</h3>
          <div className="table-wrap">
            <table className="data-table archive-table">
              <thead>
                <tr>
                  <th>场馆 / 音栓 / 音管</th>
                  <th>旧偏差</th>
                  <th>旧放行批次/时间</th>
                  <th>接管批次</th>
                  <th>接管时间</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((a, i) => (
                  <tr key={a.pipeKey + i} className="row-readonly">
                    <td><b>{a.pipeKey}</b></td>
                    <td>{formatCents(a.result.measurement.cents)}</td>
                    <td className="muted">{a.result.batchId} · {formatDateTime(a.result.releasedAt)}</td>
                    <td className="muted">{a.supersededByBatchId}</td>
                    <td>{formatDateTime(a.supersededAt)}</td>
                  </tr>
                ))}
                {archive.length === 0 && (
                  <tr><td colSpan={5} className="muted">暂无被接管的只读记录。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
