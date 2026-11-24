<script setup lang="ts">
import type { useBlindShift } from "../model/useBlindShift";
import { SIGNAL_TEXT } from "../lib/signal";

const props = defineProps<{ blind: ReturnType<typeof useBlindShift> }>();
const blind = props.blind;
</script>

<template>
  <section class="panel blind-plan" aria-label="班前排树">
    <h2>班前排树</h2>
    <p class="lede">
      入场只公示 {{ blind.candidates.value.length }} 个可能仓位，实际派工不揭晓。先在班前排好一棵指令树，
      求出能让<b>每一种派工</b>都卸完的最少最坏口令数（撞墙口令也计入）。
    </p>
    <ul v-if="blind.hasBlindStarts.value" class="candidates">
      <li v-for="candidate in blind.candidates.value" :key="candidate.id">
        <span class="chip-cand">{{ candidate.label }}</span>
      </li>
    </ul>
    <p v-else class="hint">本关没有熄灯班候选仓位。</p>

    <div class="plan-actions">
      <button
        type="button"
        class="primary"
        :disabled="blind.solving.value || !blind.hasBlindStarts.value"
        @click="blind.planShift()"
      >
        {{ blind.solving.value ? "排树中…" : "排指令树 / 求最坏口令数" }}
      </button>
    </div>

    <div v-if="blind.solveResult.value" class="verdict" :data-status="blind.solveResult.value.status">
      <template v-if="blind.solveResult.value.status === 'guaranteed'">
        <p class="verdict-line">
          <b>可以保送</b>：最坏情形只需
          <em>{{ blind.solveResult.value.worstCommands }}</em> 次口令。
        </p>
        <p class="hint">{{ blind.solveResult.value.note }}</p>
      </template>
      <template v-else-if="blind.solveResult.value.status === 'impossible'">
        <p class="verdict-line"><b>无法保证</b>：不存在能覆盖全部派工的指令树。</p>
        <p class="hint">{{ blind.solveResult.value.note }}</p>
      </template>
      <template v-else>
        <p class="verdict-line"><b>尚未算完</b>：当前预算内给不出保证，也不能断言无解。</p>
        <p class="hint">{{ blind.solveResult.value.note }}</p>
      </template>
    </div>

    <div
      v-if="blind.confusion.value"
      class="confusion"
      aria-label="仍混淆的仓况诊断"
    >
      <h3>在哪一步失去保证</h3>
      <p class="hint">
        以下 {{ blind.confusion.value.memberCount }} 个仓位听感仍一致，耳机无法把它们分开：
      </p>
      <ul class="confuse-members">
        <li v-for="(member, i) in blind.confusion.value.members" :key="i">{{ member }}</li>
      </ul>
      <p v-if="blind.confusion.value.deadMembers.length" class="hint">
        其中 {{ blind.confusion.value.deadMembers.length }} 个已进入可靠静态死局。
      </p>
      <h4>各口令的铃声分桶</h4>
      <ul class="partitions">
        <li v-for="partition in blind.confusion.value.partitions" :key="partition.dir">
          <b>{{ blind.dirName(partition.dir) }}</b>
          <span class="buckets">
            <template v-for="bucket in partition.buckets" :key="bucket.signal">
              <span class="bucket" :data-dead="bucket.dead > 0">
                {{ SIGNAL_TEXT[bucket.signal.split("|")[0] as keyof typeof SIGNAL_TEXT] ?? bucket.signal }}
                ×{{ bucket.count }}<template v-if="bucket.dead">（死{{ bucket.dead }}）</template>
              </span>
            </template>
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>
