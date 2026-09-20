import { useSyncExternalStore } from "react";
import type {
  AppState,
  BatchSnapshot,
  GateRecord,
  MaintenanceBatch,
  Measurement,
  Pipe,
  ResultRecord,
  SnapshotRow,
  StopTarget,
} from "../types";
import {
  assessBatch,
  classifyMeasurement,
  expectedPipes,
  latestMeasurement,
} from "./rules";
import { buildSeedState, nextId } from "./seed";

/**
 * 存储模块：只管状态读写、浏览器持久化与放行事务，不关心 UI 展示。
 * 规则判定全部来自 rules 模块；任何硬阻断都不会改动旧结果和批次快照。
 */

const STORAGE_KEY = "hxyfront-62005-state-v1";

type Listener = () => void;

function nowIso(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* 放行事务：成功时接管结果并写快照；失败只留痕，不改旧数据             */
/* ------------------------------------------------------------------ */

function commitRelease(
  state: AppState,
  batch: MaintenanceBatch,
  at: string,
  gate: GateRecord
): AppState {
  const expected = expectedPipes(state.pipes, batch);
  const rows: SnapshotRow[] = [];
  const archived: ResultRecord[] = [];
  const newResults: ResultRecord[] = [];

  for (const pipe of expected) {
    const m = latestMeasurement(batch, pipe.key);
    if (!m || m.state !== "valid") continue;

    // 每根音管只保留一条有效结果：旧的当前结果转只读
    let supersededId: string | undefined;
    for (const r of state.results) {
      if (r.pipeKey === pipe.key && !r.readOnly) {
        supersededId = r.id;
        archived.push({
          ...r,
          readOnly: true,
          supersededBy: batch.id,
          supersededAt: at,
        });
      }
    }

    rows.push({
      pipeKey: pipe.key,
      cents: m.cents,
      reed: m.reed,
      supersededId,
    });

    newResults.push({
      id: nextId("r"),
      pipeKey: pipe.key,
      cents: m.cents,
      temperature: m.temperature,
      humidity: m.humidity,
      reed: m.reed,
      note: m.note,
      batchId: batch.id,
      batchName: batch.name,
      releasedAt: at,
      readOnly: false,
    });
  }

  const snapshot: BatchSnapshot = {
    id: nextId("s"),
    releasedAt: at,
    measuredCount: rows.length,
    archivedCount: archived.length,
    rows,
  };

  const batches = state.batches.map((b) =>
    b.id === batch.id
      ? {
          ...b,
          status: "released" as const,
          releasedAt: at,
          lastGate: gate,
          snapshots: [...b.snapshots, snapshot],
        }
      : b
  );

  // 保留全部只读历史链：被接管的旧「有效结果」原地转为只读，其余记录原样保留
  const results = state.results.map((r) => {
    const turned = archived.find((a) => a.id === r.id);
    return turned ?? r;
  });
  results.push(...newResults);

  return { ...state, batches, results };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

function initialState(): AppState {
  let seed = buildSeedState();

  // 种子历史批次按真实规则闸门放行（b1 → b2，后者接管前者 Trumpet 结果）
  for (const id of ["B-2026-03", "B-2026-08"]) {
    const batch = seed.batches.find((b) => b.id === id);
    if (!batch) continue;
    const gate = assessBatch(seed.pipes, batch);
    const at = id === "B-2026-03" ? "2026-03-12T12:00:00.000Z" : "2026-08-22T13:00:00.000Z";
    if (!gate.releasable) {
      throw new Error(`种子批次 ${id} 未通过放行闸门`);
    }
    seed = commitRelease(seed, batch, at, {
      at,
      releasable: true,
      hard: [],
      retest: [],
    });
  }
  return seed;
}

function isValidState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<AppState>;
  return (
    s.version === 1 &&
    Array.isArray(s.pipes) &&
    Array.isArray(s.batches) &&
    Array.isArray(s.results) &&
    typeof s.activeBatchId === "string"
  );
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidState(parsed)) return parsed;
    }
  } catch {
    // 持久化损坏时回落到种子数据
  }
  return initialState();
}

let state: AppState = loadState();
const listeners = new Set<Listener>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仅保留内存态
  }
}

function setState(next: AppState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = loadState();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): AppState {
  return state;
}

/** 业务组件统一通过该 hook 订阅持久化状态 */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    () => selector(getSnapshot())
  );
}

