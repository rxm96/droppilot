// Capture clean README screenshots of the built app in demo mode.
//
// Usage (requires the built renderer served at 127.0.0.1:5173, e.g. via
// `npx vite preview --port 5173 --strictPort`, and an isolated demo userData):
//
//   node scripts/capture-screenshots.cjs \
//     --user-data-dir <abs path to a userData dir with {"demoMode":true}> \
//     --out-dir docs/screenshots
//
// Navigates the primary nav (overview/stats/inventory/control) and writes one
// PNG per view. Theme follows the seeded settings (set "theme" in the userData).

const { _electron: electron } = require("playwright");

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "stats", label: "Stats" },
  { key: "inventory", label: "Inventory" },
  { key: "control", label: "Control" },
];

function parseArgs(argv) {
  const o = { userDataDir: null, outDir: "docs/screenshots", suffix: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--user-data-dir" && argv[i + 1]) o.userDataDir = argv[++i];
    else if (argv[i] === "--out-dir" && argv[i + 1]) o.outDir = argv[++i];
    else if (argv[i] === "--suffix" && argv[i + 1]) o.suffix = argv[++i];
  }
  return o;
}

async function settle(page, ms) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // networkidle is best-effort; demo mode may keep a socket open
  }
  await page.waitForTimeout(ms);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const args = ["."];
  if (opts.userDataDir) args.push(`--user-data-dir=${opts.userDataDir}`);

  const app = await electron.launch({
    executablePath: "node_modules/electron/dist/electron.exe",
    args,
    env,
  });

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      () => {
        const r = document.getElementById("root");
        return Boolean(r && r.childElementCount > 0);
      },
      { timeout: 20000 },
    );
    const nav = page.locator('nav[aria-label="Primary"]').first();
    await nav.waitFor({ state: "visible", timeout: 15000 });
    await settle(page, 1500);

    const results = [];
    for (const v of VIEWS) {
      const tab = nav.locator("button", { hasText: v.label }).first();
      await tab.click();
      await settle(page, 1600);
      const path = `${opts.outDir}/${v.key}${opts.suffix}.png`;
      await page.screenshot({ path });
      results.push({ view: v.key, path });
    }
    console.log(JSON.stringify({ results }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
