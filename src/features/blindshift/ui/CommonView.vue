<script setup lang="ts">
import type { useBlindShift } from "../model/useBlindShift";
import { BOX_LABEL, type BoxKind } from "../../../shared/types";

const props = defineProps<{ blind: ReturnType<typeof useBlindShift> }>();
const blind = props.blind;
</script>

<template>
  <section class="panel blind-common" aria-label="盲运共知视图">
    <h2>共知视图</h2>
    <p class="hint">
      灯熄了。这里只显示<b>全部候选仓位共同可知</b>的信息；彼此不一致的部分一律标“不确定”，
      不会泄露你实际被派到哪个仓位。
    </p>

    <template v-if="blind.commonView.value">
      <div class="cv-row" v-if="blind.phase.value !== 'briefing'">
        <span>候选仓位</span>
        <b>{{ blind.commonView.value.memberCount }} 个仍可能</b>
      </div>
      <div class="cv-row">
        <span>你的位置</span>
        <b v-if="blind.commonView.value.playerKnown">
          ({{ blind.commonView.value.player!.x }},{{ blind.commonView.value.player!.y }})
        </b>
        <b v-else class="unknown">不确定</b>
      </div>
      <div class="cv-row">
        <span>共同确定的箱位</span>
        <b v-if="blind.commonView.value.commonBoxCells.length">
          <span
            v-for="cell in blind.commonView.value.commonBoxCells"
            :key="`${cell.kind}-${cell.x}-${cell.y}`"
            class="cell-chip"
          >
            {{ cell.kind }}({{ cell.x }},{{ cell.y }})
          </span>
        </b>
        <b v-else class="unknown">无共知箱位</b>
      </div>
      <div class="cv-row">
        <span>货种数（共同可知）</span>
        <b>
          <template v-for="item in blind.commonView.value.boxKindCounts" :key="item.kind">
            <span class="cell-chip">
              {{ BOX_LABEL[item.kind as BoxKind] }} ×
              <template v-if="item.known">{{ item.count }}</template>
              <em v-else class="unknown">不确定</em>
            </span>
          </template>
          <span v-if="blind.commonView.value.boxKindCounts.length === 0" class="unknown">无箱</span>
        </b>
      </div>
      <div class="cv-row">
        <span>目标进度（共知下限）</span>
        <b>{{ blind.commonView.value.commonFilledGoals }} / {{ blind.commonView.value.goalTotal }}</b>
      </div>

      <h3>踏板灯</h3>
      <ul class="cv-devices">
        <li v-for="(plate, i) in blind.commonView.value.plateStates" :key="`p${i}`">
          <span class="dot" :data-on="plate.known && plate.powered" />
          {{ plate.accept }}板 ({{ plate.x }},{{ plate.y }})
          <em v-if="!plate.known" class="unknown">状态不确定</em>
          <em v-else>{{ plate.powered ? "有电" : "断开" }}</em>
        </li>
        <li v-if="blind.commonView.value.plateStates.length === 0" class="hint">本关无踏板。</li>
      </ul>

      <h3>门与地板</h3>
      <ul class="cv-devices">
        <li v-for="(door, i) in blind.commonView.value.doorStates" :key="`d${i}`">
          <span class="dot" :data-on="door.known && door.open" />
          门 ({{ door.x }},{{ door.y }})
          <em v-if="!door.known" class="unknown">状态不确定</em>
          <em v-else>{{ door.open ? "开启" : "关闭" }}</em>
        </li>
        <li v-for="(floor, i) in blind.commonView.value.floorStates" :key="`f${i}`">
          <span class="dot" :data-on="floor.known && floor.active" />
          {{ floor.morph === "bridge" ? "架桥" : "封道" }} ({{ floor.x }},{{ floor.y }})
          <em v-if="!floor.known" class="unknown">状态不确定</em>
          <em v-else>{{ floor.active ? "已变形" : "待机" }}</em>
        </li>
        <li
          v-if="blind.commonView.value.doorStates.length === 0 && blind.commonView.value.floorStates.length === 0"
          class="hint"
        >
          本关无门与变形地板。
        </li>
      </ul>
    </template>
    <p v-else class="hint">进入盲运后这里才会显示共知信息。</p>
  </section>
</template>
