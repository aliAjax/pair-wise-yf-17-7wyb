import { useMemo, useState } from "react";
import { currentResult, useStore } from "../business/storage";
import { centText, formatDateTime } from "./util";

/**
 * 音管结果台账：报告视图的一部分。
 * 每根音管至多一条有效结果；被复调接管的旧记录以只读链展示，永不删除。
 */
export function ResultLedger() {
  const state = useStore((s) => s);
  const venues = useMemo(() => Array.from(new Set(state.pipes.map((p) => p.venue))), [state.pipes]);
  const [venue, setVenue] = useState<string>("全部");

  const pipes = state.pipes.filter((p) => venue === "全部" || p.venue === venue);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>音管有效结果</p>
          <h2>结果台账（每管一条有效结果）</h2>
        </div>
        <div className="chips">
          <button className={venue === "全部" ? "chip-on" : ""} onClick={() => setVenue("全部")}>
            全部
          </button>
          {venues.map((v) => (
            <button key={v} className={venue === v ? "chip-on" : ""} onClick={() => setVenue(v)}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="ledger">
        {pipes.map((pipe) => {
          const current = currentResult(state.results, pipe.key);
          const history = state.results
            .filter((r) => r.pipeKey === pipe.key && r.readOnly)
            .sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1));

          return (
            <article key={pipe.key} className="ledger-card">
              <header>
                <div>
                  <h3>
                    {pipe.pipeNo} <small>{pipe.pitch}</small>
                  </h3>
                  <p>
                    {pipe.venue} · {pipe.stop}
                    {pipe.reedStop && <span className="tag tag-reed">簧片音栓</span>}
                  </p>
                </div>
                {current ? <span className="tag tag-ok">有效</span> : <span className="tag tag-missing">尚无有效结果</span>}
              </header>

              {current ? (
                <div className="result-current">
                  <div className="result-cent">
                    <strong className={Math.abs(current.cents) > 8 ? "cell-bad" : ""}>{centText(current.cents)}</strong>
                    <small>cent</small>
                  </div>
                  <dl>
                    <div>
                      <dt>测量环境</dt>
                      <dd>
                        {current.temperature}℃ / {current.humidity}%
                      </dd>
                    </div>
                    <div>
                      <dt>簧片</dt>
                      <dd>{pipe.reedStop ? (current.reed === "abnormal" ? "异常" : "正常") : "—"}</dd>
                    </div>
                    <div>
                      <dt>来源批次</dt>
                      <dd>{current.batchName}</dd>
                    </div>
                    <div>
                      <dt>放行时间</dt>
                      <dd>{formatDateTime(current.releasedAt)}</dd>
                    </div>
                    {current.note && (
                      <div className="full">
                        <dt>备注</dt>
                        <dd>{current.note}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ) : (
                <p className="muted">该音管尚无放行结果，需在维护批次中完成合格测量并放行。</p>
              )}

              {history.length > 0 && (
                <div className="history-chain">
                  <p className="history-title">只读历史（复调接管，不可修改）</p>
                  {history.map((h) => (
                    <div key={h.id} className="history-item" title={h.id}>
                      <span className="tag tag-readonly">只读</span>
                      <span>{centText(h.cents)} cent</span>
                      <span>{h.batchName}</span>
                      <span>{formatDateTime(h.releasedAt)}</span>
                      {h.supersededAt && <small>于 {formatDateTime(h.supersededAt)} 被接管</small>}
                      {h.note && <small>备注：{h.note}</small>}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
