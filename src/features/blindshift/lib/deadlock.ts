import type { BlindSkeleton, BlindState } from "./engine";

/**
 * 可靠（sound）的静态死锁检测。宁可漏判，不可错杀。
 *
 * 1) 角落死锁：某箱子上下左右中有一对正交方向都被“永久阻挡”（墙/缺口/边界/另一只已冻结箱子），
 *    且该箱不在目标格上——它再也无法被推动。
 *    对单行/单列地图，唯一可走方向上的两端被夹才会形成这种正交阻挡的退化情形，
 *    因此“横廊里上下是墙”不会单独判死（缺少水平方向的阻挡）。
 * 2) 多箱冻结：反复把满足上述正交阻挡的箱子并入冻结集。
 * 3) 若还能压到目标格的箱子数少于目标格数，则确定无法卸完。
 */
export function isStaticDead(state: BlindState, skeleton: BlindSkeleton): boolean {
  const goalSet = new Set(skeleton.goals.map((goal) => `${goal.x},${goal.y}`));

  const boxIndexAt = (x: number, y: number): number =>
    state.boxes.findIndex((box) => box.x === x && box.y === y);

  const permanentBlock = (x: number, y: number, frozen: Set<number>): boolean => {
    if (x < 0 || y < 0 || x >= skeleton.width || y >= skeleton.height) return true;
    const tile = skeleton.tiles[y][x];
    if (tile === "wall" || tile === "gap") return true;
    const index = boxIndexAt(x, y);
    return index >= 0 && frozen.has(index);
  };

  const frozen = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    state.boxes.forEach((box, index) => {
      if (frozen.has(index)) return;
      const blockN = permanentBlock(box.x, box.y - 1, frozen);
      const blockS = permanentBlock(box.x, box.y + 1, frozen);
      const blockW = permanentBlock(box.x - 1, box.y, frozen);
      const blockE = permanentBlock(box.x + 1, box.y, frozen);
      const verticalDead = blockN && blockS; // 垂直轴完全封死（如单行横廊）
      const horizontalDead = blockW && blockE; // 水平轴完全封死（如单列竖廊）
      let cornered = false;
      if (verticalDead || horizontalDead) {
        // 退化维度：只有“另一个轴也封死”才真的动弹不得；
        // 单轴封死时箱子仍可沿另一轴移动，绝不能据此判冻结。
        cornered = verticalDead && horizontalDead;
      } else {
        // 二维正常情形：任一正交夹角两边都被永久阻挡即冻结。
        cornered =
          (blockN && blockW) ||
          (blockN && blockE) ||
          (blockS && blockW) ||
          (blockS && blockE);
      }
      if (cornered) {
        frozen.add(index);
        changed = true;
      }
    });
  }

  let usableOnGoals = state.boxes.length;
  for (const index of frozen) {
    const box = state.boxes[index];
    if (!goalSet.has(`${box.x},${box.y}`)) usableOnGoals -= 1;
  }
  return usableOnGoals < skeleton.goals.length;
}
