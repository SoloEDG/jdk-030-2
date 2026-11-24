import { computed, ref, shallowRef } from "vue";
import { hydrate, LEVELS, getLevel } from "../../voyage";
import type { BlindStart, LevelBlueprint } from "../../voyage/lib/catalog";
import {
  betterBlindRecord,
  readBlindSave,
  writeBlindSave,
  type BlindLevelRecord,
} from "../../voyage/lib/persist";
import {
  cloneState,
  initialState,
  isCleared,
  skeletonFromLevel,
  step,
  type BlindSkeleton,
  type BlindState,
} from "../lib/engine";
import {
  solveBlind,
  stateKey,
  summarizeState,
  type Candidate,
  type ConfusionReport,
  type PlanNode,
  type SolveResult,
} from "../lib/solver";
import { signalKey, signalLabel, type Signal, DIR_NAME } from "../lib/signal";
import type { Dir, RuntimeLevel } from "../../../shared/types";

/**
 * 熄灯班会话：
 * - 入场只公示候选起始仓位，实际派工由“抽签”决定，玩家在抽中前不知道自己是哪一个。
 * - 玩家照指令树执行：每个节点给出当前应发的口令；发令后按真实门铃铃声进入对应分支。
 * - 盲运计口令数（撞墙也计）；普通班只计走成的步数。两套成绩分列保存。
 */

export interface BlindCandidateView {
  id: string;
  label: string;
}

export interface BlindLogEntry {
  index: number;
  dir: Dir;
  signal: Signal;
  signalText: string;
  blocked: boolean;
  commands: number;
}

export interface BlindRunSummary {
  levelId: string;
  levelTitle: string;
  candidateLabel: string;
  commands: number;
  worstCommands: number;
  cleared: boolean;
  deviated: boolean;
}

export type BlindPhase = "briefing" | "running" | "cleared";

function toCandidate(blueprint: LevelBlueprint, start: BlindStart): Candidate {
  return {
    id: start.id,
    label: start.label,
    player: { ...start.player },
    boxes: (start.boxes ?? blueprint.boxes).map((box) => ({
      kind: box.kind,
      x: box.x,
      y: box.y,
    })),
  };
}

