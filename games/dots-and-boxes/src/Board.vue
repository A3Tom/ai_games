<script setup lang="ts">
import { computed } from "vue";
import { getBoard } from "./game";
import type { Match } from "./game";

const props = defineProps<{
  match: Match;
  playable: boolean;
  preview: boolean;
}>();
const emit = defineEmits<{ play: [edge: number] }>();
const board = computed(() => getBoard(props.match));
const edges = computed(() =>
  board.value.edges.map((owner, id) => {
    const size = props.match.size;
    const offset = size * (size + 1);
    const horizontal = id < offset;
    const index = horizontal ? id : id - offset;
    const row = Math.floor(index / (horizontal ? size : size + 1));
    const col = index % (horizontal ? size : size + 1);
    return {
      id,
      owner,
      horizontal,
      label: `${horizontal ? "Horizontal" : "Vertical"} edge, row ${row + 1}, column ${col + 1}${owner >= 0 ? `, drawn by ${props.match.players[owner]?.name}` : ""}`,
      style: {
        left: `${((col + (horizontal ? 0.5 : 0)) / size) * 100}%`,
        top: `${((row + (horizontal ? 0 : 0.5)) / size) * 100}%`,
      },
    };
  }),
);
const dots = computed(() =>
  Array.from({ length: (props.match.size + 1) ** 2 }, (_, index) => ({
    left: `${((index % (props.match.size + 1)) / props.match.size) * 100}%`,
    top: `${(Math.floor(index / (props.match.size + 1)) / props.match.size) * 100}%`,
  })),
);
const boxes = computed(() =>
  board.value.boxes.map((owner, index) => ({
    owner,
    style: {
      left: `${((index % props.match.size) / props.match.size) * 100}%`,
      top: `${(Math.floor(index / props.match.size) / props.match.size) * 100}%`,
      width: `${100 / props.match.size}%`,
      height: `${100 / props.match.size}%`,
    },
  })),
);
</script>

<template>
  <div class="board-wrap" :class="{ 'board-preview': preview }">
    <div
      class="board"
      :style="{ '--size': match.size }"
      role="group"
      :aria-label="`Dots and Boxes board, ${match.size} by ${match.size} boxes`"
    >
      <div
        v-for="(box, index) in boxes"
        :key="`box-${index}`"
        class="box"
        :class="`player-${box.owner}`"
        :style="box.style"
        aria-hidden="true"
      >
        <span v-if="box.owner >= 0" class="box-fill"
          ><span>{{ box.owner + 1 }}</span></span
        >
      </div>
      <button
        v-for="edge in edges"
        :key="edge.id"
        type="button"
        class="edge"
        :class="[
          edge.horizontal ? 'horizontal' : 'vertical',
          `player-${edge.owner}`,
          { drawn: edge.owner >= 0, latest: board.lastEdge === edge.id },
        ]"
        :style="edge.style"
        :disabled="!playable || edge.owner >= 0"
        :aria-label="edge.label"
        :data-edge="edge.id"
        @click="emit('play', edge.id)"
      >
        <span></span>
      </button>
      <span
        v-for="(dot, index) in dots"
        :key="`dot-${index}`"
        class="dot"
        :style="dot"
        aria-hidden="true"
      ></span>
    </div>
  </div>
</template>
