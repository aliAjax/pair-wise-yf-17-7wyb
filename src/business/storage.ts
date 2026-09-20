/**
 * 存储层：localStorage 持久化 + 维护放行动作。
 * 规则判定全部委托 src/domain/rules；本模块只负责状态流转与持久化。
 */

import {
  applyRetake,
  buildDecision,
  describeMeasurement,
  evaluateBatch,
  pipeKey,
  releaseSnapshot,
} from "../domain/rules";
import type {
  BatchStatus,
  MaintenanceBatch,
  Measurement,
  MeasurementInput,
  PipeSlot,
  ReleaseDecision,
  TuningState,
} from "../domain/types";
import { buildSeedState } from "./seed";

const STORAGE_KEY = "hxyfront-62005.tuning.v1";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 快照冻结：放行后任何路径都无法改动其内容 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function load(): TuningState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TuningState;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.batches)) {
        return parsed;
      }
    }
  } catch {
    // 持久化损坏时回落到演示数据，不阻断业务
  }
  const seeded = buildSeedState();
  persist(seeded);
  return seeded;
}

function persist(state: TuningState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等场景下仅内存态可用
  }
}

let state: TuningState = load();
const listeners = new Set<() => void>();

function commit(next: TuningState): TuningState {
  state = next;
  persist(state);
  listeners.forEach((listener) => listener());
  return state;
}

export function getState(): TuningState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetToSeed(): TuningState {
  return commit(clone(buildSeedState()));
}

export function clearAll(): TuningState {
  return commit({ version: 1, batches: [], current: {}, archive: [] });
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

function findBatch(s: TuningState, batchId: string): MaintenanceBatch {
  const batch = s.batches.find((b) => b.id === batchId);
  if (!batch) throw new Error("维护批次不存在或已关闭");
  return batch;
}

export interface CreateBatchInput {
  venue: string;
  stop: string;
  slots: PipeSlot[];
  code?: string;
}

/** 新建维护批次（同一音栓可重复发起，用于复调） */
export function createBatch(input: CreateBatchInput): MaintenanceBatch {
  const venue = input.venue.trim();
  const stop = input.stop.trim();
  if (!venue || !stop) throw new Error("请填写场馆名称与音栓");
  if (input.slots.length === 0) throw new Error("至少添加一个音管编号");
  const duplicatePipes = input.slots.filter(
    (slot, i) => input.slots.findIndex((x) => x.pipeNo === slot.pipeNo) !== i,
  );
  if (duplicatePipes.length > 0) throw new Error("同一批次中音管编号不能重复");

  const id = nextId("b");
  const batch: MaintenanceBatch = {
    id,
    code:
      input.code?.trim() ||
      `WB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(
        state.batches.length + 1,
      ).padStart(2, "0")}`,
    venue,
    stop,
    slots: clone(input.slots),
    measurements: [],
    status: "open",
    createdAt: Date.now(),
    releasedAt: null,
    lastDecision: null,
    snapshot: null,
  };
  commit({ ...state, batches: [batch, ...state.batches] });
  return batch;
}

/** 向批次追加测量（或对该音管发起复调） */
export function recordMeasurement(
  batchId: string,
  input: MeasurementInput,
  recordedAt = Date.now(),
): { batch: MaintenanceBatch; measurement: Measurement } {
  if (!input.pipeNo.trim()) throw new Error("请填写音管编号");
  const s = clone(state);
  const batch = findBatch(s, batchId);
  if (batch.status === "released") throw new Error("批次已放行并冻结，不能再录入测量");
  if (!batch.slots.some((slot) => slot.pipeNo === input.pipeNo.trim())) {
    throw new Error("该音管不在本批次音栓计划中");
  }

  const d = describeMeasurement(input);
  const measurement: Measurement = {
    ...input,
    pipeNo: input.pipeNo.trim(),
    id: nextId("m"),
    batchId: batch.id,
    venue: batch.venue,
    stop: batch.stop,
    recordedAt,
    // 环境超闸门：只记为待复测，绝不接管当前记录
    kind: d.envValid ? "current" : "retest",
    envValid: d.envValid,
    envReasons: d.envReasons,
    faultReasons: d.faultReasons,
  };

  batch.measurements = applyRetake(batch.measurements, measurement);
  // 录入后即时刷新：仍可放行的批次回到进行中，否则按裁决进入待复核/待复测
  const evaluation = evaluateBatch(batch).status;
  batch.status = evaluation === "released" ? "open" : evaluation;
  commit(s);
  return { batch, measurement };
}

export interface ReleaseResult {
  batch: MaintenanceBatch;
  decision: ReleaseDecision;
  released: boolean;
  /** 本次放行接管的音管（复调成功） */
  takenOver: string[];
}

/**
 * 申请维护放行：
 * - 满足规则 -> 冻结快照、每管唯一有效结果、旧结果转只读档
 * - 偏差超 8 音分 / 簧片异常 / 缺测 -> 整批待复核，旧结果与已有快照不变
 * - 仅温湿度超闸门 -> 整批待复测，旧结果与快照不变
 */
export function requestRelease(batchId: string): ReleaseResult {
  const s = clone(state);
  const batch = findBatch(s, batchId);
  if (batch.status === "released") throw new Error("批次已放行，无需重复放行");

  const decision = buildDecision(batch, Date.now());
  batch.lastDecision = decision;

  if (decision.decision !== "released") {
    batch.status = decision.decision satisfies BatchStatus;
    commit(s);
    return { batch, decision, released: false, takenOver: [] };
  }

  const snapshot = releaseSnapshot(batch.measurements).map((m) => ({ ...m }));
  deepFreeze(snapshot);
  batch.snapshot = snapshot;
  batch.status = "released";
  batch.releasedAt = decision.decidedAt;

  // 接管当前有效结果：每根音管只保留一条，旧结果进入只读档
  const current = { ...s.current };
  const archive = [...s.archive];
  const takenOver: string[] = [];
  for (const m of snapshot) {
    const key = pipeKey(batch.venue, batch.stop, m.pipeNo);
    const prev = current[key];
    if (prev) {
      archive.push({
        pipeKey: key,
        result: prev,
        supersededByBatchId: batch.id,
        supersededAt: batch.releasedAt!,
      });
      takenOver.push(m.pipeNo);
    }
    current[key] = {
      pipeKey: key,
      venue: batch.venue,
      stop: batch.stop,
      pipeNo: m.pipeNo,
      measurement: m,
      batchId: batch.id,
      releasedAt: batch.releasedAt!,
    };
  }

  commit({ ...s, current, archive });
  return { batch, decision, released: true, takenOver };
}

/** 批次内每根音管的最新候选记录（只读历史除外） */
export function latestAttempts(batch: MaintenanceBatch): Map<string, Measurement> {
  const map = new Map<string, Measurement>();
  for (const m of batch.measurements) {
    if (m.kind === "readonly") continue;
    const prev = map.get(m.pipeNo);
    if (!prev || m.recordedAt >= prev.recordedAt) map.set(m.pipeNo, m);
  }
  return map;
}

/** 批次内某音管的全部尝试（按时间倒序），用于查看只读记录 */
export function attemptsOf(batch: MaintenanceBatch, pipeNo: string): Measurement[] {
  return batch.measurements
    .filter((m) => m.pipeNo === pipeNo)
    .sort((a, b) => b.recordedAt - a.recordedAt);
}
