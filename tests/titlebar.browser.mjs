// Run against npm run dev. Reuse an existing Playwright installation; no app dependency.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.EDGE_EXECUTABLE ? { executablePath: process.env.EDGE_EXECUTABLE } : { channel: "msedge" }) });
const sizes = [[560, 680], [1280, 800], [1920, 1080], [2560, 1440]];
const measurements = [];
const fixture = process.env.THUMBNAIL_FIXTURE ? await readFile(process.env.THUMBNAIL_FIXTURE) : null;
const svg = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1600 900"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#a7c4cc"/><stop offset="1" stop-color="#4b6968"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h1600v900H0z"/><path fill="#56765f" d="M0 500 300 300 600 650 1000 250 1600 600v300H0z"/><path fill="#2d493d" d="m0 700 500-180 380 180 720-200v400H0z"/><text x="70" y="100" font-family="sans-serif" font-size="40" fill="white">Local thumbnail fixture</text></svg>`;
try {
  await mkdir("artifacts/optical", { recursive: true });
  for (const scale of [1, 1.5, 2]) {
    const page = await browser.newPage({ viewport: { width: 560, height: 680 }, deviceScaleFactor: scale });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.frameCosts = [];
      const raf = requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(time => {
        const start = performance.now(); callback(time);
        const cost = performance.now() - start;
        if (cost > .1) window.frameCosts.push(cost);
      });
    });
    await page.route("**/thumbnail-fixture", route => route.fulfill({ body: fixture || svg(1600, 900), contentType: fixture ? "image/jpeg" : "image/svg+xml" }));
    await page.route("**/portrait-fixture", route => route.fulfill({ body: svg(900, 1600), contentType: "image/svg+xml" }));
    await page.route("http://127.0.0.1:1420/", async route => {
      const response = await route.fetch();
      const setup = `
        import { mockIPC, mockWindows } from "/node_modules/@tauri-apps/api/mocks.js";
        globalThis.isTauri = true; mockWindows("main");
        window.testCalls = []; window.testMaximized = false;
        mockIPC(async (cmd, args) => {
          window.testCalls.push({cmd, args});
          if (cmd === "plugin:window|is_maximized") return window.testMaximized;
          if (cmd === "startup") return { folder: "C:/Downloads", enginesReady: true, engineError: null };
          if (cmd === "inspect_media") {
            window.testMetadataId = args.requestId;
            return new Promise((resolve, reject) => { window.testMetadata = resolve; window.testMetadataFail = reject; });
          }
          if (cmd === "download") {
            window.testDownloadId = args.requestId;
            return new Promise((resolve, reject) => { window.testFinish = resolve; window.testFail = reject; });
          }
          if (cmd === "cancel_job" && args.kind === "download") window.testFail("Cancelled.");
          if (cmd === "choose_folder") return "D:/Videos";
        }, { shouldMockEvents: true });
        await import("/src/main.ts");
      `;
      await route.fulfill({ response, body: (await response.text()).replace(/<script type="module" src="\/src\/main\.ts[^"]*"><\/script>/, '<script type="module">' + setup + '</script>') });
    });
    const capture = async (state, width) => {
      await page.screenshot({ path: `artifacts/optical/${state}-${width}-${scale}x.png` });
    };
    const emit = (phase, percent) => page.evaluate(async ({phase, percent}) => {
      const { emit } = await import("/node_modules/@tauri-apps/api/event.js");
      await emit("download-progress", { requestId: window.testDownloadId, phase, percent, speed: 1048576 });
    }, {phase, percent});
    for (const [width, height] of scale === 1 ? sizes : [sizes[0], sizes[2]]) {
      await page.setViewportSize({ width, height });
      await page.goto("http://127.0.0.1:1420/");
      await page.waitForFunction(() => window.testCalls?.some(c => c.cmd === "startup"));
      await page.waitForTimeout(400);
      const bar = page.locator(".titlebar");
      assert.equal(await bar.getAttribute("data-tauri-drag-region"), "");
      assert.equal(await bar.evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
      assert.equal(await page.locator(".titlebar button").count(), 3);
      assert.equal(await page.locator(".brand, .titlebar img").count(), 0);
      assert.equal(await page.locator(".titlebar #engine-check").count(), 0);
      assert.equal(await page.locator("#engine-check, #engine-install, #engine-rollback, .utilities").count(), 0);
      assert.equal(await page.locator(".source-emblem").count(), 1);
      assert.equal(await page.locator(".url-control > svg").count(), 0);
      const resolution = await page.locator("#field").evaluate(c => ({width:c.width, height:c.height, cssWidth:c.clientWidth, cssHeight:c.clientHeight}));
      assert.equal(resolution.width, Math.round(width * scale));
      assert.equal(resolution.height, Math.round(height * scale));
      assert.equal(resolution.cssWidth, width);
      assert.equal(await page.locator("#field").evaluate(c=>c.getContext("webgl2").getError()), 0);
      const pixels = () => page.screenshot({clip:{x:0,y:36,width:20,height:height-36}});
      const initial = await pixels();
      await page.waitForTimeout(250);
      assert.notDeepEqual(await pixels(), initial, "Background continues behind window controls");
      await capture("idle", width);
      if (width === 560) {
        const emblem = page.locator("#emblem-button");
        for (let i=0;i<9;i++) await emblem.click();
        assert.equal(await page.locator("html").evaluate(el=>el.classList.contains("chromatic")),false);
        await emblem.click();
        assert.equal(await page.locator("html").evaluate(el=>el.classList.contains("chromatic")),true);
        await page.waitForTimeout(1900);
        const firstHue=await page.locator("html").evaluate(el=>getComputedStyle(el).getPropertyValue("--chromatic-hue"));
        await page.waitForTimeout(200);
        assert.notEqual(await page.locator("html").evaluate(el=>getComputedStyle(el).getPropertyValue("--chromatic-hue")),firstHue);
        for (const time of [8000,32000,56000]) {
          await page.locator("html").evaluate((el,time)=>{el.getAnimations().find(a=>a.animationName==="chromatic-wheel").currentTime=time;},time);
          await page.waitForTimeout(1900);
          const smallSymbol = await page.locator(".source-emblem").evaluate(el=>({filter:getComputedStyle(el).filter,color:getComputedStyle(el).backgroundColor}));
          assert.equal(smallSymbol.filter, "none", "The URL sun stays monochrome during the color cycle");
          assert.equal(smallSymbol.color, "rgb(237, 237, 237)");
          await capture("chromatic-"+time,width);
        }
        await emblem.focus();
        for (let i=0;i<10;i++) await page.keyboard.press("Enter");
        assert.equal(await page.locator("html").evaluate(el=>el.classList.contains("chromatic")),false);
        await page.waitForTimeout(1900);
      }
      const source = page.locator(".url-control");
      const sourceBox = await source.boundingBox();
      assert(sourceBox.width >= (width >= 1500 ? 680 : width >= 900 ? 500 : 440));
      await page.locator("#url").fill("https://example.com/video.mp4");
      await page.locator("#load").click();
      await page.waitForFunction(() => Boolean(window.testMetadata));
      assert.deepEqual(await source.boundingBox(), sourceBox, "Metadata loading does not move the source field");
      assert.equal(await page.locator(".loading-orbit, .loading-signal, #loading, .source-hint").count(), 0);
      assert.doesNotMatch(await page.locator("body").innerText(), /Getting video info/);
      assert.equal(await page.locator("#source-status").evaluate(el=>getComputedStyle(el).clipPath), "inset(50%)");
      assert.equal(await source.evaluate(el => getComputedStyle(el, "::after").height), "1px");
      assert.equal(await page.locator("#source-form").getAttribute("aria-busy"), "true");
      await capture("loading", width);
      await page.evaluate(() => window.testMetadata({requestId:window.testMetadataId, title:"Big Buck Bunny · Blender Open Movie", duration:65, thumbnail:"http://127.0.0.1:1420/thumbnail-fixture", uploader:"Blender Studio", heights:[2160,1440,1080,720,480,360,240,144], hasAudio:true, hasVideo:true}));
      await page.waitForSelector("#main.has-media");
      if (width === 560 && scale === 1) {
        assert(await page.locator("#details").evaluate(el=>el.getAnimations().some(a=>a.transitionProperty === "grid-template-rows")), "Video details expand through a transition");
        await capture("entering", width);
      }
      await page.waitForFunction(() => document.querySelector("#thumbnail").naturalWidth > 0);
      await page.waitForTimeout(420);
      assert.equal(await page.locator("#source-form").getAttribute("aria-busy"), "false");
      assert.equal(await source.evaluate(el => getComputedStyle(el, "::after").content), "none");
      const image = await page.locator("#thumbnail").evaluate(i => ({ratio:i.naturalWidth/i.naturalHeight, width:i.clientWidth, height:i.clientHeight, parentWidth:i.parentElement.clientWidth, parentHeight:i.parentElement.clientHeight}));
      assert(Math.abs(image.width / image.height - image.ratio) < .01, "Natural aspect ratio is preserved");
      assert.equal(image.width, image.parentWidth);
      assert.equal(image.height, image.parentHeight);
      await capture("ready", width);
      assert((await page.locator("#download").boundingBox()).y + (await page.locator("#download").boundingBox()).height <= height, "Download fits the reference viewport");
      assert.equal(await page.locator("#load").evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
      await page.locator("#quality").click();
      await page.waitForTimeout(160);
      if (await page.evaluate(() => CSS.supports("appearance", "base-select"))) {
        const optionBoxes = await page.locator("#quality option").evaluateAll(options => options.map(o => {const r=o.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
        assert(optionBoxes.some(r => r.top >= 36 && r.bottom <= height), "Picker has reachable options");
        assert(optionBoxes[0].top >= 36 && optionBoxes[0].bottom <= height, "Picker opens within the viewport");
        await page.locator("#quality option").last().evaluate(el=>el.scrollIntoView({block:"nearest"}));
        const lastOption = await page.locator("#quality option").last().boundingBox();
        assert(lastOption.y >= 36 && lastOption.y + lastOption.height <= height, "The last quality remains reachable without clipping");
      }
      await capture("quality", width);
      await page.keyboard.press("Escape");
      await page.locator('[data-format="mp3"]').click();
      if (width === 560 && scale === 1) {
        assert(await page.locator(".format-options").evaluate(el=>el.getAnimations({subtree:true}).some(a=>a.transitionProperty === "transform")), "Format selection slides to the next option");
        assert(await page.locator("#quality").evaluate(el=>el.getAnimations().length > 0), "Quality feedback follows the format change");
        await capture("format-changing", width);
      }
      assert.equal(await page.locator("#quality option").allTextContents().then(v=>v.join(",")), "192 kbps,128 kbps,256 kbps,320 kbps");
      await page.locator('[data-format="m4a"]').click();
      assert.equal(await page.locator("#quality").isDisabled(), true);
      await page.locator('[data-format="opus"]').click();
      assert.equal(await page.locator("#quality").isDisabled(), true);
      await page.locator('[data-format="mp4"]').click();
      await page.locator("#quality").selectOption("720");
      await page.locator("#destination").click();
      assert.equal(await page.locator("#folder").innerText(), "D:/Videos");
      await page.locator("#download").click();
      await page.waitForFunction(() => Boolean(window.testDownloadId));
      assert.equal(await page.evaluate(() => window.testCalls.findLast(c=>c.cmd==="download").args.height), 720);
      await capture("starting", width);
      assert.equal(await page.locator("#percent").innerText(), "");
      for (const percent of [0, 43.7, 100]) {
        await emit("downloading", percent);
        assert.equal(await page.locator("#progress").getAttribute("aria-valuenow"), String(percent));
        assert.equal(await page.locator("#percent").innerText(), percent.toFixed(1) + "%");
        if (percent === 43.7) { await page.waitForTimeout(260); await capture("progress", width); }
      }
      await emit("processing", null);
      assert.equal(await page.locator("#progress").getAttribute("aria-valuenow"), null);
      assert.equal(await page.locator("#progress").isVisible(), false);
      assert.equal(await page.locator("#percent").innerText(), "");
      assert.equal(await page.locator("#phase").innerText(), "Processing media");
      await capture("processing", width);
      await page.locator("#cancel").click();
      await page.waitForFunction(() => document.querySelector("#message-text").textContent === "Download cancelled.");
      assert.equal(await page.locator("#progress-area").isVisible(), false);
      await page.locator("#download").click();
      assert.equal(await page.locator("#progress").isVisible(), true, "A new download restores the progress rail after processing");
      await page.evaluate(() => window.testFinish("D:/Videos/video.mp4"));
      await page.waitForFunction(() => document.querySelector("#message").dataset.kind === "success");
      assert.equal(await page.locator("#progress-area").isVisible(), false);
      await capture("success", width);
      await page.locator("#download").click();
      await page.evaluate(() => window.testFail("Your disk is full."));
      await page.waitForFunction(() => document.querySelector("#message").dataset.kind === "error");
      await capture("error", width);
      assert.equal(await page.locator("#progress-area").isVisible(), false);
      const costs = await page.evaluate(() => window.frameCosts.sort((a,b)=>a-b));
      measurements.push({viewport:[width,height],scale,resolution,frames:costs.length,frameMeanMs:costs.reduce((a,b)=>a+b,0)/costs.length,frameP95Ms:costs[Math.floor(costs.length*.95)]});
    }
    for (const maximized of [true, false]) {
      await page.evaluate(async value=>{
        window.testMaximized=value;
        const {emit}=await import("/node_modules/@tauri-apps/api/event.js");
        await emit("tauri://resize",{});
      },maximized);
      assert.equal(await page.locator("#maximize").getAttribute("aria-label"), maximized ? "Restore" : "Maximize");
    }
    for (const [id,command] of [["minimize","minimize"],["maximize","toggle_maximize"],["close","close"]]) {
      await page.locator("#"+id).focus(); await page.keyboard.press("Enter");
      assert(await page.evaluate(cmd=>window.testCalls.some(c=>c.cmd==="plugin:window|"+cmd),command));
    }
    await page.locator("#thumbnail").evaluate(i=>{i.src="http://127.0.0.1:1420/portrait-fixture";});
    await page.waitForFunction(()=>document.querySelector("#thumbnail").naturalHeight===1600);
    const portrait = await page.locator(".preview").boundingBox();
    assert(Math.abs(portrait.width / portrait.height - 9/16) < .01);
    await page.setViewportSize({width:430,height:630});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator("main").evaluate(el => el.scrollWidth > el.clientWidth), false);
    await page.locator("#download").scrollIntoViewIfNeeded();
    await capture("portrait-compact",430);
    await page.locator("#url").fill("");
    assert.equal(await page.locator("#details").evaluate(el=>el.inert),true);
    assert.equal(await page.locator("#details").getAttribute("aria-hidden"),"true");
    assert((await page.locator("#details").boundingBox()).height > 0, "Clearing the URL retains content during its exit transition");
    await capture("clearing",430);
    await page.waitForTimeout(320);
    assert.equal((await page.locator("#details").boundingBox()).height,0);
    await capture("cleared",430);
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.waitForTimeout(500);
    const fieldStill = await pixelsForCanvas(page,"#field");
    const markStill = await pixelsForCanvas(page,"#emblem");
    await page.waitForTimeout(300);
    assert.equal((await pixelsForCanvas(page,"#field")) === fieldStill, true, "Reduced motion stops the background");
    assert.equal((await pixelsForCanvas(page,"#emblem")) === markStill, true, "Reduced motion stops the emblem");
    await page.emulateMedia({contrast:"more"});
    assert.equal(await page.locator(".url-control").evaluate(el=>getComputedStyle(el).backdropFilter),"none");
    await page.emulateMedia({forcedColors:"active"});
    assert.equal(await page.locator("#close").evaluate(el=>getComputedStyle(el,"::before").display),"none");
    assert.deepEqual(errors, []);
    await page.close();
  }
  const recovery = await browser.newPage();
  await recovery.goto("http://127.0.0.1:1420/");
  await recovery.waitForTimeout(200);
  await recovery.evaluate(()=>{const c=document.querySelector("#field");window.testLoss=c.getContext("webgl2").getExtension("WEBGL_lose_context");window.testLoss.loseContext();});
  await recovery.waitForTimeout(200);
  await recovery.evaluate(()=>window.testLoss.restoreContext());
  await recovery.waitForTimeout(400);
  assert.equal(await recovery.locator("#field").evaluate(c=>c.getContext("webgl2").isContextLost()),false);
  assert.equal(await recovery.locator("#field").evaluate(c=>c.getContext("webgl2").getError()),0);
  await recovery.close();
  const fallback = await browser.newPage({viewport:{width:560,height:680},deviceScaleFactor:2});
  await fallback.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type==="webgl2" ? null : original.call(this,type,...args);};
  });
  await fallback.goto("http://127.0.0.1:1420/"); await fallback.waitForTimeout(400);
  assert.equal(await fallback.locator("#field").evaluate(c=>c.width),700);
  assert(await fallback.locator("#field").evaluate(c=>c.getContext("2d").getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===0&&v>14)));
  await fallback.screenshot({path:"artifacts/optical/canvas-fallback.png"});
  await fallback.close();
  await writeFile("artifacts/optical/measurements.json", JSON.stringify(measurements,null,2));
  console.log("Interface checks passed: four reference sizes; DPR 1/1.5/2; loading edge, natural thumbnails, adaptive layout, quality picker, formats, destination, progress, processing, cancel, success, errors and accessibility preferences.");
} finally { await browser.close(); }

async function pixelsForCanvas(page, selector) {
  return page.locator(selector).evaluate(canvas=>{
    const gl=canvas.getContext("webgl2");
    if (!gl) return canvas.toDataURL();
    const pixels=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let hash=2166136261;
    for (const value of pixels) hash=Math.imul(hash^value,16777619);
    return String(hash>>>0);
  });
}
