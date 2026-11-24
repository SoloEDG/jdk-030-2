import type { Dir } from "../../../shared/types";
import {
  cloneState,
  initialState,
  step,
  type BlindBox,
  type BlindSkeleton,
  type BlindState,
} from "./engine";
import { isStaticDead } from "./deadlock";
import { DIRS, signalKey, type Signal } from "./signal";

/**
 * 熄灯班指令树求解器。
 *
 * 一个“信念（belief）”是当前听感下仍然可能的所有假设仓位状态集合。
 * 每次口令后，按门铃信号把集合分桶：同一种铃声的假设必须走同一条后续分支。
 * 保证卸完 = 存在一棵口令树，使每个假设沿自己的铃声分支都到达通关。
 * 目标值 = 这棵树的最小最坏口令数（碰壁口令也计入深度）。
 *
 * 正确性约定：
 * - “已死”只由可靠的静态冻结死锁判定（deadlock.ts），任何枚举截断都不允许判死。
 * - 区分 guaranteed / impossible / unknown：只有信念空间取胜闭包完整算完、根信念仍不在其中，
 *   才下 impossible；任何上限触发都只能是 unknown（尚未算完）。
 */

export interface Candidate {
  id: string;
  label: string;
  player: BlindState["player"];
  boxes: BlindBox[];
}

export interface BeliefState {
  key: string;
  members: BlindState[];
  allCleared: boolean;
  /** 桶内存在可靠静态死局的假设（确定无解，任何树都救不回）。 */
  hasDeadMember: boolean;
}

export interface PlanNode {
  dir: Dir | null; // 根节点未发口令时为 null
  depth: number;
  beliefKey: string;
  allCleared: boolean;
  branches: { signal: string; node: PlanNode }[];
}

export type SolveStatus = "guaranteed" | "impossible" | "unknown";

export interface PartitionInfo {
  dir: Dir;
  buckets: { signal: string; count: number; dead: number }[];
}

export interface ConfusionReport {
  beliefKey: string;
  memberCount: number;
  members: string[];
  partitions: PartitionInfo[];
  deadMembers: string[];
}

export interface SolveResult {
  status: SolveStatus;
  worstCommands: number | null;
  plan: PlanNode | null;
  confusion: ConfusionReport | null;
  exploredBeliefs: number;
  reachedDepth: number;
  note: string;
}

const DEFAULT_MAX_DEPTH = 30;
const DEFAULT_BELIEF_CAP = 40000;

export function stateKey(state: BlindState): string {
  const player = `${state.player.x},${state.player.y}`;
  const boxes = state.boxes
    .map((box) => `${box.kind[0]}${box.x},${box.y}`)
    .sort()
    .join(";");
  const doors = state.doors.map((open) => (open ? "1" : "0")).join("");
  const floors = state.floors.map((active) => (active ? "1" : "0")).join("");
  return `${player}|${boxes}|d${doors}|f${floors}`;
}

export function summarizeState(state: BlindState): string {
  const boxes = state.boxes.map((box) => `${box.kind}(${box.x},${box.y})`).join(" ");
  return `人(${state.player.x},${state.player.y}) 箱[${boxes}]${state.cleared ? " 已卸完" : ""}`;
}

function isDead(state: BlindState, skeleton: BlindSkeleton): boolean {
  if (state.cleared) return false;
  return isStaticDead(state, skeleton);
}

function buildBelief(members: BlindState[], skeleton: BlindSkeleton): BeliefState {
  const unique = new Map<string, BlindState>();
  for (const member of members) unique.set(stateKey(member), member);
  const list = [...unique.values()];
  return {
    key: list.map(stateKey).sort().join(" || "),
    members: list,
    allCleared: list.every((member) => member.cleared),
    hasDeadMember: list.some((member) => isDead(member, skeleton)),
  };
}

function partition(state: BlindState, dir: Dir, skeleton: BlindSkeleton): {
  state: BlindState;
  signal: Signal;
  key: string;
} {
  const outcome = step(state, dir, skeleton);
  return { state: outcome.state, signal: outcome.signal, key: signalKey(outcome.signal) };
}

interface SolverContext {
  skeleton: BlindSkeleton;
  memo: Map<string, number>; // beliefKey@budget -> 最少剩余口令（-1 表示该预算下不行）
  active: Set<string>;
  explored: number;
}

