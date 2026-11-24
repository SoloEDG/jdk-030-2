import type { LevelRecord } from "../../../shared/types";

export const STORAGE_KEY = "jdk-030.voyage.v1";
export const BLIND_STORAGE_KEY = "jdk-030.blindshift.v1";

export interface VoyageSave {
  version: 1;
  currentLevelId: string;
  records: Record<string, LevelRecord>;
}

/** 熄灯班保送成绩：按关卡保存最少最坏口令数（撞墙口令也计入）。 */
export interface BlindLevelRecord {
  worstCommands: number;
  solvedAt: number;
}

export interface BlindSave {
  version: 1;
  records: Record<string, BlindLevelRecord>;
}

export function readSave(): VoyageSave | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VoyageSave;
    if (parsed.version !== 1 || typeof parsed.currentLevelId !== "string") return null;
    if (!parsed.records || typeof parsed.records !== "object" || Array.isArray(parsed.records)) return null;
    const records = Object.fromEntries(Object.entries(parsed.records).filter(([, record]) =>
      record && Number.isSafeInteger(record.bestSteps) && record.bestSteps > 0 &&
      Number.isFinite(record.clearedAt) && Number.isFinite(new Date(record.clearedAt).getTime()),
    ));
    return { version: 1, currentLevelId: parsed.currentLevelId, records };
  } catch {
    return null;
  }
}

export function writeSave(save: VoyageSave): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

export function readBlindSave(): BlindSave {
  try {
    const raw = localStorage.getItem(BLIND_STORAGE_KEY);
    if (!raw) return { version: 1, records: {} };
    const parsed = JSON.parse(raw) as BlindSave;
    if (parsed.version !== 1 || !parsed.records || typeof parsed.records !== "object") {
      return { version: 1, records: {} };
    }
    const records = Object.fromEntries(
      Object.entries(parsed.records).filter(
        ([, record]) =>
          record &&
          Number.isSafeInteger(record.worstCommands) &&
          record.worstCommands >= 0 &&
          Number.isFinite(record.solvedAt),
      ),
    );
    return { version: 1, records };
  } catch {
    return { version: 1, records: {} };
  }
}

export function writeBlindSave(save: BlindSave): void {
  localStorage.setItem(BLIND_STORAGE_KEY, JSON.stringify(save));
}

export function betterBlindRecord(
  current: BlindLevelRecord | undefined,
  worstCommands: number,
  at: number,
): BlindLevelRecord {
  if (!current || worstCommands < current.worstCommands) {
    return { worstCommands, solvedAt: at };
  }
  return current;
}

export function betterRecord(
  current: LevelRecord | undefined,
  steps: number,
  at: number,
): LevelRecord {
  if (!current || steps < current.bestSteps) return { bestSteps: steps, clearedAt: at };
  return current;
}
