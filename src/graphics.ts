import sourcePoints from "./emblem-points.json";

type Glyph = { x: number; y: number; phase: number; depth: number; char: string };
type Wave = { x: number; y: number; born: number; strength: number; ellipse: number };
const TAU = Math.PI * 2;

export function startGraphics(background: HTMLCanvasElement, emblem: HTMLCanvasElement): () => void {
  const ctx = background.getContext("2d", { alpha: false });
  const symbol = emblem.getContext("2d");
  if (!ctx || !symbol) return () => {};
  const field = ctx;
  const mark = symbol;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0, height = 0, ratio = 1, frame = 0, previous = 0, elapsed = 0;
  let nextWave = 4, lastPointer = 0;
  let glyphs: Glyph[] = [];
  let waves: Wave[] = [];
  const alphabet = "01aeouxz{}[]<>/+=:;*";
  const points = sourcePoints as number[][];
  let seed = 41;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function resize() {
    width = background.clientWidth;
    height = background.clientHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    background.width = Math.round(width * ratio);
    background.height = Math.round(height * ratio);
    field.setTransform(ratio, 0, 0, ratio, 0, 0);
    emblem.width = 360;
    emblem.height = 360;
    seed = 41;
    const count = Math.min(2600, Math.round(width * height / 145));
    glyphs = Array.from({ length: count }, () => ({
      x: random() * width, y: random() * height, phase: random() * TAU,
      depth: 0.3 + random() * 0.7, char: alphabet[Math.floor(random() * alphabet.length)],
    }));
    draw();
  }
  function addWave(x: number, y: number, strength: number) {
    if (reduced.matches) return;
    waves.push({ x, y, born: elapsed, strength, ellipse: 0.7 + random() * 0.5 });
    if (waves.length > 5) waves.shift();
  }
  function draw() {
    field.fillStyle = "#0a0a0a";
    field.fillRect(0, 0, width, height);
    field.font = "8px Consolas, monospace";
    field.textBaseline = "middle";
    const time = elapsed;
    for (const g of glyphs) {
      const bend = Math.sin(g.y / 112 + Math.sin(g.x / 170 + time * 0.045) * 2.8);
      const density = Math.pow(Math.max(0, 0.5 + bend * 0.5), 3);
      let x = g.x + Math.sin(time * 0.11 + g.phase + g.y / 190) * (5 + g.depth * 9);
      let y = g.y + Math.cos(time * 0.075 + g.phase + g.x / 130) * 9;
      let light = 0;
      for (const w of waves) {
        const dx = x - w.x, dy = (y - w.y) / w.ellipse;
        const distance = Math.hypot(dx, dy);
        const age = time - w.born;
        const ring = (distance - age * 39) / 25;
        const force = Math.exp(-ring * ring) * Math.max(0, 1 - age / 10) * w.strength;
        x += dx / Math.max(1, distance) * force * 7;
        y += dy / Math.max(1, distance) * force * 5;
        light += force;
      }
      const shimmer = 0.8 + 0.2 * Math.sin(time * 0.18 + g.phase);
      const opacity = Math.min(0.42, (0.025 + density * 0.17) * g.depth * shimmer + light * 0.22);
      field.fillStyle = light > 0.07 ? "rgba(145,173,197," + opacity + ")" : "rgba(145,145,145," + opacity + ")";
      field.fillText(g.char, x, y);
    }
    mark.clearRect(0, 0, 360, 360);
    const angle = reduced.matches ? 0.15 : time * 0.15 + 0.15;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    for (const [x, y, edge] of points) {
      const z = Math.sin(x * 5 + y * 3) * 0.025;
      const px = x * cosine + z * sine;
      const pz = -x * sine + z * cosine;
      const perspective = 3.8 / (3.8 + pz);
      const size = (edge ? 1.55 : 1.15) * perspective;
      const light = 0.48 + (pz + 1) * 0.18;
      mark.fillStyle = "rgba(213,226,236," + light + ")";
      mark.fillRect(180 + px * 174 * perspective, 180 + y * 174 * perspective, size, size);
    }
  }
  function tick(now: number) {
    if (document.hidden || reduced.matches) { frame = 0; previous = 0; return; }
    frame = requestAnimationFrame(tick);
    if (now - previous < 1000 / 25) return;
    if (previous) elapsed += Math.min(0.1, (now - previous) / 1000);
    previous = now;
    if (elapsed > nextWave) {
      addWave(width * (0.12 + random() * 0.76), height * random(), 0.65);
      nextWave = elapsed + 8 + random() * 6;
    }
    waves = waves.filter(w => elapsed - w.born < 10);
    draw();
  }
  function resume() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previous = 0;
    if (!document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
    else if (!document.hidden) draw();
  }
  function pointer(event: PointerEvent) {
    if (performance.now() - lastPointer < 800) return;
    lastPointer = performance.now();
    addWave(event.clientX, event.clientY, 0.12);
  }
  function click(event: MouseEvent) { addWave(event.clientX, event.clientY, 0.7); }
  const observer = new ResizeObserver(resize);
  observer.observe(background);
  document.addEventListener("visibilitychange", resume);
  reduced.addEventListener("change", resume);
  window.addEventListener("pointermove", pointer, { passive: true });
  window.addEventListener("click", click, { passive: true });
  resize(); resume();
  return () => {
    cancelAnimationFrame(frame); observer.disconnect();
    document.removeEventListener("visibilitychange", resume);
    reduced.removeEventListener("change", resume);
    window.removeEventListener("pointermove", pointer);
    window.removeEventListener("click", click);
  };
}

