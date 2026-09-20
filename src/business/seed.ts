import type {
  AppState,
  MaintenanceBatch,
  Measurement,
  Pipe,
  ReedStatus,
} from "../types";
import { classifyMeasurement, pipeKey } from "./rules";

/**
 * 初始业务数据：
 *  - B-2026-03 春季定期维护：已放行
 *  - B-2026-08 夏季复调维护：已放行（接管 Trumpet 8' 的上一条结果，旧记录只读归档）
 *  - B-2026-09 秋季待放行批次：存在超差、簧片异常、缺测与环境越限，用于演示闭环
 */

interface PipeSeed {
  venue: string;
  stop: string;
  reedStop?: boolean;
  /** [编号, 音高] */
  pipes: [string, string][];
}

const PIPE_SEEDS: PipeSeed[] = [
  {
    venue: "St.Mary 教堂",
    stop: "Trumpet 8'",
    reedStop: true,
    pipes: [
      ["C4", "C4"],
      ["D4", "D4"],
      ["E4", "E4"],
      ["F#4", "F#4"],
      ["G#4", "G#4"],
      ["A4", "A4"],
      ["B4", "B4"],
      ["C#4", "C#4"],
    ],
  },
  {
    venue: "St.Mary 教堂",
    stop: "Principal 4'",
    pipes: [
      ["G3", "G3"],
      ["A3", "A3"],
      ["B3", "B3"],
      ["C4", "C4"],
      ["D4", "D4"],
      ["E4", "E4"],
    ],
  },
  {
    venue: "ConcertHall A",
    stop: "Principal 4'",
    pipes: [
      ["G3", "G3"],
      ["A3", "A3"],
      ["B3", "B3"],
      ["C4", "C4"],
      ["D4", "D4"],
      ["E4", "E4"],
    ],
  },
  {
    venue: "Abbey Room",
    stop: "Bourdon 16'",
    pipes: [
      ["C2", "C2"],
      ["F2", "F2"],
      ["G2", "G2"],
    ],
  },
];

export function buildPipes(): Pipe[] {
  const out: Pipe[] = [];
  for (const s of PIPE_SEEDS) {
    for (const [pipeNo, pitch] of s.pipes) {
      out.push({
        key: pipeKey(s.venue, s.stop, pipeNo),
        venue: s.venue,
        stop: s.stop,
        pipeNo,
        pitch,
        reedStop: s.reedStop ?? false,
      });
    }
  }
  return out;
}

let seq = 0;
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

interface MeasSeed {
  pipe: Pipe;
  cents: number;
  temp: number;
  humidity: number;
  reed?: ReedStatus;
  note?: string;
  at: string;
}

function measurement(s: MeasSeed): Measurement {
  const cls = classifyMeasurement({ temperature: s.temp, humidity: s.humidity });
  return {
    id: nextId("m"),
    pipeKey: s.pipe.key,
    cents: s.cents,
    temperature: s.temp,
    humidity: s.humidity,
    reed: s.reed ?? (s.pipe.reedStop ? "normal" : "normal"),
    note: s.note ?? "",
    state: cls.state,
    envReasons: cls.envReasons,
    measuredAt: s.at,
  };
}

function batch(
  id: string,
  name: string,
  targets: Pipe[],
  measurements: Measurement[],
  createdAt: string
): MaintenanceBatch {
  return {
    id,
    name,
    targets: targets.map((p) => ({ venue: p.venue, stop: p.stop })),
    createdAt,
    status: "recording",
    measurements,
    snapshots: [],
  };
}

function find(pipes: Pipe[], venue: string, stop: string, no: string): Pipe {
  const p = pipes.find(
    (x) => x.venue === venue && x.stop === stop && x.pipeNo === no
  );
  if (!p) throw new Error(`seed pipe missing: ${venue} ${stop} ${no}`);
  return p;
}

