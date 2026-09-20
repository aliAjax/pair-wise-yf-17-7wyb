import { useSyncExternalStore } from "react";
import { getState, subscribe } from "../business/storage";
import type { TuningState } from "../domain/types";

/** 浏览器持久化与 React 视图同步 */
export function useTuningState(): TuningState {
  return useSyncExternalStore(subscribe, getState, getState);
}