function solveBelief(belief: BeliefState, budget: number, ctx: SolverContext): number | null {
  if (belief.allCleared) return 0;
  if (budget <= 0 || belief.hasDeadMember) return null;
  const memoKey = `${belief.key}@${budget}`;
  const cached = ctx.memo.get(memoKey);
  if (cached !== undefined) return cached === -1 ? null : cached;
  if (ctx.active.has(belief.key)) return null; // 环路无进展，不能当可解
  ctx.active.add(belief.key);
  ctx.explored += 1;

  let best: number | null = null;
  for (const dir of DIRS) {
    const buckets = new Map<string, BlindState[]>();
    let noProgress = true;
    for (const member of belief.members) {
      const outcome = partition(member, dir, ctx.skeleton);
      const list = buckets.get(outcome.key) ?? [];
      list.push(outcome.state);
      buckets.set(outcome.key, list);
      if (stateKey(member) !== stateKey(outcome.state)) noProgress = false;
    }
    if (noProgress) continue; // 对所有假设都原地不动，纯浪费口令
    let worst = 0;
    let feasible = true;
    for (const list of buckets.values()) {
      const child = buildBelief(list, ctx.skeleton);
      if (child.hasDeadMember) {
        feasible = false;
        break;
      }
      const cost = solveBelief(child, budget - 1, ctx);
      if (cost === null) {
        feasible = false;
        break;
      }
      worst = Math.max(worst, 1 + cost);
    }
    if (feasible && worst <= budget && (best === null || worst < best)) best = worst;
  }

  ctx.active.delete(belief.key);
  ctx.memo.set(memoKey, best ?? -1);
  return best;
}

