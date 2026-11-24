import type { Dir } from "../../../shared/types";

/**
 * 熄灯班的门铃信号。
 *
 * 耳机里只能听到“这一次有哪一类门（机关）改变了”，听不到箱号、具体编号。
 * - blocked：本次口令碰壁（含推不动、门关、地面封闭），状态不变，仍消耗一次口令。
 * - silent：走成了，但没有任何踏板/门/地板的通电状态发生变化。
 * - door-opened / door-closed：至少一扇门被打开 / 关闭（只报类别，不报哪扇）。
 * - bridge-on / bridge-off：至少一块架桥地板被升起 / 收回。
 * - seal-on / seal-off：至少一块封道地板被封上 / 解封。
 *
 * 一次移动若同时改变多类机关，信号里把它们全部列出并按固定顺序排列，
 * 例如 “door-opened|bridge-on”。这仍然只描述“类别”，不暴露编号与箱号。
 */
export type SignalKind =
  | "blocked"
  | "silent"
  | "door-opened"
  | "door-closed"
  | "bridge-on"
  | "bridge-off"
  | "seal-on"
  | "seal-off";

export interface Signal {
  blocked: boolean;
  changed: SignalKind[];
}

export const SIGNAL_TEXT: Record<SignalKind, string> = {
  blocked: "碰壁铃（口令照计）",
  silent: "空铃（走成，机关无变化）",
  "door-opened": "开门铃",
  "door-closed": "关门铃",
  "bridge-on": "架桥铃",
  "bridge-off": "收桥铃",
  "seal-on": "封道铃",
  "seal-off": "解封铃",
};

export function signalKey(signal: Signal): string {
  if (signal.blocked) return "blocked";
  if (signal.changed.length === 0) return "silent";
  return signal.changed.join("|");
}

export function signalLabel(signal: Signal): string {
  if (signal.blocked) return SIGNAL_TEXT.blocked;
  if (signal.changed.length === 0) return SIGNAL_TEXT.silent;
  return signal.changed.map((kind) => SIGNAL_TEXT[kind]).join(" + ");
}

export const DIRS: Dir[] = ["n", "e", "s", "w"];

export const DIR_NAME: Record<Dir, string> = {
  n: "北 ↑",
  e: "东 →",
  s: "南 ↓",
  w: "西 ←",
};
