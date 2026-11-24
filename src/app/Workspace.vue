<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { StageView, TileLegend } from "@/features/atlas";
import { GadgetPanel } from "@/features/gadget";
import { MoverHud } from "@/features/hauler";
import { StepMeter } from "@/features/ledger";
import { LevelRail, RecordBoard } from "@/features/voyage";
import {
  BlindConsole,
  BlindPlanner,
  BlindRecordBoard,
  BlindTree,
  CommonView,
  useBlindShift,
} from "@/features/blindshift";
import { dirFromKey, shouldCapture } from "./keys";
import { useWorkshop } from "./useWorkshop";
import type { Dir } from "@/shared/types";

const shop = useWorkshop();
const blind = useBlindShift();
const mode = ref<"normal" | "blind">("normal");
const { document, notice } = shop;
const { title, blurb } = shop.atlas;
const { counts } = shop.hauler;
const { summary } = shop.gadget;
const { steps, status, coverage } = shop.ledger;
const { catalog, completed } = shop.voyage;

function syncBlindLevel(): void {
  blind.openLevel(document.value.currentLevelId);
}

function selectLevel(id: string): void {
  shop.selectLevel(id);
  blind.openLevel(id);
}

function resetLevel(): void {
  shop.reset();
  blind.resetBriefing();
}

function switchMode(next: "normal" | "blind"): void {
  mode.value = next;
  if (next === "blind") syncBlindLevel();
}

function onKey(event: KeyboardEvent): void {
  if (!shouldCapture(event)) return;
  const action = dirFromKey(event);
  if (!action) return;
  event.preventDefault();
  if (action === "reset") {
    resetLevel();
    return;
  }
  if (mode.value === "blind") {
    if (blind.phase.value === "running") blind.issueCommand(action as Dir);
    return;
  }
  shop.move(action);
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="workshop" :data-mode="mode">
    <header class="mast">
      <div class="brand">
        <span class="mark" aria-hidden="true">闩</span>
        <div>
          <h1>栈闩工房</h1>
          <p>箱认踏板，板动门廊。一步一格，记下你走的路。</p>
        </div>
      </div>
      <div class="mode-switch" role="group" aria-label="班次切换">
        <button
          type="button"
          :class="{ active: mode === 'normal' }"
          @click="switchMode('normal')"
        >
          普通班
        </button>
        <button
          type="button"
          :class="{ active: mode === 'blind' }"
          @click="switchMode('blind')"
        >
          熄灯班
        </button>
      </div>
      <p class="notice" :data-tone="notice.tone">{{ notice.message }}</p>
    </header>

    <!-- 普通班：原有布局 -->
    <div v-if="mode === 'normal'" class="bench">
      <aside class="rail">
        <LevelRail :catalog="catalog" @select="selectLevel" @reset="resetLevel" />
        <RecordBoard :completed="completed" />
      </aside>
      <main class="stage">
        <div class="stage-head">
          <h2>{{ title }}</h2>
          <p>{{ blurb }}</p>
        </div>
        <StageView :document="document" />
        <MoverHud :counts="counts" />
      </main>
      <aside class="side">
        <StepMeter :steps="steps" :status="status" :coverage="coverage" />
        <GadgetPanel :document="document" :summary="summary" />
        <TileLegend />
      </aside>
    </div>

    <!-- 熄灯班：盲运布局 -->
    <div v-else class="bench blind-bench">
      <aside class="rail">
        <LevelRail :catalog="catalog" @select="selectLevel" @reset="resetLevel" />
        <BlindRecordBoard :blind="blind" />
      </aside>
      <main class="stage">
        <div class="stage-head">
          <h2>熄灯班 · {{ title }}</h2>
          <p>{{ blurb }}</p>
        </div>
        <BlindPlanner :blind="blind" />
        <BlindTree :blind="blind" />
      </main>
      <aside class="side">
        <BlindConsole :blind="blind" />
        <CommonView :blind="blind" />
      </aside>
    </div>
  </div>
</template>
