<script setup lang="ts">
import type { useBlindShift } from "../model/useBlindShift";
import { PlanTree } from "./PlanTree";

const props = defineProps<{ blind: ReturnType<typeof useBlindShift> }>();
const blind = props.blind;
</script>

<template>
  <section class="panel blind-tree" aria-label="指令树">
    <h2>指令树</h2>
    <p class="hint">每个节点是一次口令；只有听到对应铃声才能走对应分支。高亮为你当前所在节点。</p>
    <PlanTree v-if="blind.planRoot.value" :node="blind.planRoot.value" :blind="blind" />
    <p v-else class="hint">排树成功后在此展示。</p>
  </section>
</template>
