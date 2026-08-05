// Generates the DropPilot icon assets from SVG — dependency-free, via the
// Electron binary already in the project (no extra npm dep, no network).
//
// Optical sizing: small sizes use the high-contrast violet tile
// (icon-small.svg) so the taskbar/tray icon stays crisp and readable on the
// dark Windows chrome; large sizes use the dark tile (icon.svg) that looks best
// as a desktop/installer icon. electron-builder cannot do this from a single
// PNG (it only downscales), which is why the .ico files are built here.
//
//   icons/icon.png  1024  dark tile          -> build.icon (macOS/default)
//   icons/icon.ico  16-256 optical (mixed)   -> build.win.icon + BrowserWindow
//   icons/tray.ico  16/24/32 violet          -> system tray
//
// Both SVGs are rasterized in ONE offscreen window + ONE load (a second
// offscreen window/data-load fails with ERR_FAILED), then cropped apart and
// resized down with a high-quality filter for each target size.
//
// Run: npm run build:icon   (after editing icon.svg / icon-small.svg)
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "icons");
const tileSvg = readFileSync(join(iconsDir, "icon.svg"), "utf8");
const smallSvg = readFileSync(join(iconsDir, "icon-small.svg"), "utf8");

const TILE = 1024;
const SMALL = 512;
const W = TILE + SMALL;
const H = TILE;

// Force devicePixelRatio 1 so the offscreen window paints exactly W×H pixels.
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pngAt(baseImage, size) {
  const img =
    baseImage.getSize().width === size
      ? baseImage
      : baseImage.resize({ width: size, height: size, quality: "best" });
  const png = img.toPNG();
  if (!png || png.length === 0) throw new Error("empty PNG at size " + size);
  return png;
}

// Pack PNG-compressed entries into a Windows .ico (Vista+/Win10/11 support PNG
// payloads at every size). Sizes < 64 use the violet small art, >= 64 the tile.
function buildIco(base, sizes) {
  const entries = sizes
    .map((size) => ({ size, png: pngAt(size < 64 ? base.small : base.tile, size) }))
    .sort((a, b) => a.size - b.size);
  const count = entries.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  let offset = 6 + count * 16;
  const blobs = [];
  entries.forEach((e, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(e.size >= 256 ? 0 : e.size, at + 0); // width (0 = 256)
    header.writeUInt8(e.size >= 256 ? 0 : e.size, at + 1); // height
    header.writeUInt8(0, at + 2); // palette count
    header.writeUInt8(0, at + 3); // reserved
    header.writeUInt16LE(1, at + 4); // color planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(e.png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += e.png.length;
    blobs.push(e.png);
  });
  return Buffer.concat([header, ...blobs]);
}

app.whenReady().then(async () => {
  try {
    const html =
      "<!doctype html><meta charset='utf-8'>" +
      "<style>html,body{margin:0;padding:0;background:transparent}" +
      "div{position:absolute}svg{display:block;width:100%;height:100%}</style>" +
      `<div style="left:0;top:0;width:${TILE}px;height:${TILE}px">${tileSvg}</div>` +
      `<div style="left:${TILE}px;top:0;width:${SMALL}px;height:${SMALL}px">${smallSvg}</div>`;

    const win = new BrowserWindow({
      width: W,
      height: H,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      useContentSize: true,
      webPreferences: { offscreen: true },
    });
    let captured = null;
    win.webContents.on("paint", (_e, _d, image) => {
      if (image && !image.isEmpty()) captured = image;
    });
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    await wait(500);
    const frame = captured || (await win.webContents.capturePage());
    if (frame.isEmpty()) throw new Error("offscreen produced an empty frame");

    const base = {
      tile: frame.crop({ x: 0, y: 0, width: TILE, height: TILE }),
      small: frame.crop({ x: TILE, y: 0, width: SMALL, height: SMALL }),
    };
    win.destroy();

    writeFileSync(join(iconsDir, "icon.png"), pngAt(base.tile, 1024));
    writeFileSync(join(iconsDir, "icon.ico"), buildIco(base, [16, 24, 32, 48, 64, 128, 256]));
    writeFileSync(join(iconsDir, "tray.ico"), buildIco(base, [16, 24, 32]));

    console.log("[build-icon] wrote icon.png (1024), icon.ico (16-256), tray.ico (16-32)");
    app.quit();
    process.exit(0);
  } catch (e) {
    console.error("[build-icon] " + (e && e.stack ? e.stack : e));
    process.exit(1);
  }
});
