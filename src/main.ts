import "./style.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { startGraphics } from "./graphics";
import { bytesLabel, durationLabel, errorLabel, errorDetails, isCancelled, canRetry, validWebUrl, type OutputFormat } from "./presentation";

interface Media {
  requestId: number; title: string; duration: number | null; thumbnail: string | null;
  uploader: string | null; heights: number[]; hasAudio: boolean; hasVideo: boolean;
}
interface Startup { folder: string; enginesReady: boolean; engineError: string | null }
interface Progress { requestId: number; phase: string; percent: number | null; speed: number | null; downloaded: number | null; total: number | null }

const folderIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 6.5V4.7c0-.7.5-1.2 1.2-1.2H8l1.7 2h6.6c.7 0 1.2.5 1.2 1.2v8.6c0 .7-.5 1.2-1.2 1.2H3.7c-.7 0-1.2-.5-1.2-1.2V6.5Z" stroke="currentColor" stroke-width="1.2"/></svg>';

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <canvas id="field" aria-hidden="true"></canvas>
  <header class="titlebar" data-tauri-drag-region>
    <div class="window-actions">
      <button id="minimize" aria-label="Minimize" title="Minimize"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button>
      <button id="maximize" aria-label="Maximize" title="Maximize"><svg class="maximize-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx=".5"/></svg><svg class="restore-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 5.5v-2h7v7h-2"/><rect x="3.5" y="5.5" width="7" height="7" rx=".5"/></svg></button>
      <button id="close" aria-label="Close" title="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button>
    </div>
  </header>
  <main id="main">
    <div class="composition">
    <button id="emblem-button" class="identity" type="button" aria-label="Sun emblem"><canvas id="emblem" aria-hidden="true"></canvas></button>
    <section class="workspace" aria-label="Video download">
      <form id="source-form" class="source-form" autocomplete="off">
        <label class="sr-only" for="url">Video URL</label>
        <div class="url-control glass glass-control"><span class="source-emblem" aria-hidden="true"></span><input id="url" type="url" placeholder="Paste a video link" spellcheck="false" autocomplete="off" required><button id="load" type="submit" aria-label="Load video" title="Load video"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      </form>
      <span id="source-status" class="sr-only" role="status" aria-live="polite"></span>
      <section id="details" class="details" aria-label="Selected video" aria-hidden="true" inert><div class="details-content">
        <div class="preview"><img id="thumbnail" alt="" referrerpolicy="no-referrer"><div class="preview-fallback" id="preview-fallback">Preview unavailable</div><span id="duration" class="duration glass glass-floating"></span></div>
        <div class="video-heading"><h1 id="video-title"></h1><p id="uploader"></p></div>
        <div class="options">
          <fieldset class="format-field"><legend>Format</legend><div class="format-options glass glass-control"><button type="button" data-format="mp4" aria-pressed="true">MP4</button><button type="button" data-format="mp3" aria-pressed="false">MP3</button><button type="button" data-format="m4a" aria-pressed="false">M4A</button><button type="button" data-format="opus" aria-pressed="false">Opus</button></div></fieldset>
          <div class="quality-field"><label for="quality">Quality</label><select id="quality" class="glass glass-control"><option value="">Best available</option></select></div>
        </div>
        <button id="destination" class="destination glass glass-surface" title="Choose download folder">${folderIcon}<span><span class="destination-label">Save to</span><span id="folder"></span></span><span class="change-folder">Change</span></button>
        <div class="download-actions"><button id="download" class="primary glass glass-primary">Download<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v9m-3-3 3 3 3-3M4 13v3h12v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
        <div id="progress-area" class="progress-area glass glass-surface" hidden><div class="progress-header"><div class="progress-copy"><span id="phase" role="status">Downloading</span><span id="transfer"></span></div><span id="percent"></span><button id="cancel" hidden>Cancel</button></div><div id="progress" class="progress" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100"><div id="progress-fill"></div></div></div>
        <div class="audio-note"><p id="audio-hint" class="audio-hint" aria-hidden="true">Converted from the source. Quality cannot exceed the original.</p></div>
      </div></section>
      <div id="message" class="message" role="status" aria-live="polite" hidden><span id="message-text"></span><button id="open-folder" hidden>Open folder</button><button id="retry" hidden>Try again</button><button id="copy-error" hidden title="Copy technical details">Copy details</button></div>
    </section>
    </div>
  </main>