export function getState(): AppState {
  return state;
}

/* ------------------------------------------------------------------ */
/* 选择器                                                              */
/* ------------------------------------------------------------------ */

/** 音管当前唯一有效结果（被接管的只读记录不在此列） */
export function currentResult(results: ResultRecord[], pipeKey: string): ResultRecord | undefined {
  return results.find((r) => r.pipeKey === pipeKey && !r.readOnly);
}

export function pipeById(pipes: Pipe[], key: string): Pipe | undefined {
  return pipes.find((p) => p.key === key);
}

/* ------------------------------------------------------------------ */
/* 动作                                                                */
/* ------------------------------------------------------------------ */

export interface MeasurementDraft {
  pipeKey: string;
  cents: number;
  temperature: number;
  humidity: number;
  reed: Measurement["reed"];
  note: string;
}

/** 保存一次测量：环境越限自动记为待复测；同批次同音字管只保留最后一条 */
export function saveMeasurement(batchId: string, draft: MeasurementDraft): boolean {
  const batch = state.batches.find((b) => b.id === batchId);
  if (!batch || batch.status === "released") return false;

  const cls = classifyMeasurement({
    temperature: draft.temperature,
    humidity: draft.humidity,
  });
  const measured: Measurement = {
    id: nextId("m"),
    pipeKey: draft.pipeKey,
    cents: draft.cents,
    temperature: draft.temperature,
    humidity: draft.humidity,
    reed: draft.reed,
    note: draft.note,
    state: cls.state,
    envReasons: cls.envReasons,
    measuredAt: nowIso(),
  };

  const batches = state.batches.map((b) => {
    if (b.id !== batchId) return b;
    const idx = b.measurements.findIndex((m) => m.pipeKey === draft.pipeKey);
    const measurements =
      idx >= 0
        ? b.measurements.map((m, i) => (i === idx ? measured : m))
        : [...b.measurements, measured];
    // 有新测量后回到记录中，等待再次校验
    return { ...b, measurements, status: "recording" as const };
  });

  setState({ ...state, batches });
  return true;
}

/**
 * 执行维护放行校验。
 * - 全部通过：提交放行事务，接管旧结果并固化快照；
 * - 硬阻断（超差/簧片异常/缺测）：批次整批复为待复核，旧结果与快照不变；
 * - 仅环境越限：相关测量维持待复测，批次继续记录中。
 */
export function runGate(batchId: string): {
  releasable: boolean;
  hard: number;
  retest: number;
  nextStatus: MaintenanceBatch["status"];
} {
  const batch = state.batches.find((b) => b.id === batchId);
  if (!batch || batch.status === "released") {
    return { releasable: false, hard: 0, retest: 0, nextStatus: "released" };
  }

  const outcome = assessBatch(state.pipes, batch);
  const gate: GateRecord = {
    at: nowIso(),
    releasable: outcome.releasable,
    hard: outcome.hard,
    retest: outcome.retest,
  };

  if (outcome.releasable) {
    setState(commitRelease(state, batch, gate.at, gate));
  } else {
    const batches = state.batches.map((b) =>
      b.id === batchId
        ? { ...b, status: outcome.nextStatus, lastGate: gate }
        : b
    );
    setState({ ...state, batches });
  }

  return {
    releasable: outcome.releasable,
    hard: outcome.hard.length,
    retest: outcome.retest.length,
    nextStatus: outcome.nextStatus,
  };
}

/** 新建维护批次（至少选择一个音栓目标） */
export function createBatch(name: string, targets: StopTarget[]): string | null {
  const trimmed = name.trim();
  if (!trimmed || targets.length === 0) return null;
  const id = nextId("b");
  const batch: MaintenanceBatch = {
    id,
    name: trimmed,
    targets,
    createdAt: nowIso(),
    status: "recording",
    measurements: [],
    snapshots: [],
  };
  setState({ ...state, batches: [...state.batches, batch], activeBatchId: id });
  return id;
}

export function setActiveBatch(batchId: string) {
  if (state.activeBatchId === batchId) return;
  if (!state.batches.some((b) => b.id === batchId)) return;
  setState({ ...state, activeBatchId: batchId });
}

/** 清空浏览器持久化并恢复演示数据 */
export function resetToSeed() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  setState(initialState());
}
