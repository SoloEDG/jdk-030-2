import type {
  BoxKind,
  Dir,
  Door,
  FloorMorph,
  FloorPatch,
  Plate,
  RuntimeLevel,
  TileKind,
  Vec,
} from "../../../shared/types";
import { DIR_VEC } from "../../../shared/types";
import type { Signal, SignalKind } from "./signal";

/**
 * 盲态世界：与游戏真实规则（push.ts / passable.ts / power.ts）保持同一语义的纯函数实现。
 * 不依赖 Vue、不写 document，方便求解器在大量假设仓位上快速模拟，也能被独立脚本单测。
 */

export interface BlindBox {
  kind: BoxKind;
  x: number;
  y: number;
}

export interface BlindState {
  player: Vec;
  boxes: BlindBox[];
  doors: boolean[]; // 与 skeleton.doors 同序
  floors: boolean[]; // 与 skeleton.floors 同序
  plates: boolean[]; // 与 skeleton.plates 同序
  cleared: boolean;
}

export interface BlindDoor {
  x: number;
  y: number;
}

export interface BlindFloor {
  x: number;
  y: number;
  morph: FloorMorph;
}

export interface BlindPlate {
  x: number;
  y: number;
  accept: BoxKind;
}

export interface PlateLinks {
  doors: number[];
  floors: number[];
}

export interface BlindSkeleton {
  width: number;
  height: number;
  tiles: TileKind[][];
  goals: Vec[];
  plates: BlindPlate[];
  doors: BlindDoor[];
  floors: BlindFloor[];
  plateLinks: PlateLinks[]; // 与 plates 同序，索引指向 doors / floors
}

export interface StepOutcome {
  state: BlindState;
  signal: Signal;
}

function sameAt(a: Vec, x: number, y: number): boolean {
  return a.x === x && a.y === y;
}

export function skeletonFromLevel(level: RuntimeLevel): BlindSkeleton {
  const goals: Vec[] = [];
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      if (level.tiles[y][x] === "goal") goals.push({ x, y });
    }
  }
  return {
    width: level.width,
    height: level.height,
    tiles: level.tiles.map((row) => row.slice()),
    goals,
    plates: level.plates.map((plate: Plate): BlindPlate => ({
      x: plate.x,
      y: plate.y,
      accept: plate.accept,
    })),
    doors: level.doors.map((door: Door): BlindDoor => ({ x: door.x, y: door.y })),
    floors: level.floors.map((floor: FloorPatch): BlindFloor => ({
      x: floor.x,
      y: floor.y,
      morph: floor.morph,
    })),
    plateLinks: level.plates.map((plate): PlateLinks => ({
      doors: plate.doorIds.map((id) => level.doors.findIndex((door) => door.id === id)),
      floors: plate.floorIds.map((id) => level.floors.findIndex((floor) => floor.id === id)),
    })),
  };
}

export function initialState(
  player: Vec,
  boxes: BlindBox[],
  skeleton: BlindSkeleton,
): BlindState {
  const state: BlindState = {
    player: { ...player },
    boxes: boxes.map((box) => ({ ...box })),
    doors: skeleton.doors.map(() => false),
    floors: skeleton.floors.map(() => false),
    plates: skeleton.plates.map(() => false),
    cleared: false,
  };
  evaluateGadgets(state, skeleton);
  state.cleared = isCleared(state, skeleton);
  return state;
}

export function cloneState(state: BlindState): BlindState {
  return {
    player: { ...state.player },
    boxes: state.boxes.map((box) => ({ ...box })),
    doors: state.doors.slice(),
    floors: state.floors.slice(),
    plates: state.plates.slice(),
    cleared: state.cleared,
  };
}

function groundOpen(skeleton: BlindSkeleton, state: BlindState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= skeleton.width || y >= skeleton.height) return false;
  const tile = skeleton.tiles[y][x];
  const floorIndex = skeleton.floors.findIndex((floor) => floor.x === x && floor.y === y);
  if (floorIndex >= 0) {
    const floor = skeleton.floors[floorIndex];
    const active = state.floors[floorIndex];
    if (floor.morph === "seal" && active) return false;
    if (floor.morph === "bridge" && active) return true;
  }
  return tile !== "wall" && tile !== "gap";
}