/** 构造尚未放行的批次草稿；由 storage 统一走规则闸门生成结果与快照 */
export function buildSeedState(): AppState {
  const pipes = buildPipes();
  const dedupeTargets = (list: Pipe[]) => {
    const seen = new Set<string>();
    return list.filter((p) => {
      const k = `${p.venue}/${p.stop}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const trumpets = pipes.filter((p) => p.venue === "St.Mary 教堂" && p.stop === "Trumpet 8'");
  const stMaryPrincipal = pipes.filter((p) => p.venue === "St.Mary 教堂" && p.stop === "Principal 4'");
  const chPrincipal = pipes.filter((p) => p.venue === "ConcertHall A");
  const bourdon = pipes.filter((p) => p.venue === "Abbey Room");

  // ---- B-2026-03：Trumpet 8' + Principal 4'(St.Mary)，全部合格 ----
  const b1Targets = dedupeTargets([...trumpets, ...stMaryPrincipal]);
  const b1 = batch(
    "B-2026-03",
    "2026 春季定期维护",
    b1Targets,
    [
      ...trumpets.map((p, i) =>
        measurement({
          pipe: p,
          cents: [3, -2, 1, -4, 2, 5, -3, 7][i],
          temp: 21,
          humidity: 55,
          reed: "normal",
          note: p.pipeNo === "C#4" ? "簧片微调后复测合格" : "",
          at: "2026-03-12T10:20:00.000Z",
        })
      ),
      ...stMaryPrincipal.map((p, i) =>
        measurement({
          pipe: p,
          cents: [-1, 2, 0, -3, 4, -2][i],
          temp: 21.5,
          humidity: 54,
          at: "2026-03-12T11:00:00.000Z",
        })
      ),
    ],
    "2026-03-12T09:00:00.000Z"
  );

  // ---- B-2026-08：复调 Trumpet 8'，接管 3 月结果；另放行 ConcertHall 与 Bourdon ----
  const b2Targets = dedupeTargets([...trumpets, ...chPrincipal, ...bourdon]);
  const b2 = batch(
    "B-2026-08",
    "2026 夏季复调维护",
    b2Targets,
    [
      ...trumpets.map((p, i) =>
        measurement({
          pipe: p,
          cents: [1, -1, 2, 0, -2, 3, 1, 2][i],
          temp: 24,
          humidity: 60,
          reed: "normal",
          note: p.pipeNo === "C#4" ? "复调后偏差收敛，接管上一条结果" : "",
          at: "2026-08-22T10:30:00.000Z",
        })
      ),
      ...chPrincipal.map((p, i) =>
        measurement({
          pipe: p,
          cents: [-3, 1, 2, -1, 0, -2][i],
          temp: 24.5,
          humidity: 61,
          at: "2026-08-22T11:10:00.000Z",
        })
      ),
      ...bourdon.map((p, i) =>
        measurement({
          pipe: p,
          cents: [-6, -8, 4][i],
          temp: 23,
          humidity: 58,
          note: p.pipeNo === "F2" ? "接近下限，持续观察" : "",
          at: "2026-08-22T12:00:00.000Z",
        })
      ),
    ],
    "2026-08-22T09:00:00.000Z"
  );

  // ---- B-2026-09：覆盖全部音栓，含 超差/簧片异常/缺测/环境越限 ----
  const b3Targets = dedupeTargets(pipes);
  const f2 = find(pipes, "Abbey Room", "Bourdon 16'", "F2");
  const cs4 = find(pipes, "St.Mary 教堂", "Trumpet 8'", "C#4");
  const g3 = find(pipes, "St.Mary 教堂", "Principal 4'", "G3");
  const c4t = find(pipes, "St.Mary 教堂", "Trumpet 8'", "C4");
  const g2 = find(pipes, "Abbey Room", "Bourdon 16'", "G2");
  const b3 = batch(
    "B-2026-09",
    "2026 秋季维护（待放行）",
    b3Targets,
    [
      measurement({ pipe: f2, cents: -12, temp: 18, humidity: 60, note: "低音区仍偏低，标记复检", at: "2026-09-18T09:30:00.000Z" }),
      measurement({ pipe: cs4, cents: 2, temp: 19, humidity: 58, reed: "abnormal", note: "簧片有杂音，待更换", at: "2026-09-18T09:50:00.000Z" }),
      measurement({ pipe: g3, cents: 1, temp: 8, humidity: 55, note: "晨间低温测量", at: "2026-09-18T08:10:00.000Z" }),
      measurement({ pipe: c4t, cents: 0, temp: 20, humidity: 57, reed: "normal", at: "2026-09-18T10:05:00.000Z" }),
      measurement({ pipe: g2, cents: -2, temp: 20, humidity: 76, note: "高湿环境", at: "2026-09-18T10:20:00.000Z" }),
    ],
    "2026-09-18T08:00:00.000Z"
  );

  return {
    version: 1,
    pipes,
    batches: [b1, b2, b3],
    results: [],
    activeBatchId: b3.id,
  };
}