`;
function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const main = element("main");
const input = element<HTMLInputElement>("url");
const details = element("details");
const load = element<HTMLButtonElement>("load");
const quality = element<HTMLSelectElement>("quality");
const downloadButton = element<HTMLButtonElement>("download");
const cancelButton = element<HTMLButtonElement>("cancel");
const destination = element<HTMLButtonElement>("destination");
const formatButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-format]")];
let media: Media | null = null;
let format: OutputFormat = "mp4";
let generation = Date.now();
let request = 0;
let activeDownload = 0;
let busy = false;
let ready = false;
let loading = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let lastLoaded = "";
let inspectingUrl = "";
let stopped = false;

startGraphics(element<HTMLCanvasElement>("field"), element<HTMLCanvasElement>("emblem"));
let emblemPresses = 0;
element("emblem-button").addEventListener("click", () => {
  if (++emblemPresses === 10) {
    document.documentElement.classList.toggle("chromatic");
    emblemPresses = 0;
  }
});

function fitQualityMenu() {
  const rect = quality.getBoundingClientRect();
  quality.style.setProperty("--quality-space", Math.max(54, Math.max(window.innerHeight - rect.bottom, rect.top - 36) - 14) + "px");
}
quality.addEventListener("pointerdown", fitQualityMenu);
quality.addEventListener("keydown", fitQualityMenu);
window.addEventListener("resize", fitQualityMenu);
main.addEventListener("scroll", fitQualityMenu, { passive: true });

function message(text: string, kind = "info", retry = false) {
  element("message").hidden = !text;
  element("message").dataset.kind = kind;
  element("message").setAttribute("role", kind === "error" ? "alert" : "status");
  element("message-text").textContent = text;
  element("open-folder").hidden = kind !== "success";
  element("retry").hidden = !retry;
  element("copy-error").hidden = true;
  element("copy-error").textContent = "Copy details";
  element("message-text").title = "";
  if (text) requestAnimationFrame(() => element("message").scrollIntoView({
    block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  }));
}
let lastError = "";
function showError(error: unknown, retry = false) {
  message(errorLabel(error), "error", retry && canRetry(error));
  lastError = errorDetails(error);
  element("message-text").title = lastError;
  element("copy-error").hidden = false;
}
element("copy-error").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(lastError); element("copy-error").textContent = "Copied"; }
  catch { element("message-text").textContent = lastError; }
});
function setLoading(value: boolean) {
  loading = value;
  element("source-form").classList.toggle("is-loading", value);
  element("source-status").textContent = value ? "Loading video information." : "";
  element("source-form").setAttribute("aria-busy", String(value));
  load.setAttribute("aria-busy", String(value));
  load.disabled = !ready || value || busy;
}
function resetDetails() {
  media = null; lastLoaded = "";
  main.classList.remove("has-media");
  details.inert = true;
  details.setAttribute("aria-hidden", "true");
}
function options() {
  for (const button of formatButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.format === format));
    button.disabled = busy || (button.dataset.format === "mp4" ? !media?.hasVideo : !media?.hasAudio);
  }
  quality.replaceChildren(new Option(format === "mp4" ? "Best · H.264 / AAC" : format === "mp3" ? "192 kbps" : format === "opus" ? "Best source · Opus" : "Best source · AAC", ""));
  if (format === "mp4") for (const height of media?.heights ?? []) quality.add(new Option(height + "p", String(height)));
  if (format === "mp4") quality.add(new Option("Best · original codecs", "source"));
  if (format === "mp3") for (const bitrate of [128, 256, 320]) quality.add(new Option(bitrate + " kbps", String(bitrate)));
  quality.disabled = busy || !["mp4", "mp3"].includes(format);
  quality.title = format === "mp3" ? "Bitrate used for conversion. Existing MP3 audio keeps its original bitrate." : format === "mp4" ? "Compatible MP4 uses H.264/AAC. Original codecs preserves the best source tracks." : "Matching source audio is kept without another conversion.";
  details.classList.toggle("is-audio", format !== "mp4");
  element("audio-hint").setAttribute("aria-hidden", String(format === "mp4"));
}
function setBusy(value: boolean) {
  busy = value;
  input.disabled = value;
  load.disabled = value || !ready || loading;
  destination.disabled = value;
  downloadButton.disabled = value || !media || !ready;
  downloadButton.hidden = value;
  cancelButton.hidden = !value;
  element("progress-area").hidden = !value;
  for (const button of formatButtons) button.disabled = value || (button.dataset.format === "mp4" ? !media?.hasVideo : !media?.hasAudio);
  quality.disabled = value || !["mp4", "mp3"].includes(format);
  if (!value) { cancelButton.disabled = false; cancelButton.textContent = "Cancel"; }
}
async function inspect(force = false) {
  clearTimeout(debounce);
  if (!ready || busy) return;
  const url = input.value.trim();
  if (loading && url === inspectingUrl) return;
  if (!validWebUrl(url)) { message("Paste a complete HTTP or HTTPS video link.", "error"); return; }
  if (!force && url === lastLoaded) return;
  const thisGeneration = ++generation;
  const previous = request;
  request = thisGeneration;
  if (previous) void invoke("cancel_job", { kind: "metadata", requestId: previous }).catch(() => {});
  resetDetails(); message(""); inspectingUrl = url; setLoading(true);
  try {
    const result = await invoke<Media>("inspect_media", { url, requestId: thisGeneration });
    if (thisGeneration !== generation) return;
    media = result; lastLoaded = url;
    element("video-title").textContent = result.title;
    element("video-title").title = result.title;
    element("duration").textContent = durationLabel(result.duration);
    element("uploader").textContent = result.uploader || "Source video";
    const thumbnail = element<HTMLImageElement>("thumbnail");
    thumbnail.hidden = true;
    element("preview-fallback").hidden = false;
    element("thumbnail").parentElement!.style.removeProperty("--preview-ratio");
    thumbnail.onload = () => {
      thumbnail.parentElement!.style.setProperty("--preview-ratio", String(thumbnail.naturalWidth / thumbnail.naturalHeight));
      thumbnail.hidden = false; element("preview-fallback").hidden = true;
    };
    thumbnail.onerror = () => { thumbnail.hidden = true; element("preview-fallback").hidden = false; };
    if (result.thumbnail) thumbnail.src = result.thumbnail; else thumbnail.removeAttribute("src");
    format = result.hasVideo ? "mp4" : "m4a";
    options(); setBusy(false);
    main.classList.add("has-media"); details.inert = false;
    details.setAttribute("aria-hidden", "false");
  } catch (error) {
    if (thisGeneration === generation && !isCancelled(error)) showError(error, true);
  } finally {
    if (thisGeneration === generation) { setLoading(false); request = 0; inspectingUrl = ""; }
  }
}
element("source-form").addEventListener("submit", event => { event.preventDefault(); void inspect(true); });
input.addEventListener("input", () => {
  clearTimeout(debounce);
  ++generation;
  if (request) void invoke("cancel_job", { kind: "metadata", requestId: request }).catch(() => {});
  request = 0; inspectingUrl = ""; setLoading(false); resetDetails();
  if (ready) message("");
  if (validWebUrl(input.value.trim())) debounce = setTimeout(() => void inspect(), 500);
});
let qualityAnimation: Animation | undefined;
for (const button of formatButtons) button.addEventListener("click", () => {
  if (button.dataset.format === format) return;
  qualityAnimation?.cancel();
  format = button.dataset.format as OutputFormat; options();
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const opacity = Number(getComputedStyle(quality).opacity);
    qualityAnimation = quality.animate([{ opacity: opacity * 0.6 }, { opacity }], { duration: 160, easing: "ease-out" });
  }
});
destination.addEventListener("click", async () => {
  destination.disabled = true;
  try {
    const folder = await invoke<string | null>("choose_folder");
    if (folder) { element("folder").textContent = folder; destination.title = folder; }
  } catch (error) { message(errorLabel(error), "error"); }
  finally { destination.disabled = busy; }
});
element("retry").addEventListener("click", () => void inspect(true));
downloadButton.addEventListener("click", async () => {
  if (!media || busy) return;
  const id = ++generation;
  activeDownload = id;
  stopped = false;
  const selectedHeight = format === "mp4" && quality.value && quality.value !== "source" ? Number(quality.value) : null;
  message(""); setBusy(true);
  element("phase").textContent = "Starting download";
  element("transfer").textContent = "";
  element("percent").textContent = "";
  element("progress-area").classList.remove("is-processing");
  element("progress").hidden = false;
  element("progress").removeAttribute("aria-valuenow");
  element("progress").classList.add("indeterminate");
  element("progress-fill").style.width = "0%";
  try {
    const output = await invoke<string>("download", { requestId: id, mediaId: media.requestId, format: format === "mp4" && quality.value === "source" ? "source" : format, height: selectedHeight, audioBitrate: format === "mp3" ? Number(quality.value || 192) : null });
    message("Saved to your folder.", "success");
    element("message-text").title = output;
  } catch (error) {
    if (isCancelled(error)) message("Download cancelled.");
    else showError(error);
  } finally { activeDownload = 0; setBusy(false); input.focus(); }
});
cancelButton.addEventListener("click", async () => {
  if (!activeDownload || stopped) return;
  stopped = true; cancelButton.disabled = true; cancelButton.textContent = "Cancelling…";
  try { await invoke("cancel_job", { kind: "download", requestId: activeDownload }); }
  catch (error) { message(errorLabel(error), "error"); cancelButton.disabled = false; stopped = false; }
});
element("open-folder").addEventListener("click", async () => {
  try { await invoke("open_folder"); } catch (error) { message(errorLabel(error), "error"); }
});
if (isTauri()) {
  const window = getCurrentWindow();
  element("minimize").addEventListener("click", () => void window.minimize());
  element("maximize").addEventListener("click", () => void window.toggleMaximize());
  element("close").addEventListener("click", async () => {
    if (activeDownload) await invoke("cancel_job", { kind: "download", requestId: activeDownload }).catch(() => {});
    if (request) await invoke("cancel_job", { kind: "metadata", requestId: request }).catch(() => {});
    await window.close();
  });
  async function updateMaximizeButton() {
    const maximized = await window.isMaximized();
    const button = element<HTMLButtonElement>("maximize");
    button.dataset.maximized = String(maximized);
    button.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
    button.title = maximized ? "Restore" : "Maximize";
  }
  await window.onResized(updateMaximizeButton);
  await updateMaximizeButton();
  await listen<Progress>("download-progress", ({ payload }) => {
    if (payload.requestId !== activeDownload || stopped) return;
    const processing = payload.phase === "processing";
    element("phase").textContent = processing ? "Processing media" : "Downloading";
    element("percent").textContent = !processing && payload.percent != null ? payload.percent.toFixed(1) + "%" : "";
    element("progress-area").classList.toggle("is-processing", processing);
    element("transfer").textContent = !processing && payload.speed ? bytesLabel(payload.speed) + "/s" : "";
    const progress = element("progress");
    progress.classList.toggle("indeterminate", !processing && payload.percent == null);
    progress.hidden = processing;
    if (!processing && payload.percent != null) {
      progress.setAttribute("aria-valuenow", String(payload.percent));
      element("progress-fill").style.width = payload.percent + "%";
    } else progress.removeAttribute("aria-valuenow");
  });
  try {
    const state = await invoke<Startup>("startup");
    ready = state.enginesReady;
    element("folder").textContent = state.folder;
    destination.title = state.folder;
    if (state.engineError) message(state.engineError, "error");
  } catch (error) { message(errorLabel(error), "error"); }
} else {
  for (const button of document.querySelectorAll<HTMLButtonElement>(".window-actions button")) button.disabled = true;
  message("Open the ytnabber desktop app to download.");
}
setLoading(false);
input.focus();