export function useBlindShift() {
  const levelId = ref<string>(LEVELS[0].id);
  const phase = ref<BlindPhase>("briefing");
  const solving = ref(false);
  const solveResult = shallowRef<SolveResult | null>(null);

  // 抽签后才确定的真实仓位（对玩家保密，仅引擎内部使用）。
  const actualCandidateId = ref<string | null>(null);
  const skeletonRef = shallowRef<BlindSkeleton | null>(null);
  const actualState = shallowRef<BlindState | null>(null);
  const beliefMembers = ref<BlindState[]>([]);
  const currentNode = shallowRef<PlanNode | null>(null);
  const planRoot = shallowRef<PlanNode | null>(null);
  const commands = ref(0);
  const log = ref<BlindLogEntry[]>([]);
  const lastSignal = ref<Signal | null>(null);
  const runHistory = ref<BlindRunSummary[]>([]);
  const blindRecords = ref<Record<string, BlindLevelRecord>>(readBlindSave().records);
  // 是否发出了指令树规定之外的口令；一旦偏离，本次执行不再算“保送”。
  const deviated = ref(false);
  const warning = ref<string | null>(null);

  const blueprint = computed<LevelBlueprint>(() => getLevel(levelId.value));
  const runtime = computed<RuntimeLevel>(() => hydrate(blueprint.value));
  const candidates = computed<BlindCandidateView[]>(() =>
    (blueprint.value.blindStarts ?? []).map((start) => ({ id: start.id, label: start.label })),
  );
  const hasBlindStarts = computed(() => candidates.value.length > 0);

  function openLevel(id: string): void {
    levelId.value = id;
    resetBriefing();
  }

  function resetBriefing(): void {
    phase.value = "briefing";
    solving.value = false;
    solveResult.value = null;
    actualCandidateId.value = null;
    skeletonRef.value = null;
    actualState.value = null;
    beliefMembers.value = [];
    currentNode.value = null;
    planRoot.value = null;
    commands.value = 0;
    log.value = [];
    lastSignal.value = null;
    deviated.value = false;
    warning.value = null;
  }

  /** 班前排树：在候选仓位上求最少最坏口令数。 */
  async function planShift(maxDepth = 24, beliefCap = 30000): Promise<SolveResult | null> {
    if (!hasBlindStarts.value) return null;
    const bp = blueprint.value;
    const level = hydrate(bp);
    const skeleton = skeletonFromLevel(level);
    skeletonRef.value = skeleton;
    const cands = (bp.blindStarts ?? []).map((start) => toCandidate(bp, start));
    solving.value = true;
    // 让 UI 有机会进入加载态，再做同步重算。
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = solveBlind(cands, skeleton, { maxDepth, beliefCap });
    solveResult.value = result;
    solving.value = false;
    if (result.status === "guaranteed" && result.plan) {
      planRoot.value = result.plan;
      currentNode.value = result.plan;
      beliefMembers.value = cands.map((candidate) =>
        initialState(candidate.player, candidate.boxes, skeleton),
      );
    }
    return result;
  }

  /** 抽签：玩家亲自抽一个仓位，但抽中结果不立即揭晓，只在内部锁定。 */
  function drawCandidate(candidateId?: string): BlindCandidateView | null {
    if (!hasBlindStarts.value || !skeletonRef.value) return null;
    const pool = candidates.value;
    const picked =
      candidateId != null && pool.some((c) => c.id === candidateId)
        ? pool.find((c) => c.id === candidateId)!
        : pool[Math.floor(Math.random() * pool.length)];
    actualCandidateId.value = picked.id;
    const bp = blueprint.value;
    const start = (bp.blindStarts ?? []).find((s) => s.id === picked.id)!;
    const candidate = toCandidate(bp, start);
    actualState.value = initialState(candidate.player, candidate.boxes, skeletonRef.value);
    phase.value = "running";
    commands.value = 0;
    log.value = [];
    lastSignal.value = null;
    deviated.value = false;
    warning.value = null;
    currentNode.value = planRoot.value;
    return picked;
  }

  /** 发一个方向口令；按真实铃声走指令树分支。撞墙也计一次。 */
  function issueCommand(dir: Dir): void {
    if (phase.value !== "running" || !actualState.value || !skeletonRef.value || !currentNode.value) {
      return;
    }
    const node = currentNode.value;
    if (node.allCleared || node.dir == null) return;
    const prescribed = node.dir;
    const outcome = step(actualState.value, dir, skeletonRef.value);
    commands.value += 1;
    lastSignal.value = outcome.signal;
    const entry: BlindLogEntry = {
      index: commands.value,
      dir,
      signal: outcome.signal,
      signalText: signalLabel(outcome.signal),
      blocked: outcome.signal.blocked,
      commands: commands.value,
    };
    log.value = [...log.value, entry];
    actualState.value = outcome.state;

    // 偏离指令树：照实模拟并计数，但不再能保证覆盖所有派工，也不前进树分支。
    if (deviated.value || dir !== prescribed) {
      deviated.value = true;
      warning.value =
        dir !== prescribed
          ? `口令 ${DIR_NAME[dir]} 不在指令树上：本次执行已脱离保送，后续只按真实状态模拟。`
          : "已脱离指令树，剩余口令不再受保证覆盖。";
      if (isCleared(outcome.state, skeletonRef.value)) {
        phase.value = "cleared";
        commitRun(true);
      }
      return;
    }

    const key = signalKey(outcome.signal);
    const branch = node.branches.find((item) => item.signal === key);
    if (branch) {
      currentNode.value = branch.node;
      // 同步更新当前听感下仍可能的信念成员（共知视图用）。
      beliefMembers.value = advanceBelief(beliefMembers.value, dir, key, skeletonRef.value);
    }
    if (isCleared(outcome.state, skeletonRef.value)) {
      phase.value = "cleared";
      commitRun(true);
    }
  }

  function advanceBelief(
    members: BlindState[],
    dir: Dir,
    expectedKey: string,
    skeleton: BlindSkeleton,
  ): BlindState[] {
    const next: BlindState[] = [];
    for (const member of members) {
      const outcome = step(member, dir, skeleton);
      if (signalKey(outcome.signal) === expectedKey) next.push(outcome.state);
    }
    return next.length > 0 ? next : members;
  }

  function commitRun(cleared: boolean): void {
    if (!actualCandidateId.value || !solveResult.value) return;
    const picked = candidates.value.find((c) => c.id === actualCandidateId.value);
    runHistory.value = [
      {
        levelId: levelId.value,
        levelTitle: blueprint.value.title,
        candidateLabel: picked?.label ?? actualCandidateId.value,
        commands: commands.value,
        worstCommands: solveResult.value.worstCommands ?? -1,
        cleared,
        deviated: deviated.value,
      },
      ...runHistory.value,
    ];
    // 保送成绩只承认“严格照树、未偏离”的卸完；偏离后即便碰巧卸完也不写入保送榜。
    if (
      cleared &&
      !deviated.value &&
      solveResult.value.status === "guaranteed" &&
      solveResult.value.worstCommands != null
    ) {
      const save = readBlindSave();
      save.records[levelId.value] = betterBlindRecord(
        save.records[levelId.value],
        solveResult.value.worstCommands,
        Date.now(),
      );
      writeBlindSave(save);
      blindRecords.value = { ...save.records };
    }
  }

  /** 共知视图：只显示全部候选当前都能确定的信息（位置种类计数、门/板状态、目标进度）。 */
  const commonView = computed(() => {
    const members = beliefMembers.value;
    if (members.length === 0 || !skeletonRef.value) return null;
    return buildCommonView(members, skeletonRef.value);
  });

  const prescribedCommand = computed<Dir | null>(() =>
    currentNode.value && !currentNode.value.allCleared ? currentNode.value.dir : null,
  );

  const confusion = computed<ConfusionReport | null>(() => solveResult.value?.confusion ?? null);

  return {
    levelId,
    blueprint,
    runtime,
    candidates,
    hasBlindStarts,
    phase,
    solving,
    solveResult,
    planRoot,
    currentNode,
    commands,
    log,
    lastSignal,
    runHistory,
    blindRecords,
    deviated,
    warning,
    commonView,
    prescribedCommand,
    confusion,
    actualCandidateId,
    openLevel,
    resetBriefing,
    planShift,
    drawCandidate,
    issueCommand,
    dirName: (dir: Dir) => DIR_NAME[dir],
    signalText: (signal: Signal) => signalLabel(signal),
    summarize: (state: BlindState) => summarizeState(state),
    stateKeyOf: (state: BlindState) => stateKey(state),
    cloneForView: (state: BlindState) => cloneState(state),
  };
}