function boxAt(state: BlindState, x: number, y: number, ignore = -1): number {
  return state.boxes.findIndex((box, index) => {
    if (index === ignore) return false;
    return box.x === x && box.y === y;
  });
}

function passable(
  skeleton: BlindSkeleton,
  state: BlindState,
  x: number,
  y: number,
  ignoreBox = -1,
): boolean {
  if (!groundOpen(skeleton, state, x, y)) return false;
  const doorIndex = skeleton.doors.findIndex((door) => door.x === x && door.y === y);
  if (doorIndex >= 0 && !state.doors[doorIndex]) return false;
  if (boxAt(state, x, y, ignoreBox) >= 0) return false;
  return true;
}

/** 与 power.ts evaluateGadgets 同一语义：重算所有踏板、门、地板的通电状态。 */
export function evaluateGadgets(state: BlindState, skeleton: BlindSkeleton): void {
  const doorPower = new Set<number>();
  const floorPower = new Set<number>();
  skeleton.plates.forEach((plate, plateIndex) => {
    const held = state.boxes.some((box) =>
      sameAt(box, plate.x, plate.y) && box.kind === plate.accept,
    );
    state.plates[plateIndex] = held;
    if (!held) return;
    const links = skeleton.plateLinks[plateIndex];
    for (const doorIndex of links.doors) doorPower.add(doorIndex);
    for (const floorIndex of links.floors) floorPower.add(floorIndex);
  });
  state.doors = state.doors.map((_, index) => doorPower.has(index));
  state.floors = state.floors.map((_, index) => floorPower.has(index));
}

export function isCleared(state: BlindState, skeleton: BlindSkeleton): boolean {
  if (skeleton.goals.length === 0) return false;
  return skeleton.goals.every((goal) => state.boxes.some((box) => sameAt(box, goal.x, goal.y)));
}

function diffSignals(before: BlindState, after: BlindState, skeleton: BlindSkeleton): SignalKind[] {
  const kinds: SignalKind[] = [];
  const opened = skeleton.doors.some((_, index) => !before.doors[index] && after.doors[index]);
  const closed = skeleton.doors.some((_, index) => before.doors[index] && !after.doors[index]);
  if (opened) kinds.push("door-opened");
  if (closed) kinds.push("door-closed");
  skeleton.floors.forEach((floor, index) => {
    if (before.floors[index] === after.floors[index]) return;
    const on = after.floors[index];
    if (floor.morph === "bridge") kinds.push(on ? "bridge-on" : "bridge-off");
    else kinds.push(on ? "seal-on" : "seal-off");
  });
  return kinds;
}

/**
 * 发出一个方向口令。碰壁也由调用方记一次；这里返回新状态与本次门铃信号。
 * 已通关的状态继续发口令只会原地碰壁。
 */
export function step(state: BlindState, dir: Dir, skeleton: BlindSkeleton): StepOutcome {
  if (state.cleared) {
    return { state: cloneState(state), signal: { blocked: true, changed: [] } };
  }
  const next: BlindState = cloneState(state);
  const delta = DIR_VEC[dir];
  const target = { x: state.player.x + delta.x, y: state.player.y + delta.y };
  const boxIndex = boxAt(state, target.x, target.y);
  if (boxIndex >= 0) {
    const box = state.boxes[boxIndex];
    const beyond = { x: box.x + delta.x, y: box.y + delta.y };
    if (!passable(skeleton, state, beyond.x, beyond.y, boxIndex)) {
      return { state: next, signal: { blocked: true, changed: [] } };
    }
    next.boxes[boxIndex] = { ...box, x: beyond.x, y: beyond.y };
    next.player = target;
  } else if (!passable(skeleton, state, target.x, target.y)) {
    return { state: next, signal: { blocked: true, changed: [] } };
  } else {
    next.player = target;
  }
  const gadgetBefore = { doors: state.doors.slice(), floors: state.floors.slice() };
  evaluateGadgets(next, skeleton);
  const changed = diffSignals(
    { ...next, doors: gadgetBefore.doors, floors: gadgetBefore.floors },
    next,
    skeleton,
  );
  next.cleared = isCleared(next, skeleton);
  return { state: next, signal: { blocked: false, changed } };
}