function reconstruct(
  belief: BeliefState,
  budget: number,
  ctx: SolverContext,
  depth: number,
): PlanNode {
  if (belief.allCleared) {
    return { dir: null, depth, beliefKey: belief.key, allCleared: true, branches: [] };
  }
  for (const dir of DIRS) {
    const buckets = new Map<string, BlindState[]>();
    for (const member of belief.members) {
      const outcome = partition(member, dir, ctx.skeleton);
      const list = buckets.get(outcome.key) ?? [];
      list.push(outcome.state);
      buckets.set(outcome.key, list);
    }
    let worst = 0;
    let feasible = true;
    const childEntries: { signal: string; node: PlanNode }[] = [];
    for (const [signal, list] of [...buckets.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const child = buildBelief(list, ctx.skeleton);
      const cost = solveBelief(child, budget - 1, ctx);
      if (cost === null) {
        feasible = false;
        break;
      }
      worst = Math.max(worst, 1 + cost);
      childEntries.push({ signal, node: reconstruct(child, cost, ctx, depth + 1) });
    }
    if (feasible && worst <= budget) {
      return { dir, depth, beliefKey: belief.key, allCleared: false, branches: childEntries };
    }
  }
  return { dir: null, depth, beliefKey: belief.key, allCleared: false, branches: [] };
}

function buildConfusion(belief: BeliefState, skeleton: BlindSkeleton): ConfusionReport {
  const partitions: PartitionInfo[] = [];
  for (const dir of DIRS) {
    const buckets = new Map<string, BlindState[]>();
    for (const member of belief.members) {
      const outcome = partition(member, dir, skeleton);
      const list = buckets.get(outcome.key) ?? [];
      list.push(outcome.state);
      buckets.set(outcome.key, list);
    }
    partitions.push({
      dir,
      buckets: [...buckets.entries()].map(([signal, list]) => ({
        signal,
        count: list.length,
        dead: list.filter((member) => isDead(member, skeleton)).length,
      })),
    });
  }
  return {
    beliefKey: belief.key,
    memberCount: belief.members.length,
    members: belief.members.map(summarizeState),
    partitions,
    deadMembers: belief.members
      .filter((member) => isDead(member, skeleton))
      .map(summarizeState),
  };
}

function candidateRoot(candidate: Candidate, skeleton: BlindSkeleton): BlindState {
  return initialState(candidate.player, candidate.boxes, skeleton);
}

export interface SolveOptions {
  maxDepth?: number;
  beliefCap?: number;
}

export function solveBlind(
  candidates: Candidate[],
  skeleton: BlindSkeleton,
  options: SolveOptions = {},
): SolveResult {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const beliefCap = options.beliefCap ?? DEFAULT_BELIEF_CAP;

  const roots = candidates.map((candidate) => candidateRoot(candidate, skeleton));
  const rootBelief = buildBelief(roots.map(cloneState), skeleton);

  if (rootBelief.hasDeadMember) {
    return {
      status: "impossible",
      worstCommands: null,
      plan: null,
      confusion: buildConfusion(rootBelief, skeleton),
      exploredBeliefs: 0,
      reachedDepth: 0,
      note: "存在起始仓位本身就处于可靠静态死局，任何共享指令树都无法保证。",
    };
  }

  // IDDFS：逐轮加深预算，第一个可行值即最小最坏口令数。
  let reachedDepth = 0;
  let exploredBeliefs = 0;
  for (let budget = 0; budget <= maxDepth; budget += 1) {
    reachedDepth = budget;
    const ctx: SolverContext = {
      skeleton,
      memo: new Map(),
      active: new Set(),
      explored: 0,
    };
    const cost = solveBelief(rootBelief, budget, ctx);
    exploredBeliefs += ctx.explored;
    if (cost !== null) {
      const planCtx: SolverContext = {
        skeleton,
        memo: new Map(),
        active: new Set(),
        explored: 0,
      };
      const plan = reconstruct(rootBelief, cost, planCtx, 0);
      return {
        status: "guaranteed",
        worstCommands: cost,
        plan,
        confusion: null,
        exploredBeliefs,
        reachedDepth: budget,
        note: `已在 ${cost} 次口令内保证全部 ${candidates.length} 个候选仓位卸完（碰壁口令也计入）。`,
      };
    }
  }

  // 预算跑完仍未保证：在信念空间做取胜闭包不动点，区分“真无解”与“尚未算完”。
  const proof = proveImpossible(rootBelief, skeleton, beliefCap);
  if (proof.status === "impossible" && proof.confusion) {
    return {
      status: "impossible",
      worstCommands: null,
      plan: null,
      confusion: proof.confusion,
      exploredBeliefs: exploredBeliefs + proof.explored,
      reachedDepth,
      note: "可证明不存在保证策略：铃声无法把仍混淆的仓位分到各自所需的相反分支。",
    };
  }
  return {
    status: "unknown",
    worstCommands: null,
    plan: null,
    confusion: proof.confusion,
    exploredBeliefs: exploredBeliefs + proof.explored,
    reachedDepth,
    note:
      `在 ${maxDepth} 次口令预算内尚未算出保证策略；闭包枚举触及上限，这是“尚未算完”，不能断言无解。` +
      (proof.confusion ? " 下方给出当前仍混淆的仓况供排查。" : ""),
  };
}

interface ProofResult {
  status: SolveStatus;
  confusion: ConfusionReport | null;
  explored: number;
}

/**
 * 信念空间“取胜闭包”不动点（精确可达，不做任何会漏解的截断判死）：
 * 从全通关信念出发，不断并入“存在一种口令，使所有铃声子桶都已在闭包内”的信念。
 * - 完整枚举后根信念仍不在闭包 => impossible（有限空间，结论可靠）；
 * - 枚举触顶 => unknown（尚未算完）。
 */
function proveImpossible(
  root: BeliefState,
  skeleton: BlindSkeleton,
  cap: number,
): ProofResult {
  const winning = new Set<string>();
  const all = new Map<string, BeliefState>();
  const queue: BeliefState[] = [root];
  let explored = 0;
  let capped = false;

  while (queue.length > 0) {
    const belief = queue.shift()!;
    if (all.has(belief.key)) continue;
    all.set(belief.key, belief);
    explored += 1;
    if (all.size > cap) {
      capped = true;
      break;
    }
    if (belief.allCleared) {
      winning.add(belief.key);
      continue;
    }
    if (belief.hasDeadMember) continue; // 可靠死局，永远进不了闭包
    for (const dir of DIRS) {
      const buckets = new Map<string, BlindState[]>();
      for (const member of belief.members) {
        const outcome = partition(member, dir, skeleton);
        const list = buckets.get(outcome.key) ?? [];
        list.push(outcome.state);
        buckets.set(outcome.key, list);
      }
      for (const list of buckets.values()) {
        const child = buildBelief(list, skeleton);
        if (!all.has(child.key) && !child.hasDeadMember) queue.push(child);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const belief of all.values()) {
      if (winning.has(belief.key) || belief.hasDeadMember) continue;
      for (const dir of DIRS) {
        const buckets = new Map<string, BlindState[]>();
        let everyChildKnown = true;
        for (const member of belief.members) {
          const outcome = partition(member, dir, skeleton);
          const list = buckets.get(outcome.key) ?? [];
          list.push(outcome.state);
          buckets.set(outcome.key, list);
        }
        const childKeys: string[] = [];
        for (const list of buckets.values()) {
          const child = buildBelief(list, skeleton);
          if (!all.has(child.key)) {
            everyChildKnown = false; // 有子桶尚未枚举完（触顶），本轮不能据此并入
            break;
          }
          childKeys.push(child.key);
        }
        if (everyChildKnown && childKeys.every((key) => winning.has(key))) {
          winning.add(belief.key);
          changed = true;
          break;
        }
      }
    }
  }

  if (winning.has(root.key)) return { status: "unknown", confusion: null, explored };
  const witness = all.get(root.key) ?? root;
  return {
    status: capped ? "unknown" : "impossible",
    confusion: buildConfusion(witness, skeleton),
    explored,
  };
}
