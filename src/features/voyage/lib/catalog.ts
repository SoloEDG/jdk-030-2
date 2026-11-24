import { createId } from "@/shared/document";
import type {
  BoxKind,
  FloorMorph,
  RuntimeLevel,
  TileKind,
} from "@/shared/types";

export interface BlindStart {
  id: string;
  label: string;
  player: { x: number; y: number };
  /** 缺省沿用关卡默认箱面；给出时整组替换，用于不同箱面的派工。 */
  boxes?: { kind: BoxKind; x: number; y: number }[];
}

export interface LevelBlueprint {
  id: string;
  title: string;
  blurb: string;
  rows: string[];
  player: { x: number; y: number };
  boxes: { kind: BoxKind; x: number; y: number }[];
  plates: {
    accept: BoxKind;
    x: number;
    y: number;
    doorIds: string[];
    floorIds: string[];
  }[];
  doors: { id: string; x: number; y: number }[];
  floors: { id: string; x: number; y: number; morph: FloorMorph }[];
  /** 熄灯班入场时工房公示的几种可能起始仓位；实际派工不揭晓。 */
  blindStarts?: BlindStart[];
}

function tilesOf(rows: string[]): TileKind[][] {
  return rows.map((row) =>
    [...row].map((ch) => {
      if (ch === "#") return "wall";
      if (ch === "*") return "goal";
      if (ch === "~") return "gap";
      return "floor";
    }),
  );
}

