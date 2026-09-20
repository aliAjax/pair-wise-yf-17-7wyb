import { useMemo, useState } from "react";
import "./styles.css";
import { clearAll, resetToSeed } from "./business/storage";
import { useTuningState } from "./ui/useTuningState";
import { Sidebar } from "./ui/Sidebar";
import { Workbench } from "./ui/Workbench";
import { ReportView } from "./ui/ReportView";
import { ExceptionStatsView } from "./ui/ExceptionStatsView";
import { ResultsLedger } from "./ui/ResultsLedger";

type Tab = "workbench" | "report" | "stats" | "ledger";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "workbench", label: "调音工作台" },
  { key: "report", label: "维护报告" },
  { key: "stats", label: "异常统计" },
  { key: "ledger", label: "有效结果台账" },
];

function App() {
  const state = useTuningState();
  const [tab, setTab] = useState<Tab>("workbench");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 选中批次被删除/重置后自动回退到列表第一条
  const selected = useMemo(
    () => state.batches.find((b) => b.id === selectedId) ?? state.batches[0] ?? null,
    [state.batches, selectedId],
  );
  const effectiveId = selected?.id ?? null;

  function selectBatch(id: string) {
    setSelectedId(id);
    setTab("workbench");
  }

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62005 · 管风琴音管调音记录 · 维护放行闭环</p>
        <h1>音管调音 · 维护放行</h1>
        <span>
          温度 10℃~30℃、湿度≤70% 方可放行；|音分偏差|&gt;8、簧片异常或音栓缺测整批待复核。
          复调成功后上一条结果保留为只读并由新结果接管；报告、异常统计与浏览器持久化实时同步。
        </span>
        <div className="hero-actions">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "tab active" : "tab"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {(tab === "workbench" || tab === "report") && (
        <section className="workspace">
          <Sidebar
            batches={state.batches}
            selectedId={effectiveId}
            onSelect={selectBatch}
            onCreated={(id) => selectBatch(id)}
          />
          {selected ? (
            tab === "report" ? (
              <ReportView batch={selected} />
            ) : (
              <Workbench batch={selected} onReport={() => setTab("report")} />
            )
          ) : (
            <section className="panel empty-panel">
              <h2>尚未选择批次</h2>
              <p className="muted">从左侧新建维护批次后开始录入调音测量。</p>
            </section>
          )}
        </section>
      )}

      {tab === "stats" && <ExceptionStatsView state={state} />}
      {tab === "ledger" && <ResultsLedger state={state} />}

      <footer className="footer">
        <span>规则校验 src/domain · 存储 src/business/storage · 报告 src/business/report · 视图 src/ui</span>
        <span className="footer-actions">
          <button onClick={() => resetToSeed()}>恢复演示数据</button>
          <button onClick={() => clearAll()}>清空本地数据</button>
        </span>
      </footer>
    </main>
  );
}

export default App;
