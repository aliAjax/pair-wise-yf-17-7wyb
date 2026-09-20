import { useStore } from "../business/storage";
import { summarizeAnomalies } from "../business/report";
import { RULES } from "../business/rules";

/** 顶部指标：数量全部来自存储与报告模块的实时派生 */
export function MetricBar() {
  const state = useStore((s) => s);
  const summary = summarizeAnomalies(state);

  const items = [
    { label: "音栓数量", value: new Set(state.pipes.map((p) => `${p.venue}/${p.stop}`)).size },
    { label: "有效音管结果", value: summary.currentResults },
    { label: "待复核批次", value: summary.pendingReviewBatches, warn: summary.pendingReviewBatches > 0 },
    { label: "待复测音管", value: summary.pendingRetestPipes, warn: summary.pendingRetestPipes > 0 },
    {
      label: "环境红线",
      value: `${RULES.temperatureMin}–${RULES.temperatureMax}℃ / ≤${RULES.humidityMax}%`,
      text: true,
    },
  ];

  return (
    <section className="metrics metrics-5">
      {items.map((item) => (
        <article key={item.label} className={item.warn ? "metric-warn" : ""}>
          <small>{item.label}</small>
          {item.text ? <strong className="metric-text">{item.value}</strong> : <strong>{item.value}</strong>}
        </article>
      ))}
    </section>
  );
}