export const LEVELS: LevelBlueprint[] = [
  {
    id: "latch-01",
    title: "门闩入门",
    blurb: "木箱压上木踏板才会开门。多出来的箱子用来压住开关。",
    rows: [
      "#########",
      "#.......#",
      "#.......#",
      "#.......#",
      "#.......#",
      "###...###",
      "#......*#",
      "#......*#",
      "#########",
    ],
    player: { x: 1, y: 2 },
    boxes: [
      { kind: "timber", x: 3, y: 3 },
      { kind: "timber", x: 4, y: 3 },
      { kind: "timber", x: 3, y: 7 },
    ],
    plates: [{ accept: "timber", x: 3, y: 4, doorIds: ["d1"], floorIds: [] }],
    doors: [{ id: "d1", x: 4, y: 5 }],
    floors: [],
  },
  {
    id: "latch-02",
    title: "认材",
    blurb: "铁踏板只认铁箱。木箱压上去门不会动。",
    rows: [
      "##########",
      "#........#",
      "#........#",
      "#........#",
      "#........#",
      "####...###",
      "#.......*#",
      "#.......*#",
      "##########",
    ],
    player: { x: 1, y: 2 },
    boxes: [
      { kind: "timber", x: 5, y: 4 },
      { kind: "iron", x: 6, y: 3 },
      { kind: "timber", x: 3, y: 7 },
    ],
    plates: [{ accept: "iron", x: 6, y: 4, doorIds: ["d1"], floorIds: [] }],
    doors: [{ id: "d1", x: 5, y: 5 }],
    floors: [],
  },
  {
    id: "latch-03",
    title: "架桥",
    blurb: "木踏板升起缺口上的桥板。铁箱过桥后，木箱去压本侧目标。",
    rows: [
      "###########",
      "#........*#",
      "#.........#",
      "#.........#",
      "#~~~~~~~~~#",
      "#.........#",
      "#........*#",
      "#.........#",
      "###########",
    ],
    player: { x: 1, y: 2 },
    boxes: [
      { kind: "timber", x: 3, y: 2 },
      { kind: "iron", x: 4, y: 3 },
    ],
    plates: [{ accept: "timber", x: 3, y: 3, doorIds: [], floorIds: ["b1", "b2", "b3"] }],
    doors: [],
    floors: [
      { id: "b1", x: 3, y: 4, morph: "bridge" },
      { id: "b2", x: 4, y: 4, morph: "bridge" },
      { id: "b3", x: 5, y: 4, morph: "bridge" },
    ],
  },
  {
    id: "latch-04",
    title: "封廊",
    blurb: "先把一只木箱送进左侧目标，再压踏板。踏板会封住那条廊并打开右侧的门。",
    rows: [
      "##########",
      "#........#",
      "#........#",
      "#........#",
      "#........#",
      "##.##..###",
      "#*......*#",
      "#........#",
      "##########",
    ],
    player: { x: 1, y: 2 },
    boxes: [
      { kind: "timber", x: 2, y: 6 },
      { kind: "timber", x: 4, y: 2 },
      { kind: "timber", x: 6, y: 4 },
    ],
    plates: [{ accept: "timber", x: 4, y: 3, doorIds: ["d1"], floorIds: ["s1"] }],
    doors: [{ id: "d1", x: 5, y: 5 }],
    floors: [{ id: "s1", x: 2, y: 5, morph: "seal" }],
  },
  {
    id: "latch-05",
    title: "双色闸",
    blurb: "玻璃踏板与木踏板各管一扇门。两只箱子都要过闸到达目标。",
    rows: [
      "###########",
      "#.........#",
      "#.........#",
      "#.........#",
      "##...#...##",
      "#.........#",
      "#*.......*#",
      "#.........#",
      "###########",
    ],
    player: { x: 1, y: 2 },
    boxes: [
      { kind: "timber", x: 2, y: 2 },
      { kind: "glass", x: 8, y: 2 },
      { kind: "timber", x: 3, y: 3 },
      { kind: "glass", x: 7, y: 3 },
    ],
    plates: [
      { accept: "timber", x: 2, y: 3, doorIds: ["west"], floorIds: [] },
      { accept: "glass", x: 8, y: 3, doorIds: ["east"], floorIds: [] },
    ],
    doors: [
      { id: "west", x: 3, y: 4 },
      { id: "east", x: 7, y: 4 },
    ],
    floors: [],
  },
  {
    id: "blind-01",
    title: "听壁回廊",
    blurb: "熄灯班：两个派工仓位在同一条横廊，箱子远近不同。撞墙铃也会暴露位置，听铃决定还要推几下。",
    rows: [
      "#########",
      "#......*#",
      "#########",
    ],
    player: { x: 1, y: 1 },
    boxes: [{ kind: "timber", x: 2, y: 1 }],
    plates: [],
    doors: [],
    floors: [],
    blindStarts: [
      {
        id: "b1-near",
        label: "近端仓位：人(1,1) 箱(2,1)",
        player: { x: 1, y: 1 },
        boxes: [{ kind: "timber", x: 2, y: 1 }],
      },
      {
        id: "b1-far",
        label: "远端仓位：人(4,1) 箱(5,1)",
        player: { x: 4, y: 1 },
        boxes: [{ kind: "timber", x: 5, y: 1 }],
      },
    ],
  },
  {
    id: "blind-02",
    title: "铃辨闸口",
    blurb: "熄灯班：先听撞墙铃判断自己在北廊哪头，绕到箱子北侧后连推三下；开门铃、关门铃会逐次响起。",
    rows: [
      "#########",
      "#.......#",
      "####.####",
      "####.####",
      "####.####",
      "####*####",
      "#########",
    ],
    player: { x: 4, y: 1 },
    boxes: [{ kind: "timber", x: 4, y: 2 }],
    plates: [{ accept: "timber", x: 4, y: 3, doorIds: ["d1"], floorIds: [] }],
    doors: [{ id: "d1", x: 4, y: 4 }],
    floors: [],
    blindStarts: [
      {
        id: "b2-west",
        label: "北廊西头：人(1,1) 箱(4,2)",
        player: { x: 1, y: 1 },
      },
      {
        id: "b2-east",
        label: "北廊东头：人(7,1) 箱(4,2)",
        player: { x: 7, y: 1 },
      },
    ],
  },
  {
    id: "blind-03",
    title: "镜像双仓",
    blurb: "熄灯班反例：两个派工仓位东西镜像，两只箱子要分别归到左右目标。任何口令在两边都响同样的铃，却需要朝相反方向推。可证明无法保证。",
    rows: [
      "#########",
      "#*..#..*#",
      "#########",
    ],
    player: { x: 2, y: 1 },
    boxes: [
      { kind: "timber", x: 3, y: 1 },
      { kind: "timber", x: 5, y: 1 },
    ],
    plates: [],
    doors: [],
    floors: [],
    blindStarts: [
      {
        id: "b3-left",
        label: "左仓：人(2,1)，两箱在(3,1)(5,1)",
        player: { x: 2, y: 1 },
      },
      {
        id: "b3-right",
        label: "右仓：人(6,1)，两箱在(3,1)(5,1)",
        player: { x: 6, y: 1 },
      },
    ],
  },
];

export function getLevel(id: string): LevelBlueprint {
  const found = LEVELS.find((level) => level.id === id);
  if (!found) throw new Error(`未知关卡 ${id}`);
  return found;
}

export function hydrate(blueprint: LevelBlueprint): RuntimeLevel {
  return {
    id: blueprint.id,
    title: blueprint.title,
    blurb: blueprint.blurb,
    width: blueprint.rows[0].length,
    height: blueprint.rows.length,
    tiles: tilesOf(blueprint.rows),
    player: { ...blueprint.player },
    boxes: blueprint.boxes.map((box) => ({ ...box, id: createId(box.kind) })),
    plates: blueprint.plates.map((plate, index) => ({
      ...plate,
      id: `p-${blueprint.id}-${index}`,
      powered: false,
    })),
    doors: blueprint.doors.map((door) => ({ ...door, open: false })),
    floors: blueprint.floors.map((floor) => ({ ...floor, active: false })),
  };
}
