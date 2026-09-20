import {
  buildBatchReport,
  downloadReport,
  REASON_TEXT,
} from "../business/report";
import { CENT_LIMIT } from "../domain/rules";
import type { MaintenanceBatch } from "../domain/types";
import { AttemptKindTag, BatchStatusBadge } from "./StatusBadge";
import { formatCents, formatDateTime, formatHumidity, formatTemp } from "./format";

export function ReportView({ batch }: { batch: MaintenanceBatch }) {
  const report = buildBatchReport(batch);
  return (
    <section className="panel report-view">
      <div className="heading">
        <div>
          <p>单次维护报告</p>
          <h2>
            {batch.venue} · {batch.stop}
          </h2>
          <span className="muted">
            {batch.code} · 生成依据为批次{batch.status === "released" ? "放行快照（冻结）" : "当前测量数据"}
          </span>
        </div>
        <div className="heading-actions">
          <BatchStatusBadge status={report.status} />
          <button className="primary" onClick={() => downloadReport(report)}>
            导出报告 JSON
          </button>
        </div>
      </div>

      <div className={"banner banner-" + (report.status === "released" ? "ok" : report.status === "pending_review" ? "fault" : "retest")}>
        <b>{report.status === "released" ? "维护放行完成" : report.status === "pending_review" ? "整批待复核" : "整批待复测"}</b>
        <span>{report.summary}</span>
      </div>

      <div className="report-metrics">
        <article><small>计划音管</small><strong>{report.rows.length}</strong></article>
        <article><small>已测量</small><strong>{report.measuredCount}</strong></article>
        <article><small>缺测</small><strong className={report.missingCount ? "text-fault" : ""}>{report.missingCount}</strong></article>
        <article><small>待复测</small><strong className={report.retestCount ? "text-retest" : ""}>{report.retestCount}</strong></article>
        <article><small>缺陷</small><strong className={report.faultCount ? "text-fault" : ""}>{report.faultCount}</strong></article>
        <article><small>放行接管</small><strong className="text-ok">{report.releasedCount}</strong></article>
        <article><small>最大|偏差|</small><strong className={report.maxAbsCents > CENT_LIMIT ? "text-fault" : ""}>{report.maxAbsCents}</strong></article>
      </div>

      {report.decision && (
        <p className="muted">
          最近裁决：{formatDateTime(report.decision.decidedAt)}
          {report.decision.reasons.length > 0 &&
            ` · ${report.decision.reasons.map((r) => REASON_TEXT[r]).join("、")}`}
        </p>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>音管</th>
              <th>偏差</th>
              <th>温/湿度</th>
              <th>簧片</th>
              <th>记录时间</th>
              <th>记录类型</th>
              <th>结论</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const m = row.measurement;
              return (
                <tr key={row.slot.pipeNo} className={row.missing ? "row-missing" : row.envBlocked ? "row-retest" : row.faults.length ? "row-fault" : ""}>
                  <td><b>{row.slot.pipeNo}</b><span className="muted"> {row.slot.pitch}</span></td>
                  <td>{m ? <span className={Math.abs(m.cents) > CENT_LIMIT ? "text-fault" : "text-ok"}>{formatCents(m.cents)}</span> : "—"}</td>
                  <td>{m ? `${formatTemp(m.temperature)} / ${formatHumidity(m.humidity)}` : "—"}</td>
                  <td>{m ? (m.reed === "normal" ? "正常" : "异常") : "—"}</td>
                  <td>{m ? formatDateTime(m.recordedAt) : "—"}</td>
                  <td>{m ? <AttemptKindTag kind={m.kind} /> : "—"}</td>
                  <td>
                    {row.reasons.length === 0 ? (
                      <span className="text-ok">合格{report.status === "released" ? "·已放行" : ""}</span>
                    ) : (
                      row.reasons.map((r) => REASON_TEXT[r]).join("；")
                    )}
                  </td>
                  <td className="muted">{m?.note || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
