const { spawn } = require("node:child_process");

const VALID_STATES = new Set(["downloading", "ready", "installing"]);
const requestedState = (process.argv[2] ?? "downloading").trim().toLowerCase();

if (!VALID_STATES.has(requestedState)) {
  console.error(
    `Invalid UpdateOverlay state "${requestedState}". Use one of: ${Array.from(VALID_STATES).join(", ")}.`,
  );
  process.exit(1);
}

const child = spawn("npm run dev", {
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    DROPPILOT_RENDERER_QUERY: `updateOverlayState=${requestedState}`,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
