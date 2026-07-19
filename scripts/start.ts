import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(root, "..");

const children: ChildProcess[] = [];

function shutdown(): void {
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const dataArgs = process.argv.slice(2);
const serverArgs = ["server/index.ts", ...dataArgs];

const server = spawn("npx", ["tsx", ...serverArgs], {
  cwd: workbenchRoot,
  stdio: "inherit",
  shell: true,
});
children.push(server);

const ui = spawn("npx", ["vite"], {
  cwd: workbenchRoot,
  stdio: "inherit",
  shell: true,
});
children.push(ui);

server.on("exit", (code) => {
  if (code && code !== 0) shutdown();
});
ui.on("exit", (code) => {
  if (code && code !== 0) shutdown();
});

console.log("Boise Workbench: API http://127.0.0.1:3847  UI http://127.0.0.1:5174");
