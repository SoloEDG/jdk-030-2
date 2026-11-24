<script setup lang="ts">
import type { useBlindShift } from "../model/useBlindShift";
import { LEVELS } from "../../voyage";

const props = defineProps<{ blind: ReturnType<typeof useBlindShift> }>();
const blind = props.blind;

function titleOf(id: string): string {
  return LEVELS.find((level) => level.id === id)?.title ?? id;
}
function when(stamp: number): string {
  return new Date(stamp).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <section class="panel blind-records" aria-label="熄灯班保送成绩">
    <h2>熄灯班保送成绩</h2>
    <p class="hint">只记最少最坏口令数（撞墙口令计入），与普通班“走成步数”分列。</p>
    <p v-if="Object.keys(blind.blindRecords.value).length === 0" class="lede">
      还没有保送记录。盲运卸完一关后写入。
    </p>
    <ol v-else class="record-list">
      <li v-for="(record, id) in blind.blindRecords.value" :key="id">
        <b>{{ titleOf(id) }}</b>
        <span class="worst">{{ record.worstCommands }} 次口令</span>
        <small>{{ when(record.solvedAt) }}</small>
      </li>
    </ol>

    <h3>本次盲运流水</h3>
    <p v-if="blind.runHistory.value.length === 0" class="hint">暂无。</p>
    <ul v-else class="run-history">
      <li v-for="(run, i) in blind.runHistory.value" :key="i">
        <b>{{ run.levelTitle }}</b>
        <span>{{ run.candidateLabel }}</span>
        <em :data-cleared="run.cleared && !run.deviated">
          <template v-if="!run.cleared">未卸完</template>
          <template v-else-if="run.deviated">卸完但偏离，不计保送 · {{ run.commands }} 口令</template>
          <template v-else>卸完 · {{ run.commands }} 口令</template>
        </em>
      </li>
    </ul>
  </section>
</template>
