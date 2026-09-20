import { useStore } from "../business/storage";
import { summarizeAnomalies } from "../business/report";
import { centText } from "./util";

/** 异常音管统计：口径与报告、闸门完全一致 */
export function AnomalyStats() {
  const state = useStore((s) => s);
  const summary = summarizeAnomalies(state);

  const cards = [
    { label: "未放行超差测量", value: summary.overCentOpen.length, kind: "bad" },
    { label: "待复测（环境越限）", value: summary.pendingRetestPipes, kind: "warn" },
    { label: "待复核批次", value: summary.pendingReviewBatches, kind: "bad" },
    { label: "含缺测的批次", value: summary.missingBatches, kind: "bad" },
    { label: "已放行批次", value: summary.releasedBatches, kind: "ok" },
    { label: "只读归档记录", value: summary.archivedResults, kind: "neutral" },
  ];

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>异常统计</p>
          <h2>异常音管标记总览</h2>
        </div>
      </div>

      <div className="stat-grid">
        {cards.map((c) => (
          <article key={c.label} className={`stat-card stat-${c.kind}`}>
            <strong>{c.value}</strong>
            <small>{c.label}</small>
          </article>
        ))}
      </div>

      <div className="stat-columns">
        <div>
          <h3>超差测量（未放行，|偏差| &gt; 8）</h3>
          {summary.overCentOpen.length === 0 ? (
            <p className="muted">暂无超差项。</p>
          ) : (
            <ul className="anomaly-list">
              {summary.overCentOpen.map((item) => (
                <li key={`${item.batchName}-${item.pipe.key}`}>
                  <span className="tag tag-bad">{centText(item.cents)} cent</span>
                  <span>
                    {item.pipe.venue} · {item.pipe.stop} · {item.pipe.pipeNo}（{item.pipe.pitch}）
                  </span>
                  <small>{item.batchName}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>环境越限待复测</h3>
          {summary.retestOpen.length === 0 ? (
            <p className="muted">暂无待复测项。</p>
          ) : (
            <ul className="anomaly-list">
              {summary.retestOpen.map((item) => (
                <li key={`${item.batchName}-${item.pipe.key}`}>
                  <span className="tag tag-retest">待复测</span>
                  <span>
                    {item.pipe.venue} · {item.pipe.stop} · {item.pipe.pipeNo}（{item.pipe.pitch}）
                  </span>
                  <small>{item.reasons.join("、")}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
