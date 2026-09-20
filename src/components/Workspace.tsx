import { useEffect, useMemo, useState } from "react";
import type { MaintenanceBatch, StopTarget } from "../types";
import {
  createBatch,
  runGate,
  saveMeasurement,
  setActiveBatch,
  useStore,
} from "../business/storage";
import {
  STATUS_LABEL,
  assessBatch,
  describeTargets,
  evaluateEnvironment,
  expectedPipes,
  isCentOverLimit,
  latestMeasurement,
} from "../business/rules";
import { centText, formatDateTime, statusClass } from "./util";

interface FormState {
  pipeKey: string;
  cents: string;
  temperature: string;
  humidity: string;
  reed: "normal" | "abnormal";
  note: string;
}

const DEFAULT_FORM: Omit<FormState, "pipeKey"> = {
  cents: "0",
  temperature: "20",
  humidity: "55",
  reed: "normal",
  note: "",
};

export function Workspace() {
  const state = useStore((s) => s);
  const batch = state.batches.find((b) => b.id === state.activeBatchId) ?? state.batches[0];

  const stopGroups = useMemo(() => {
    const map = new Map<string, StopTarget>();
    for (const p of state.pipes) {
      const k = `${p.venue}/${p.stop}`;
      if (!map.has(k)) map.set(k, { venue: p.venue, stop: p.stop });
    }
    return Array.from(map.values());
  }, [state.pipes]);

  const [newName, setNewName] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(stopGroups.map((g) => `${g.venue}/${g.stop}`)));
  const [form, setForm] = useState<FormState>({ pipeKey: "", ...DEFAULT_FORM });
  const [flash, setFlash] = useState<string>("");

  const expected = useMemo(
    () => (batch ? expectedPipes(state.pipes, batch) : []),
    [state.pipes, batch]
  );

  // 切换批次后选中第一根音管，并预填它最近一条测量
  useEffect(() => {
    if (!batch) return;
    const pipes = expectedPipes(state.pipes, batch);
    if (pipes.length === 0) return;
    const first = pipes[0].key;
    prefill(first);
    setFlash("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.id]);

  function prefill(pipeKey: string) {
    if (!batch) return;
    const last = latestMeasurement(batch, pipeKey);
    setForm({
      pipeKey,
      cents: last ? String(last.cents) : "0",
      temperature: last ? String(last.temperature) : "20",
      humidity: last ? String(last.humidity) : "55",
      reed: last ? last.reed : "normal",
      note: last ? last.note : "",
    });
  }

  const targetKey = (t: StopTarget) => `${t.venue}/${t.stop}`;

  function toggleChosen(k: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function handleCreate() {
    const targets = stopGroups.filter((g) => chosen.has(targetKey(g)));
    const id = createBatch(newName, targets);
    if (id) {
      setNewName("");
      setFlash("已创建维护批次");
    } else {
      setFlash("请填写批次名称并至少选择一个音栓");
    }
  }

  const selectedPipe = state.pipes.find((p) => p.key === form.pipeKey);
  const temp = parseFloat(form.temperature);
  const hum = parseFloat(form.humidity);
  const env = Number.isFinite(temp) && Number.isFinite(hum) ? evaluateEnvironment(temp, hum) : null;
  const centsNum = parseFloat(form.cents);
  const centBlocked = Number.isFinite(centsNum) && isCentOverLimit(centsNum);

  function handleSave() {
    if (!batch || !selectedPipe) return;
    if (!Number.isFinite(centsNum) || !Number.isFinite(temp) || !Number.isFinite(hum)) {
      setFlash("请填写有效的音分偏差、温度和湿度");
      return;
    }
    const ok = saveMeasurement(batch.id, {
      pipeKey: selectedPipe.key,
      cents: centsNum,
      temperature: temp,
      humidity: hum,
      reed: selectedPipe.reedStop ? form.reed : "normal",
      note: form.note,
    });
    if (ok) setFlash(env && !env.ok ? "环境越限：本次测量已记为待复测，不得放行" : "测量已保存，等待批次校验");
  }

  function handleGate() {
    if (!batch) return;
    const r = runGate(batch.id);
    if (r.releasable) {
      setFlash("校验通过，批次已放行；复调音管的旧结果已只读归档");
    } else if (r.hard > 0) {
      setFlash(`校验未通过：${r.hard} 项硬阻断，整批保持待复核，旧结果与快照不变`);
    } else {
      setFlash(`仍有 ${r.retest} 根音管待复测，暂不能放行`);
    }
  }

  if (!batch) {
    return (
      <section className="panel">
        <h2>暂无维护批次</h2>
        <p>请在左侧创建一个维护批次。</p>
      </section>
    );
  }

  const gate = assessBatch(state.pipes, batch);

  return (
    <section className="workspace workspace-wide">
      <aside className="panel batch-aside">
        <h2>维护批次</h2>
        <div className="batch-list">
          {state.batches.map((b: MaintenanceBatch) => {
            const total = expectedPipes(state.pipes, b).length;
            const done = b.measurements.length;
            return (
              <button
                key={b.id}
                className={`batch-item ${b.id === batch.id ? "active" : ""}`}
                onClick={() => setActiveBatch(b.id)}
              >
                <span className="batch-item-top">
                  <b>{b.name}</b>
                  <span className={statusClass(b.status)}>{STATUS_LABEL[b.status]}</span>
                </span>
                <small>{describeTargets(b)}</small>
                <small>{b.status === "released" ? `放行于 ${formatDateTime(b.releasedAt ?? "")}` : `测量 ${done}/${total}`}</small>
              </button>
            );
          })}
        </div>

        <div className="new-batch">
          <h3>新建维护批次</h3>
          <label>
            <span>批次名称</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：2026 圣诞前调音" />
          </label>
          <div className="target-pickers">
            {stopGroups.map((g) => (
              <label key={targetKey(g)} className="check-row">
                <input
                  type="checkbox"
                  checked={chosen.has(targetKey(g))}
                  onChange={() => toggleChosen(targetKey(g))}
                />
                <span>
                  {g.venue} · {g.stop}
                </span>
              </label>
            ))}
          </div>
          <button className="primary" onClick={handleCreate}>
            创建批次
          </button>
        </div>
      </aside>

      <section className="panel batch-main">
        <div className="heading">
          <div>
            <p>调音工作台</p>
            <h2>
              {batch.name} <span className={statusClass(batch.status)}>{STATUS_LABEL[batch.status]}</span>
            </h2>
          </div>
          <div className="heading-meta">
            <span>{describeTargets(batch)}</span>
            <span>建立于 {formatDateTime(batch.createdAt)}</span>
          </div>
        </div>

        {flash && <div className="flash">{flash}</div>}

        {batch.status === "released" ? (
          <ReleasedView batch={batch} />
        ) : (
          <>
            <GatePanel batch={batch} hardCount={gate.hard.length} retestCount={gate.retest.length} onGate={handleGate} />

            <div className="entry-grid">
              <div className="entry-form">
                <h3>录入 / 复测音管</h3>
                <label>
                  <span>音管（同管复测直接覆盖本批次旧测量）</span>
                  <select value={form.pipeKey} onChange={(e) => prefill(e.target.value)}>
                    {expected.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.venue} · {p.stop} · {p.pipeNo}（{p.pitch}）
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-grid">
                  <label>
                    <span>音分偏差（红线 ±8）</span>
                    <input
                      type="number"
                      step="0.1"
                      value={form.cents}
                      onChange={(e) => setForm({ ...form, cents: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>温度 ℃（10–30）</span>
                    <input
                      type="number"
                      step="0.1"
                      value={form.temperature}
                      onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>湿度 %（≤70）</span>
                    <input
                      type="number"
                      step="1"
                      value={form.humidity}
                      onChange={(e) => setForm({ ...form, humidity: e.target.value })}
                    />
                  </label>
                  <label>
                    <span>簧片状态{selectedPipe && !selectedPipe.reedStop ? "（非簧片音栓，无需填写）" : ""}</span>
                    <select
                      value={form.reed}
                      disabled={!!selectedPipe && !selectedPipe.reedStop}
                      onChange={(e) => setForm({ ...form, reed: e.target.value as FormState["reed"] })}
                    >
                      <option value="normal">正常</option>
                      <option value="abnormal">异常</option>
                    </select>
                  </label>
                </div>
                <label>
                  <span>维修备注</span>
                  <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="如：簧片微调、待更换" />
                </label>

                <ul className="live-checks">
                  <li className={env?.ok ? "ok" : env ? "bad" : ""}>
                    环境判定：
                    {env
                      ? env.ok
                        ? "符合测量条件"
                        : env.reasons.join("、") + " → 只记待复测"
                      : "—"}
                  </li>
                  <li className={centBlocked ? "bad" : "ok"}>
                    音分判定：{Number.isFinite(centsNum) ? (centBlocked ? `${centText(centsNum)} cent，超差将整批待复核` : `${centText(centsNum)} cent，未超差`) : "—"}
                  </li>
                </ul>

                <button className="primary" onClick={handleSave}>
                  保存本次测量
                </button>
              </div>

              <div className="matrix-wrap">
                <h3>音栓覆盖矩阵（每根音管只保留最后一条测量）</h3>
                <table className="matrix">
                  <thead>
                    <tr>
                      <th>音管 / 音高</th>
                      <th>偏差</th>
                      <th>温 / 湿</th>
                      <th>簧片</th>
                      <th>状态</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expected.map((p) => {
                      const m = latestMeasurement(batch, p.key);
                      return (
                        <tr key={p.key} className={m ? "" : "row-missing"}>
                          <td>
                            <b>{p.pipeNo}</b>
                            <small>{p.pitch}</small>
                          </td>
                          <td className={m && m.state === "valid" && isCentOverLimit(m.cents) ? "cell-bad" : ""}>
                            {m ? `${centText(m.cents)} cent` : "—"}
                          </td>
                          <td>{m ? `${m.temperature}℃ / ${m.humidity}%` : "—"}</td>
                          <td>{p.reedStop ? (m ? (m.reed === "abnormal" ? <span className="tag tag-bad">异常</span> : "正常") : "—") : "—"}</td>
                          <td>
                            {!m ? (
                              <span className="tag tag-missing">缺测</span>
                            ) : m.state === "retest" ? (
                              <span className="tag tag-retest" title={m.envReasons.join("、")}>
                                待复测
                              </span>
                            ) : isCentOverLimit(m.cents) ? (
                              <span className="tag tag-bad">超差</span>
                            ) : p.reedStop && m.reed === "abnormal" ? (
                              <span className="tag tag-bad">簧片异常</span>
                            ) : (
                              <span className="tag tag-ok">合格</span>
                            )}
                          </td>
                          <td>
                            <button className="link-btn" onClick={() => prefill(p.key)}>
                              填入
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </section>
  );
}

function GatePanel({
  batch,
  hardCount,
  retestCount,
  onGate,
}: {
  batch: MaintenanceBatch;
  hardCount: number;
  retestCount: number;
  onGate: () => void;
}) {
  const gate = batch.lastGate;
  return (
    <div className={`gate ${batch.status === "review" ? "gate-review" : ""}`}>
      <div className="gate-head">
        <div>
          <h3>维护放行闸门</h3>
          <p>
            规则：温度 10–30℃ 且湿度 ≤70% 才可放行；|音分偏差| ≤ 8；簧片状态正常；音栓不得缺测。
            硬阻断时整批待复核，旧结果与批次快照不变；复调成功后上一条结果只读归档。
          </p>
        </div>
        <button className="primary" onClick={onGate}>
          校验并放行
        </button>
      </div>
      <div className="gate-summary">
        <span className={hardCount > 0 ? "tag tag-bad" : "tag tag-ok"}>硬阻断 {hardCount}</span>
        <span className={retestCount > 0 ? "tag tag-retest" : "tag tag-ok"}>待复测 {retestCount}</span>
      </div>
      {gate && (
        <div className="gate-log">
          <p className="gate-log-title">上次校验 · {formatDateTime(gate.at)}</p>
          {gate.hard.length === 0 && gate.retest.length === 0 && <p className="ok">校验通过并已放行。</p>}
          {gate.hard.map((i, idx) => (
            <p key={`h-${idx}`} className="bad">
              ✕ {i.message}
            </p>
          ))}
          {gate.retest.map((i, idx) => (
            <p key={`r-${idx}`} className="warn">
              ⏳ {i.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ReleasedView({ batch }: { batch: MaintenanceBatch }) {
  const snapshot = batch.snapshots[batch.snapshots.length - 1];
  return (
    <div className="released-view">
      <div className="gate gate-ok">
        <h3>批次已放行 · {formatDateTime(batch.releasedAt ?? "")}</h3>
        <p>
          本次快照已固化：{snapshot?.measuredCount ?? 0} 根音管形成有效结果，
          接管并只读归档上一条结果 {snapshot?.archivedCount ?? 0} 条。批次测量与结果不再接受修改。
        </p>
      </div>
      <table className="matrix">
        <thead>
          <tr>
            <th>音管</th>
            <th>放行偏差</th>
            <th>簧片</th>
            <th>接管的只读记录</th>
          </tr>
        </thead>
        <tbody>
          {snapshot?.rows.map((row) => (
            <tr key={row.pipeKey}>
              <td>{row.pipeKey}</td>
              <td>{centText(row.cents)} cent</td>
              <td>{row.reed === "abnormal" ? "异常" : "正常"}</td>
              <td>{row.supersededId ? `已归档 ${row.supersededId.slice(0, 12)}…` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
