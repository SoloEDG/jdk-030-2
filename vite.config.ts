import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 工程目录可能含非 ASCII 字符；new URL().pathname 会把中文百分号编码，
// Vite/Rollup 据此读取文件会 ENOENT。这里解码回真实路径，且不依赖 node 类型。
const srcPath = decodeURIComponent(new URL("./src", import.meta.url).pathname);

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { "@": srcPath } },
});
