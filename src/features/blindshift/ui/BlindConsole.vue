<script setup lang="ts">
import type { useBlindShift } from "../model/useBlindShift";
import type { Dir } from "../../../shared/types";

const props = defineProps<{ blind: ReturnType<typeof useBlindShift> }>();
const blind = props.blind;

const dirs: Dir[] = ["n", "e", "s", "w"];
</script>

<template>
  <section class="panel blind-console" aria-label="盲运执行台">
    <h2>盲运执行台</h2>

    <div v-if="blind.phase.value === 'briefing'" class="briefing">
      <p class="hint">先在左侧排好指令树，再亲自抽一个仓位。抽中后不揭晓位置，你只能听铃辨位。</p>
      <button
        type="button"
        class="primary"
        :disabled="blind.solveResult.value?.status !== 'guaranteed'"
        @click="blind.drawCandidate()"
      >
        抽签派工（不揭晓位置）
      </button>
      <p v-if="blind.solveResult.value?.status !== 'guaranteed'" class="hint">
        只有“可以保送”的关卡才能进入盲运执行。
      </p>
    </div>

    <div v-else class="running">
      <div class="command-meter">
        <span class="meter-label">已发口令</span>
        <span class="meter-value">{{ blind.commands.value }}</span>
        <span class="meter-cap" v-if="blind.solveResult.value?.worstCommands != null">
          / 最坏 {{ blind.solveResult.value.worstCommands }}
        </span>
      </div>

      <p class="prescribed">
        指令树当前口令：
        <b v-if="blind.prescribedCommand.value && !blind.deviated.value">{{ blind.dirName(blind.prescribedCommand.value) }}</b>
        <b v-else-if="blind.deviated" class="unknown">已脱离指令树</b>
        <b v-else>已到叶节点</b>
      </p>

      <div v-if="blind.warning.value" class="deviate-banner" role="alert">
        ⚠ {{ blind.warning.value }}
      </div>

      <div class="dpad" role="group" aria-label="方向口令">
        <button
          v-for="dir in dirs"
          :key="dir"
          type="button"
          class="dir-btn"
          :class="{ prescribed: blind.prescribedCommand.value === dir }"
          :disabled="blind.phase.value === 'cleared'"
          @click="blind.issueCommand(dir)"
        >
          {{ blind.dirName(dir) }}
        </button>
      </div>

      <div v-if="blind.lastSignal.value" class="last-signal" :data-blocked="blind.lastSignal.value.blocked">
        <span class="bell">🔔</span>
        {{ blind.signalText(blind.lastSignal.value) }}
      </div>

      <ul v-if="blind.log.value.length" class="bell-log">
        <li v-for="entry in [...blind.log.value].reverse().slice(0, 8)" :key="entry.index">
          <span class="log-index">#{{ entry.index }}</span>
          <span class="log-dir">{{ blind.dirName(entry.dir) }}</span>
          <span class="log-signal" :data-blocked="entry.blocked">{{ entry.signalText }}</span>
        </li>
      </ul>

      <div v-if="blind.phase.value === 'cleared'" class="cleared-banner" :data-deviated="blind.deviated.value">
        <template v-if="blind.deviated.value">
          ⚠ 已卸完但中途偏离指令树，本次不计保送；本次口令 {{ blind.commands.value }} 次。
        </template>
        <template v-else>
          ✅ 已卸完，本次口令 {{ blind.commands.value }} 次（撞墙也计入）。保送成绩已写入目录。
        </template>
      </div>

      <button type="button" class="ghost" @click="blind.resetBriefing()">退出盲运 / 重新排树</button>
    </div>
  </section>
</template>
