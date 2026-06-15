// Renders icons/icon.svg -> icons/icon.png (1024x1024, RGBA) using the Electron
// binary that already ships with this project — no extra native dependency and
// no network access. electron-builder generates the installer .ico from this
// PNG, and the tray reuses it (see src/main/index.ts resolveTrayIcon).
//
// Run: npm run build:icon   (after editing icons/icon.svg)
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 1024;
const svgPath = join(root, "icons", "icon.svg");
const outPath = join(root, "icons", "icon.png");

function fail(msg) {
  console.error("[build-icon] " + msg);
  process.exit(1);
}

app.disableHardwareAcceleration();
const giveUp = setTimeout(() => fail("timed out waiting for a rendered frame"), 20000);

app.whenReady().then(async () => {
  const svg = readFileSync(svgPath, "utf8");
  const html =
    "<!doctype html><meta charset='utf-8'>" +
    "<style>html,body{margin:0;padding:0;background:transparent}" +
    "svg{display:block;width:" + SIZE + "px;height:" + SIZE + "px}</style>" +
    svg;

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    useContentSize: true,
    webPreferences: { offscreen: true },
  });

  let captured = null;
  win.webContents.on("paint", (_e, _dirty, image) => {
    if (image && !image.isEmpty()) captured = image;
  });

  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 800)); // let the compositor settle

  let image = captured;
  if (!image || image.isEmpty()) {
    try {
      image = await win.webContents.capturePage();
    } catch (e) {
      return fail("offscreen paint empty and capturePage failed: " + e.message);
    }
  }
  if (!image || image.isEmpty()) return fail("renderer produced an empty image");

  const size = image.getSize();
  if (size.width !== SIZE || size.height !== SIZE) {
    image = image.resize({ width: SIZE, height: SIZE, quality: "best" });
  }

  writeFileSync(outPath, image.toPNG());
  clearTimeout(giveUp);
  console.log("[build-icon] wrote " + outPath + " (" + SIZE + "x" + SIZE + ")");
  win.destroy();
  app.quit();
  process.exit(0);
});
