const { _electron: electron } = require("playwright");

const VIEW_INDEX = {
  overview: 0,
  inventory: 1,
  control: 2,
  priorities: 3,
  debug: 4,
  settings: 5,
};

const VIEW_READY_SELECTOR = {
  overview: ".overview-grid, .overview-spotlight",
  inventory: ".inventory-panel, .inventory-list, .campaign-list",
  control: ".control-layout",
  priorities: ".priority-split, .priority-shell",
  debug: ".debug-shell, .debug-panel",
  settings: ".settings-sections, .settings-column",
};

const LOADING_PATTERNS = [
  /Inventory loading/i,
  /Inventory wird geladen/i,
  /Loading campaigns/i,
  /Kampagnen werden geladen/i,
  /Loading stats/i,
  /Lade Stats/i,
  /Refreshing\.\.\./i,
  /Aktualisiere\.\.\./i,
  /Updating streams\.\.\./i,
  /Aktualisiere Streams\.\.\./i,
  /Loading debug view/i,
  /Debug-Ansicht wird geladen/i,
];

function parseArgs(argv) {
  const options = {
    view: "control",
    refresh: false,
    prefix: "tmp-electron-inspect",
    timeoutMs: 20000,
  };

  for (let idx = 0; idx < argv.length; idx += 1) {
    const value = argv[idx];
    if (value === "--view" && argv[idx + 1]) {
      options.view = argv[idx + 1].toLowerCase();
      idx += 1;
      continue;
    }
    if (value === "--prefix" && argv[idx + 1]) {
      options.prefix = argv[idx + 1];
      idx += 1;
      continue;
    }
    if (value === "--timeout-ms" && argv[idx + 1]) {
      options.timeoutMs = Number(argv[idx + 1]) || options.timeoutMs;
      idx += 1;
      continue;
    }
    if (value === "--refresh") {
      options.refresh = true;
    }
  }

  return options;
}

async function waitForAppShell(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator(".layout").first().waitFor({ state: "visible", timeout: 15000 });
  const nav = page.locator(".top-nav-tab, .app-sidebar-tab").first();
  if ((await nav.count()) > 0) {
    await nav.waitFor({ state: "visible", timeout: 5000 });
  }
}

async function openView(page, view) {
  const tabs = page.locator(".top-nav-tab, .app-sidebar-tab");
  if ((await tabs.count()) === 0) return;
  const index = VIEW_INDEX[view] ?? VIEW_INDEX.control;
  const tab = tabs.nth(index);
  await tab.click();
  await page.waitForTimeout(500);
}

async function maybeRefresh(page) {
  const refreshButton = page.getByRole("button", {
    name: /Refresh progress|Fortschritt aktualisieren/i,
  });
  if ((await refreshButton.count()) === 0) return false;
  if (!(await refreshButton.isEnabled())) return false;
  await refreshButton.click();
  return true;
}

async function waitForRefreshCycle(page, timeoutMs) {
  const refreshButton = page.getByRole("button", {
    name: /Refresh progress|Fortschritt aktualisieren|Refreshing|Aktualisiere/i,
  });
  if ((await refreshButton.count()) === 0) return false;

  const deadline = Date.now() + timeoutMs;
  let sawBusy = false;

  while (Date.now() < deadline) {
    const state = await refreshButton.evaluate((node) => ({
      disabled: node instanceof HTMLButtonElement ? node.disabled : false,
      text: node.textContent || "",
    }));

    const busy =
      state.disabled || /Refreshing|Aktualisiere/i.test(state.text);

    if (busy) {
      sawBusy = true;
    } else if (sawBusy) {
      return true;
    }

    await page.waitForTimeout(250);
  }

  return sawBusy;
}

