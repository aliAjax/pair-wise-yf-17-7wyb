import { buildExceptionStats, REASON_TEXT } from "../business/report";
import type { TuningState } from "../domain/types";

export function ExceptionStatsView({ state }: { state: TuningState }) {
  const stats = buildExceptionStats(state);
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>异常统计</p>
          <h2>待办异常总览（与持久化同步）</h2>
        </div>
      </div>

      <div className="report-metrics">
        <article><small>批次总数</small><strong>{stats.batchTotal}</strong></article>
        <article><small>已放行</small><strong className="text-ok">{stats.releasedBatchCount}</strong></article>
        <article><small>待复核批次</small><strong className={stats.pendingReviewCount ? "text-fault" : ""}>{stats.pendingReviewCount}</strong></article>
        <article><small>待复测批次</small><strong className={stats.pendingRetestCount ? "text-retest" : ""}>{stats.pendingRetestCount}</strong></article>
        <article><small>进行中</small><strong>{stats.openCount}</strong></article>
        <article><small>有效结果音管</small><strong>{stats.currentPipeCount}</strong></article>
        <article><small>只读历史</small><strong>{stats.archivedCount}</strong></article>
        <article><small>异常涉及音管</small><strong className={stats.exceptionPipeCount ? "text-fault" : "text-ok"}>{stats.exceptionPipeCount}</strong></article>
      </div>

      <div className="stats-columns">
        <StatBlock title={`偏差超过 8 音分（${stats.centsFaultPipes.length}）`} items={stats.centsFaultPipes} tone="fault" />
        <StatBlock title={`簧片状态异常（${stats.reedFaultPipes.length}）`} items={stats.reedFaultPipes} tone="fault" />
        <StatBlock title={`环境待复测（${stats.envRetestPipes.length}）`} items={stats.envRetestPipes} tone="retest" />
        <div className="stat-block">
          <h3>音栓缺测（{stats.missingBatches.length} 批次）</h3>
          {stats.missingBatches.length === 0 && <p className="muted">无</p>}
          {stats.missingBatches.map((b) => (
            <p key={b.batchId}>
              <b>{b.label}</b>：<span className="text-fault">{b.pipes.join("、")}</span>
              <span className="muted">（{REASON_TEXT.missing_measurement}）</span>
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatBlock({ title, items, tone }: { title: string; items: string[]; tone: "fault" | "retest" }) {
  return (
    <div className="stat-block">
      <h3>{title}</h3>
      {items.length === 0 && <p className="muted">无</p>}
      {items.map((label) => (
        <p key={label} className={tone === "fault" ? "text-fault" : "text-retest"}>{label}</p>
      ))}
    </div>
  );
}
