// Run against npm run dev; PLAYWRIGHT_MODULE can point to an existing Playwright installation.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  await mkdir("artifacts", { recursive: true });
  for (const scale of [1, 1.5, 2]) {
    const page = await browser.newPage({ viewport: { width: 560, height: 680 }, deviceScaleFactor: scale });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://127.0.0.1:1420/", async route => {
      const response = await route.fetch();
      const setup = `
        import { mockIPC, mockWindows } from "/node_modules/@tauri-apps/api/mocks.js";
        globalThis.isTauri = true;
        mockWindows("main");
        window.testCalls = [];
        window.testMaximized = false;
        mockIPC(async (cmd, args) => {
          window.testCalls.push(cmd);
          if (cmd === "plugin:window|is_maximized") return window.testMaximized;
          if (cmd === "startup") return { folder: "C:/Downloads", enginesReady: true, engineError: null };
        }, { shouldMockEvents: true });
        await import("/src/main.ts");
      `;
      const html = (await response.text()).replace(
        /<script type="module" src="\/src\/main\.ts[^"]*"><\/script>/,
        '<script type="module">' + setup + '</script>',
      );
      await route.fulfill({ response, body: html });
    });
    await page.goto("http://127.0.0.1:1420/");
    await page.waitForFunction(() => window.testCalls?.includes("startup"));
    const bar = page.locator(".titlebar");
    assert.equal(await bar.evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await bar.evaluate(el => getComputedStyle(el).borderBottomWidth), "0px");
    assert.equal((await bar.boundingBox()).height, 40);
    assert.equal(await bar.getAttribute("data-tauri-drag-region"), "");
    assert.equal(await page.locator(".brand").getAttribute("data-tauri-drag-region"), "");
    assert.equal(await page.locator(".window-actions").evaluate(el => getComputedStyle(el).getPropertyValue("app-region")), "no-drag");
    assert.equal(await page.locator(".brand").innerText(), "YTNabber");
    const logoBox = await page.locator(".brand img").boundingBox();
    const iconBox = await page.locator("#minimize svg").boundingBox();
    assert.equal(logoBox.y + logoBox.height / 2, iconBox.y + iconBox.height / 2);
    const topPixels = () => page.locator("#field").evaluate(canvas =>
      [...canvas.getContext("2d").getImageData(0, 0, canvas.width, 40).data]);
    const initial = await topPixels();
    assert(initial.some((value, index) => index % 4 === 0 && value > 12), "Glyphs extend behind the titlebar");
    await page.waitForTimeout(400);
    assert.notDeepEqual(await topPixels(), initial, "The titlebar background keeps animating");
    await page.screenshot({ path: `artifacts/titlebar-${scale}x.png` });
    const maximize = page.locator("#maximize");
    const surface = () => maximize.evaluate(el => getComputedStyle(el, "::before").opacity);
    assert.equal(await surface(), "0");
    await maximize.hover();
    await page.waitForTimeout(160);
    assert.equal(await surface(), "1");
    await page.screenshot({ path: `artifacts/titlebar-hover-${scale}x.png` });
    await page.mouse.down();
    assert.equal(await maximize.evaluate(el => getComputedStyle(el).transform), "none");
    await page.screenshot({ path: `artifacts/titlebar-pressed-${scale}x.png` });
    await page.mouse.up();
    assert(await page.evaluate(() => window.testCalls.includes("plugin:window|toggle_maximize")));
    for (const maximized of [true, false]) {
      await page.evaluate(async value => {
        window.testMaximized = value;
        const { emit } = await import("/node_modules/@tauri-apps/api/event.js");
        await emit("tauri://resize", { width: 560, height: 680 });
      }, maximized);
      await page.waitForFunction(value => document.querySelector("#maximize").dataset.maximized === String(value), maximized);
      assert.equal(await maximize.getAttribute("aria-label"), maximized ? "Restore" : "Maximize");
      assert.equal(await page.locator(".restore-icon").isVisible(), maximized);
      assert.equal(await page.locator(".maximize-icon").isVisible(), !maximized);
    }
    await page.locator("#minimize").click();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#close").evaluate(el => el.matches(":focus-visible")), true);
    await page.keyboard.press("Enter");
    assert(await page.evaluate(() => window.testCalls.includes("plugin:window|minimize")));
    assert(await page.evaluate(() => window.testCalls.includes("plugin:window|close")));
    await page.setViewportSize({ width: 430, height: 630 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await maximize.evaluate(el => getComputedStyle(el).transitionDuration), "0s");
    await page.emulateMedia({ contrast: "more" });
    assert.equal(await bar.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(10, 10, 10)");
    assert.equal(await maximize.evaluate(el => getComputedStyle(el, "::before").backdropFilter), "none");
    await page.emulateMedia({ forcedColors: "active" });
    assert.equal(await page.locator("#close").evaluate(el => getComputedStyle(el, "::before").display), "none");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Titlebar checks passed at 100%, 150% and 200%: background, controls, restore state, keyboard, compact layout and accessibility preferences.");
} finally {
  await browser.close();
}
