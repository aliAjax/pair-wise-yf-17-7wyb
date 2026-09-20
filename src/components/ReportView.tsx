import { useState } from "react";
import { useStore } from "../business/storage";
import { RULES, STATUS_LABEL } from "../business/rules";
import { buildReport } from "../business/report";
import { centText, formatDateTime, statusClass } from "./util";

/** 单次维护报告页：选中任一批次查看放行前后的完整报告 */
export function ReportView() {
  const state = useStore((s) => s);
  const [batchId, setBatchId] = useState(state.activeBatchId);
  const report = buildReport(state, state.batches.some((b) => b.id === batchId) ? batchId : state.activeBatchId);

  if (!report) return null;
  const { batch, rows, counts, snapshot } = report;

  return (
    <section className="panel report-panel">
      <div className="heading">
        <div>
          <p>单次维护报告</p>
          <h2>
            {batch.name} <span className={statusClass(batch.status)}>{STATUS_LABEL[batch.status]}</span>
          </h2>
        </div>
        <select value={batch.id} onChange={(e) => setBatchId(e.target.value)}>
          {state.batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}（{STATUS_LABEL[b.status]}）
            </option>
          ))}
        </select>
      </div>

      <div className="report-meta">
        <div>
          <small>建立时间</small>
          <b>{formatDateTime(batch.createdAt)}</b>
        </div>
        <div>
          <small>覆盖音管</small>
          <b>{counts.total} 根</b>
        </div>
        <div>
          <small>已测量</small>
          <b>{counts.measured}</b>
        </div>
        <div>
          <small>可放行</small>
          <b className={counts.passable === counts.total ? "ok" : "bad"}>
            {counts.passable}/{counts.total}
          </b>
        </div>
        {batch.releasedAt && (
          <div>
            <small>放行时间</small>
            <b>{formatDateTime(batch.releasedAt)}</b>
          </div>
        )}
        {snapshot && (
          <div>
            <small>快照接管</small>
            <b>{snapshot.archivedCount} 条旧结果只读归档</b>
          </div>
        )}
      </div>

      <p className="rule-strip">
        放行条件：温度 {RULES.temperatureMin}–{RULES.temperatureMax}℃ ｜ 湿度 ≤{RULES.humidityMax}% ｜ |音分偏差| ≤
        {RULES.centLimit} ｜ 簧片状态正常 ｜ 同栓不缺测
      </p>

      <div className="report-table-wrap">
        <table className="matrix report-table">
          <thead>
            <tr>
              <th>音管</th>
              <th>偏差</th>
              <th>温度</th>
              <th>湿度</th>
              <th>簧片</th>
              <th>状态</th>
              <th>备注 / 接管</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pipe.key} className={r.missing ? "row-missing" : ""}>
                <td>
                  <b>{r.pipe.pipeNo}</b>
                  <small>
                    {r.pipe.pitch} · {r.pipe.stop}
                  </small>
                </td>
                <td className={r.overCent ? "cell-bad" : ""}>{r.missing ? "—" : `${centText(r.cents)} cent`}</td>
                <td className={r.environmentBlocked && r.temperature < RULES.temperatureMin || r.environmentBlocked && r.temperature > RULES.temperatureMax ? "cell-bad" : ""}>
                  {r.missing ? "—" : `${r.temperature}℃`}
                </td>
                <td className={r.environmentBlocked && r.humidity > RULES.humidityMax ? "cell-bad" : ""}>{r.missing ? "—" : `${r.humidity}%`}</td>
                <td>{r.pipe.reedStop ? (r.missing ? "—" : r.reedAbnormal ? <span className="tag tag-bad">异常</span> : "正常") : "—"}</td>
                <td>
                  {r.missing ? (
                    <span className="tag tag-bad">同栓缺测</span>
                  ) : r.retest ? (
                    <span className="tag tag-retest">待复测</span>
                  ) : r.overCent ? (
                    <span className="tag tag-bad">超差</span>
                  ) : r.reedAbnormal ? (
                    <span className="tag tag-bad">簧片异常</span>
                  ) : (
                    <span className="tag tag-ok">合格</span>
                  )}
                </td>
                <td className="note-cell">
                  {r.note && <span>{r.note}</span>}
                  {r.supersededResult && (
                    <small className="supersede">
                      接管只读记录：{centText(r.supersededResult.cents)} cent（{r.supersededResult.batchName}，
                      {formatDateTime(r.supersededResult.releasedAt)}）
                    </small>
                  )}
                  {r.environmentBlocked && <small className="supersede warn-text">{r.envReasons.join("、")}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {snapshot && (
        <p className="snapshot-note">
          批次快照 #{snapshot.id.slice(-6)} 已于 {formatDateTime(snapshot.releasedAt)} 固化（{snapshot.measuredCount} 行），后续不可变更。
        </p>
      )}
    </section>
  );
}