export interface CommonView {
  memberCount: number;
  /** 所有候选当前人位是否一致；一致才公示坐标，否则只公示“尚不确定”。 */
  playerKnown: boolean;
  player: { x: number; y: number } | null;
  /** 每个格上是否所有候选都有箱子（共知箱位）。 */
  commonBoxCells: { x: number; y: number; kind: string }[];
  /** 全部候选一致的货种计数（共同可知的货种数）。 */
  boxKindCounts: { kind: string; count: number; known: boolean }[];
  doorStates: { x: number; y: number; open: boolean; known: boolean }[];
  plateStates: { x: number; y: number; accept: string; powered: boolean; known: boolean }[];
  floorStates: { x: number; y: number; morph: string; active: boolean; known: boolean }[];
  goalTotal: number;
  /** 所有候选都已填上的目标数（共同可知的最低进度）。 */
  commonFilledGoals: number;
  allCleared: boolean;
}

function buildCommonView(members: BlindState[], skeleton: BlindSkeleton): CommonView {
  const first = members[0];
  const playerKnown = members.every(
    (m) => m.player.x === first.player.x && m.player.y === first.player.y,
  );

  const boxKey = (x: number, y: number, kind: string) => `${kind}@${x},${y}`;
  let commonBoxKeys = new Set(
    first.boxes.map((box) => boxKey(box.x, box.y, box.kind)),
  );
  for (const member of members.slice(1)) {
    const keys = new Set(member.boxes.map((box) => boxKey(box.x, box.y, box.kind)));
    commonBoxKeys = new Set([...commonBoxKeys].filter((key) => keys.has(key)));
  }
  const commonBoxCells = [...commonBoxKeys].map((key) => {
    const [kind, coord] = key.split("@");
    const [x, y] = coord.split(",").map(Number);
    return { x, y, kind };
  });

  // 货种数：只在所有候选的该货种计数完全一致时才公示，否则标“不确定”。
  const allKinds = new Set<string>();
  for (const member of members) for (const box of member.boxes) allKinds.add(box.kind);
  const boxKindCounts = [...allKinds].map((kind) => {
    const count = first.boxes.filter((box) => box.kind === kind).length;
    const known = members.every(
      (member) => member.boxes.filter((box) => box.kind === kind).length === count,
    );
    return { kind, count, known };
  });

  const doorStates = skeleton.doors.map((door, index) => {
    const open = first.doors[index];
    const known = members.every((m) => m.doors[index] === open);
    return { x: door.x, y: door.y, open, known };
  });
  const plateStates = skeleton.plates.map((plate, index) => {
    const powered = first.plates[index];
    const known = members.every((m) => m.plates[index] === powered);
    return { x: plate.x, y: plate.y, accept: plate.accept, powered, known };
  });
  const floorStates = skeleton.floors.map((floor, index) => {
    const active = first.floors[index];
    const known = members.every((m) => m.floors[index] === active);
    return { x: floor.x, y: floor.y, morph: floor.morph, active, known };
  });

  const goalTotal = skeleton.goals.length;
  const filledIn = (member: BlindState) =>
    skeleton.goals.filter((goal) =>
      member.boxes.some((box) => box.x === goal.x && box.y === goal.y),
    ).length;
  const commonFilledGoals = Math.min(...members.map(filledIn));
  const allCleared = members.every((member) => isCleared(member, skeleton));

  return {
    memberCount: members.length,
    playerKnown,
    player: playerKnown ? { ...first.player } : null,
    commonBoxCells,
    boxKindCounts,
    doorStates,
    plateStates,
    floorStates,
    goalTotal,
    commonFilledGoals,
    allCleared,
  };
}