async function readReadyState(page, patternSources, readySelector) {
  return page.evaluate(({ sources, selector }) => {
    const text = document.body?.innerText ?? "";
    const isBusyText = sources.some((source) => new RegExp(source, "i").test(text));
    const spinnerCount = document.querySelectorAll(".spinner, .loading-row, .loading-pill").length;
    const skeletonCount = document.querySelectorAll(
      ".skeleton-line, .skeleton-card, .skeleton-tile, .channel-grid-skeleton",
    ).length;
    const theme = document.documentElement.dataset.theme || "light";
    const root = selector ? document.querySelector(selector) : document.body;
    const hasReadyRoot = Boolean(root);
    return {
      isBusyText,
      spinnerCount,
      skeletonCount,
      theme,
      hasReadyRoot,
    };
  }, { sources: patternSources, selector: readySelector });
}

async function waitForSettled(page, timeoutMs, view) {
  const deadline = Date.now() + timeoutMs;
  let stableSince = 0;
  const patternSources = LOADING_PATTERNS.map((pattern) => pattern.source);
  const readySelector = VIEW_READY_SELECTOR[view] ?? ".layout";

  while (Date.now() < deadline) {
    const state = await readReadyState(page, patternSources, readySelector);

    const busy =
      !state.hasReadyRoot || state.isBusyText || state.spinnerCount > 0 || state.skeletonCount > 0;

    if (!busy) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= 1500) {
        return { settled: true, theme: state.theme };
      }
    } else {
      stableSince = 0;
    }

    await page.waitForTimeout(350);
  }

  const theme = await page.evaluate(() => document.documentElement.dataset.theme || "light");
  return { settled: false, theme };
}

async function ensureTheme(page, targetTheme) {
  const readTheme = async () =>
    page.evaluate(() => document.documentElement.dataset.theme || "light");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentTheme = await readTheme();
    if (currentTheme === targetTheme) return currentTheme;
    const toggle = page.locator(".titlebar").getByRole("button", { name: /Theme/i });
    await toggle.click();
    await page.waitForTimeout(250);
  }

  return readTheme();
}

async function captureTheme(page, theme, options) {
  const activeTheme = await ensureTheme(page, theme);
  const settleState = await waitForSettled(page, options.timeoutMs, options.view);
  const screenshotPath = `${options.prefix}-${theme}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return {
    requestedTheme: theme,
    activeTheme,
    settled: settleState.settled,
    screenshotPath,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    executablePath: "node_modules/electron/dist/electron.exe",
    args: ["."],
    env,
  });

  try {
    const page = await app.firstWindow();
    const pageErrors = [];
    const consoleMessages = [];
    const requestFailures = [];
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });
    page.on("console", (message) => {
      consoleMessages.push(`[${message.type()}] ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      requestFailures.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText ?? "unknown",
      });
    });

    try {
      await waitForAppShell(page);
    } catch (error) {
      const failurePath = `${options.prefix}-failure.png`;
      await page.screenshot({ path: failurePath, fullPage: true }).catch(() => undefined);
      const bodyState = await page
        .evaluate(() => ({
          url: window.location.href,
          title: document.title,
          bodyText: document.body?.textContent ?? "",
          bodyHtml: document.body?.innerHTML ?? "",
          rootExists: Boolean(document.getElementById("root")),
          rootHtml: document.getElementById("root")?.innerHTML ?? "",
          rootChildCount: document.getElementById("root")?.childElementCount ?? 0,
        }))
        .catch(() => ({
          url: "",
          title: "",
          bodyText: "",
          bodyHtml: "",
          rootExists: false,
          rootHtml: "",
          rootChildCount: 0,
        }));
      console.error(
        JSON.stringify(
          {
            stage: "waitForAppShell",
            pageErrors,
            consoleMessages,
            requestFailures,
            bodyState,
            failurePath,
          },
          null,
          2,
        ),
      );
      throw error;
    }
    await openView(page, options.view);
    if (options.refresh) {
      const triggered = await maybeRefresh(page);
      if (triggered) {
        await waitForRefreshCycle(page, Math.min(options.timeoutMs, 15000));
      }
    }

    const light = await captureTheme(page, "light", options);
    const dark = await captureTheme(page, "dark", options);
    const summary = {
      view: options.view,
      refreshed: options.refresh,
      captures: [light, dark],
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
