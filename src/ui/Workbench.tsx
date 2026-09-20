import { useMemo, useState } from "react";
import {
  attemptsOf,
  latestAttempts,
  recordMeasurement,
  requestRelease,
} from "../business/storage";
import type {
  MaintenanceBatch,
  Measurement,
  ReasonCode,
  ReedStatus,
} from "../domain/types";
import {
  CENT_LIMIT,
  HUMIDITY_MAX,
  TEMP_MAX,
  TEMP_MIN,
  evaluateBatch,
} from "../domain/rules";
import { BATCH_STATUS_TEXT, REASON_TEXT } from "../business/report";
import { AttemptKindTag, BatchStatusBadge, ReasonTags } from "./StatusBadge";
import { formatCents, formatDateTime, formatHumidity, formatTemp } from "./format";

interface WorkbenchProps {
  batch: MaintenanceBatch;
  onReport: () => void;
}

interface Flash {
  type: "ok" | "hold";
  text: string;
}

export function Workbench({ batch, onReport }: WorkbenchProps) {
  const [pipeNo, setPipeNo] = useState(batch.slots[0]?.pipeNo ?? "");
  const [pitch, setPitch] = useState(batch.slots[0]?.pitch ?? "");
  const [cents, setCents] = useState("0");
  const [temperature, setTemperature] = useState("20");
  const [humidity, setHumidity] = useState("55");
  const [reed, setReed] = useState<ReedStatus>("normal");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<Flash | null>(null);
  const [historyPipe, setHistoryPipe] = useState<string | null>(null);

  const evaluation = useMemo(() => evaluateBatch(batch), [batch]);
  const attempts = useMemo(() => latestAttempts(batch), [batch]);
  const frozen = batch.status === "released";

  function choosePipe(value: string) {
    setPipeNo(value);
    const slot = batch.slots.find((s) => s.pipeNo === value);
    if (slot) setPitch(slot.pitch);
  }

  function submitMeasurement() {
    setError("");
    setFlash(null);
    try {
      const { measurement } = recordMeasurement(batch.id, {
        pipeNo,
        pitch: pitch || pipeNo,
        cents: Number(cents),
        temperature: Number(temperature),
        humidity: Number(humidity),
        reed,
        note: note.trim() || undefined,
      });
      setNote("");
      if (!measurement.envValid) {
        setFlash({
          type: "hold",
          text: `温湿度超出放行环境（${measurement.envReasons
            .map((r) => REASON_TEXT[r])
            .join("、")}），本次只记为待复测，未接管当前结果。`,
        });
      } else {
        setFlash({
          type: "ok",
          text: `已保存 ${pipeNo} 的测量结果；同管旧记录保留为只读，新记录接管当前。`,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  }

  function release() {
    setError("");
    try {
      const result = requestRelease(batch.id);
      if (result.released) {
        setFlash({
          type: "ok",
          text:
            `批次 ${batch.code} 已维护放行，快照已冻结（${formatDateTime(
              result.decision.decidedAt,
            )}）。` +
            (result.takenOver.length > 0
              ? `复调成功，接管音管：${result.takenOver.join(
                  "、",
                )}；上一条结果已保留为只读。`
              : ""),
        });
      } else {
        setFlash({
          type: "hold",
          text:
            result.decision.decision === "pending_review"
              ? "存在偏差超限、簧片异常或缺测，整批保持待复核；旧结果与批次快照不变。"
              : "温湿度超出放行环境，整批保持待复测；旧结果与批次快照不变。",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "放行失败");
    }
  }

  return (
    <section className="panel workbench">
      <div className="heading">
        <div>
          <p>{batch.code}</p>
          <h2>
            {batch.venue} · {batch.stop}
          </h2>
          <span className="muted">
            计划 {batch.slots.length} 管 · 创建于 {formatDateTime(batch.createdAt)}
          </span>
        </div>
        <div className="heading-actions">
          <BatchStatusBadge status={batch.status} />
          <button onClick={onReport}>查看报告</button>
          {!frozen && (
            <button className="primary" onClick={release}>
              申请维护放行
            </button>
          )}
        </div>
      </div>

      <DecisionBanner batch={batch} />

      {flash && (
        <p className={flash.type === "ok" ? "flash flash-ok" : "flash flash-hold"}>
          {flash.text}
        </p>
      )}
      {error && <p className="error-text">{error}</p>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>音管编号</th>
              <th>音高</th>
              <th>音分偏差</th>
              <th>温度</th>
              <th>湿度</th>
              <th>簧片</th>
              <th>状态</th>
              <th>未放行原因</th>
              <th>记录</th>
            </tr>
          </thead>
          <tbody>
            {batch.slots.map((slot) => {
              const m = attempts.get(slot.pipeNo) ?? null;
              const shown = frozen
                ? batch.snapshot?.find((x) => x.pipeNo === slot.pipeNo) ?? null
                : m;
              const rowReasons: ReasonCode[] = [];
              if (!m) rowReasons.push("missing_measurement");
              if (m) {
                if (!m.envValid) rowReasons.push(...m.envReasons);
                rowReasons.push(...m.faultReasons);
              }
              return (
                <tr
                  key={slot.pipeNo}
                  className={
                    m && !m.envValid
                      ? "row-retest"
                      : m && m.faultReasons.length > 0
                        ? "row-fault"
                        : !m
                          ? "row-missing"
                          : ""
                  }
                >
                  <td><b>{slot.pipeNo}</b></td>
                  <td>{slot.pitch}</td>
                  <td>
                    {shown ? (
                      <CentsCell cents={shown.cents} />
                    ) : (
                      <span className="muted">缺测</span>
                    )}
                  </td>
                  <td>{shown ? formatTemp(shown.temperature) : "—"}</td>
                  <td>{shown ? formatHumidity(shown.humidity) : "—"}</td>
                  <td>{shown ? (shown.reed === "normal" ? "正常" : "异常") : "—"}</td>
                  <td>
                    {shown ? (
                      <AttemptKindTag kind={frozen ? "current" : shown.kind} />
                    ) : (
                      <span className="tag tag-retest">缺测</span>
                    )}
                  </td>
                  <td><ReasonTags reasons={rowReasons} /></td>
                  <td>
                    <button
                      className="link-btn"
                      onClick={() =>
                        setHistoryPipe(historyPipe === slot.pipeNo ? null : slot.pipeNo)
                      }
                    >
                      {historyPipe === slot.pipeNo
                        ? "收起历史"
                        : `历史 ${attemptsOf(batch, slot.pipeNo).length}`}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {historyPipe && <HistoryList batch={batch} pipeNo={historyPipe} />}

      {frozen ? (
        <p className="frozen-note">
          批次已于 {formatDateTime(batch.releasedAt)} 放行，快照冻结只读；如需调整请对该音栓新建复调批次。
        </p>
      ) : (
        <div className="measure-form">
          <div className="measure-form-head">
            <h3>录入测量 / 发起复调</h3>
            <span className="muted">
              环境闸门：{TEMP_MIN}℃~{TEMP_MAX}℃、湿度≤{HUMIDITY_MAX}%；|偏差|&gt;
              {CENT_LIMIT}音分或簧片异常将整批待复核
            </span>
          </div>
          <div className="field-grid">
            <label>
              <span>音管编号</span>
              <select value={pipeNo} onChange={(e) => choosePipe(e.target.value)}>
                {batch.slots.map((s) => (
                  <option key={s.pipeNo} value={s.pipeNo}>
                    {s.pipeNo}（{s.pitch}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>音高</span>
              <input value={pitch} onChange={(e) => setPitch(e.target.value)} />
            </label>
            <label>
              <span>音分偏差</span>
              <input
                type="number"
                step="0.5"
                value={cents}
                onChange={(e) => setCents(e.target.value)}
              />
            </label>
            <label>
              <span>温度（℃）</span>
              <input
                type="number"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </label>
            <label>
              <span>湿度（%）</span>
              <input
                type="number"
                step="1"
                value={humidity}
                onChange={(e) => setHumidity(e.target.value)}
              />
            </label>
            <label>
              <span>簧片状态</span>
              <select value={reed} onChange={(e) => setReed(e.target.value as ReedStatus)}>
                <option value="normal">正常</option>
                <option value="abnormal">异常</option>
              </select>
            </label>
            <label className="wide">
              <span>维修备注</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如 簧片需微调"
              />
            </label>
          </div>
          <div className="form-actions">
            <span className="muted">
              实时预判：
              <strong
                className={
                  evaluation.status === "released"
                    ? "text-ok"
                    : evaluation.status === "pending_review"
                      ? "text-fault"
                      : "text-retest"
                }
              >
                {BATCH_STATUS_TEXT[
                  evaluation.status === "released" && batch.status === "open"
                    ? "open"
                    : evaluation.status
                ]}
                {evaluation.status === "released" ? "（满足放行）" : ""}
              </strong>
            </span>
            <button className="primary" onClick={submitMeasurement}>
              保存测量结果
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CentsCell({ cents: c }: { cents: number }) {
  const over = Math.abs(c) > CENT_LIMIT;
  return (
    <span className={over ? "text-fault" : "text-ok"}>{formatCents(c)}</span>
  );
}

function DecisionBanner({ batch }: { batch: MaintenanceBatch }) {
  const decision = batch.lastDecision;
  if (batch.status === "released") {
    return (
      <div className="banner banner-ok">
        <b>已维护放行</b>
        <span>
          放行时间 {formatDateTime(batch.releasedAt)}，快照 {batch.snapshot?.length ?? 0}{" "}
          管，已接管为该音栓各音管的唯一有效结果。
        </span>
      </div>
    );
  }
  if (!decision) {
    return (
      <div className="banner banner-muted">
        <b>进行中</b>
        <span>
          录入全部音管后可申请维护放行；环境超限只记待复测，偏差/簧片/缺测问题将使整批待复核。
        </span>
      </div>
    );
  }
  const cls =
    decision.decision === "pending_review"
      ? "banner banner-fault"
      : "banner banner-retest";
  const title = decision.decision === "pending_review" ? "整批待复核" : "整批待复测";
  return (
    <div className={cls}>
      <b>{title}</b>
      <span>
        裁决时间 {formatDateTime(decision.decidedAt)}：
        {decision.missing.length > 0 && ` 缺测音管 ${decision.missing.join("、")}；`}
        {decision.faultPipes.length > 0 &&
          ` 异常音管 ${decision.faultPipes.join("、")}；`}
        {decision.retestPipes.length > 0 &&
          ` 待复测音管 ${decision.retestPipes.join("、")}；`}
        旧结果与批次快照保持不变。
      </span>
    </div>
  );
}

function HistoryList({ batch, pipeNo }: { batch: MaintenanceBatch; pipeNo: string }) {
  const list = attemptsOf(batch, pipeNo);
  return (
    <div className="history-box">
      <h4>{pipeNo} 的测量尝试（含只读记录）</h4>
      {list.map((m: Measurement) => (
        <div key={m.id} className={"history-row kind-" + m.kind}>
          <AttemptKindTag kind={m.kind} />
          <span>{formatDateTime(m.recordedAt)}</span>
          <span className={Math.abs(m.cents) > CENT_LIMIT ? "text-fault" : ""}>
            {formatCents(m.cents)}
          </span>
          <span>
            {formatTemp(m.temperature)} / {formatHumidity(m.humidity)}
          </span>
          <span>簧片{m.reed === "normal" ? "正常" : "异常"}</span>
          <span className="muted">{m.note || "无备注"}</span>
          {m.supersededById && <span className="muted">已被复调接管</span>}
        </div>
      ))}
    </div>
  );
}
