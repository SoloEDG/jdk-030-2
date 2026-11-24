import { defineComponent, h, type PropType } from "vue";
import type { useBlindShift } from "../model/useBlindShift";
import type { PlanNode } from "../lib/solver";
import { SIGNAL_TEXT } from "../lib/signal";

function signalText(signal: string): string {
  if (signal === "blocked") return SIGNAL_TEXT.blocked;
  if (signal === "silent") return SIGNAL_TEXT.silent;
  return signal
    .split("|")
    .map((kind) => SIGNAL_TEXT[kind as keyof typeof SIGNAL_TEXT] ?? kind)
    .join(" + ");
}

/** 递归渲染指令树；高亮玩家当前所在节点。 */
export const PlanTree = defineComponent({
  name: "PlanTree",
  props: {
    node: { type: Object as PropType<PlanNode>, required: true },
    blind: { type: Object as PropType<ReturnType<typeof useBlindShift>>, required: true },
  },
  setup(props) {
    const renderNode = (node: PlanNode): ReturnType<typeof h> => {
      const current = props.blind.currentNode.value === node;
      const head = h(
        "div",
        { class: ["tree-head", { current }] },
        node.dir ? `d${node.depth} 口令 ${props.blind.dirName(node.dir)}` : `d${node.depth} 根`,
      );
      const body = node.allCleared
        ? h("span", { class: "tree-leaf done" }, "✓ 全员卸完")
        : h(
            "ul",
            { class: "tree-children" },
            node.branches.map((branch) =>
              h("li", { class: "tree-branch", key: branch.signal }, [
                h("span", { class: "tree-signal" }, `🔔 ${signalText(branch.signal)}`),
                renderNode(branch.node),
              ]),
            ),
          );
      return h("div", { class: "tree-node" }, [head, body]);
    };
    return () => renderNode(props.node);
  },
});
