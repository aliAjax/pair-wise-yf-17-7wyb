import { useState } from "react";
import "./styles.css";
import { resetToSeed, useStore } from "./business/storage";
import { MetricBar } from "./components/MetricBar";
import { Workspace } from "./components/Workspace";
import { ResultLedger } from "./components/ResultLedger";
import { ReportView } from "./components/ReportView";
import { AnomalyStats } from "./components/AnomalyStats";
import { STATUS_LABEL } from "./business/rules";
import { statusClass } from "./components/util";

type Tab = "workspace" | "ledger" | "report" | "stats";

const TABS: { id: Tab; label: string }[] = [
  { id: "workspace", label: "调音工作台" },
  { id: "ledger", label: "音管结果" },
  { id: "report", label: "维护报告" },
  { id: "stats", label: "异常统计" },
];

function App() {
  const [tab, setTab] = useState<Tab>("workspace");
  const state = useStore((s) => s);
  const active = state.batches.find((b) => b.id === state.activeBatchId);

  return (
    <main className="app">
      <section className="hero hero-compact">
        <p>hxyfront-62005 · 管风琴维护 · Port 62005</p>
        <h1>管风琴音管调音记录</h1>
        <span>
          维护放行闭环：温湿度越限只记待复测；音分超 8、簧片异常或同栓缺测整批待复核；
          复调放行后旧结果只读归档，每根音管只保留一条有效结果。
        </span>
      </section>

      <MetricBar />

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab-on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        {active && (
          <span className="tab-context">
            当前批次：{active.name} <span className={statusClass(active.status)}>{STATUS_LABEL[active.status]}</span>
          </span>
        )}
      </nav>

      {tab === "workspace" && <Workspace />}
      {tab === "ledger" && <ResultLedger />}
      {tab === "report" && <ReportView />}
      {tab === "stats" && <AnomalyStats />}

      <footer className="persist-bar">
        <span className="dot" />
        数据已通过浏览器 localStorage 持久化（多标签页自动同步）；
        {state.results.filter((r) => !r.readOnly).length} 条有效结果，
        {state.results.filter((r) => r.readOnly).length} 条只读历史。
        <button
          onClick={() => {
            if (window.confirm("清空本地数据并恢复演示批次？该操作不可撤销。")) resetToSeed();
          }}
        >
          恢复演示数据
        </button>
      </footer>
    </main>
  );
}

export default App;
