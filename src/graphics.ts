import sourcePoints from "./emblem-points.json";

type Glyph = { x: number; y: number; phase: number; depth: number; glyph: number };
type Wave = { x: number; y: number; born: number; strength: number; ellipse: number };
type Point = { x: number; y: number; z: number; edge: boolean; face: number };
const TAU = Math.PI * 2;
const alphabet = "01aexz{}[]<>/+=:;*";

export function startGraphics(background: HTMLCanvasElement, emblem: HTMLCanvasElement): () => void {
  const field = background.getContext("2d", { alpha: false });
  const mark = emblem.getContext("2d");
  if (!field || !mark) return () => {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const atlas = document.createElement("canvas");
  atlas.width = alphabet.length * 12;
  atlas.height = 28;
  const ink = atlas.getContext("2d")!;
  ink.font = "9px Consolas, monospace";
  ink.textBaseline = "top";
  for (let i = 0; i < alphabet.length; i++) {
    ink.fillStyle = "#c3c7cb";
    ink.fillText(alphabet[i], i * 12 + 2, 1);
    ink.fillStyle = "#9bb4c9";
    ink.fillText(alphabet[i], i * 12 + 2, 15);
  }
  // Front and rear surfaces share the original mask; edge layers give the rays actual thickness.
  const points: Point[] = [];
  for (const [x, y, edge] of sourcePoints) {
    const radius = Math.hypot(x, y);
    const thickness = 0.065 + Math.max(0, 0.5 - radius) * 0.1;
    points.push({ x, y, z: -thickness, edge: Boolean(edge), face: -1 });
    points.push({ x, y, z: thickness, edge: Boolean(edge), face: 1 });
    if (edge) for (const fraction of [-0.5, 0, 0.5]) {
      points.push({ x, y, z: thickness * fraction, edge: true, face: 0 });
    }
  }
  let width = 0, height = 0, frame = 0, previous = 0, elapsed = 0;
  let nextWave = 1.5;
  let glyphs: Glyph[] = [];
  let waves: Wave[] = [];
  let seed = 41;
  const symbolSize = 360;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  function drawField(time: number) {
    if (!field) return;
    field.globalAlpha = 1;
    field.fillStyle = "#08090a";
    field.fillRect(0, 0, width, height);
    const span = Math.max(1, Math.min(width, height));
    const drift = time * 0.065;
    for (const g of glyphs) {
      const u = (g.x - width * 0.5) / span;
      const v = (g.y - height * 0.48) / span;
      const fold = Math.sin(u * 8.5 + Math.sin(v * 5.2 - drift * 0.42) * 2.1 + drift * 0.55);
      const cross = Math.cos(v * 7.2 - u * 2.8 + Math.sin(u * 3.6 + drift * 0.3));
      const ribbon = Math.exp(-Math.pow(fold - 0.15, 2) * 4.8);
      const hollow = 0.3 + 0.7 * Math.min(1, Math.hypot(u * 2.3, (v + 0.21) * 2));
      const depth = 0.35 + (cross + 1) * 0.25;
      let x = g.x + Math.sin(v * 4.8 + fold * 1.6 + drift) * 23 * depth;
      let y = g.y + Math.cos(u * 5.4 + cross * 1.3 - drift * 0.7) * 19 * depth;
      // An oblique fold compresses the lattice into coherent, slowly moving sheets.
      x += fold * cross * 15;
      y += Math.sin(u * 6 + v * 3 + drift * 0.4) * 11;
      let light = 0;
      for (const wave of waves) {
        const dx = x - wave.x, dy = (y - wave.y) / wave.ellipse;
        const distance = Math.hypot(dx, dy);
        const age = time - wave.born;
        const offset = distance - age * 47;
        const envelope = Math.exp(-offset * offset / 1500) * Math.pow(Math.max(0, 1 - age / 13), 1.5);
        const displacement = Math.sin(offset * 0.065) * envelope * wave.strength;
        x += dx / Math.max(1, distance) * displacement * 17;
        y += dy / Math.max(1, distance) * displacement * 12;
        light += envelope * wave.strength * (0.6 + Math.cos(offset * 0.05) * 0.4);
      }
      const breathe = 0.85 + Math.sin(time * 0.14 + g.phase) * 0.15;
      const opacity = Math.min(0.46, (0.045 + ribbon * 0.27) * depth * hollow * breathe + light * 0.28);
      if (opacity < 0.025) continue;
      const size = 6.6 + g.depth * 2.1;
      field.globalAlpha = opacity;
      field.drawImage(atlas, g.glyph * 12, light > 0.08 ? 14 : 0, 12, 14, x, y, size, size * 14 / 12);
    }
    field.globalAlpha = 1;
  }

  function drawEmblem(time: number) {
    if (!mark) return;
    mark.clearRect(0, 0, symbolSize, symbolSize);
    // Negative Y rotation moves the front surface to the right; the artwork is never mirrored.
    const angle = reduced.matches ? -0.28 : -0.28 - time * 0.15;
    const cy = Math.cos(angle), sy = Math.sin(angle);
    const tilt = -0.16 + Math.sin(time * 0.07) * 0.035;
    const cx = Math.cos(tilt), sx = Math.sin(tilt);
    mark.fillStyle = "#d6e2ef";
    for (const p of points) {
      const rx = p.x * cy + p.z * sy;
      const rz = -p.x * sy + p.z * cy;
      const ry = p.y * cx - rz * sx;
      const z = p.y * sx + rz * cx;
      const perspective = 4.2 / (4.2 + z);
      const facing = p.face === 0 ? 0.5 + Math.abs(sy) * 0.4 : Math.max(0.1, -p.face * cy);
      const light = (p.edge ? 0.55 : 0.3) + facing * 0.34;
      mark.globalAlpha = Math.min(0.94, light * (0.8 - z * 0.16));
      const size = (p.edge ? 1.4 : 1.2) * perspective;
      mark.fillRect(180 + rx * 163 * perspective, 180 + ry * 163 * perspective, size, size);
    }
    mark.globalAlpha = 1;
  }
  function draw() { drawField(elapsed); drawEmblem(elapsed); }
  function resize() {
    width = background.clientWidth;
    height = background.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    background.width = Math.round(width * ratio);
    background.height = Math.round(height * ratio);
    field!.setTransform(ratio, 0, 0, ratio, 0, 0);
    emblem.width = symbolSize;
    emblem.height = symbolSize;
    seed = 41;
    const step = Math.max(6.5, Math.sqrt(width * height / 9000));
    glyphs = [];
    for (let y = -24; y < height + 24; y += step) {
      for (let x = -24; x < width + 24; x += step) {
        glyphs.push({ x: x + random() * 1.5, y: y + random() * 1.5,
          phase: random() * TAU, depth: random(), glyph: Math.floor(random() * alphabet.length) });
      }
    }
    draw();
  }
  function tick(now: number) {
    if (document.hidden || reduced.matches) { frame = 0; previous = 0; return; }
    frame = requestAnimationFrame(tick);
    if (now - previous < 1000 / 25) return;
    if (previous) elapsed += Math.min(0.1, (now - previous) / 1000);
    previous = now;
    if (elapsed > nextWave) {
      waves.push({ x: width * (0.12 + random() * 0.76), y: height * random(),
        born: elapsed, strength: 0.55 + random() * 0.3, ellipse: 0.7 + random() * 0.5 });
      nextWave = elapsed + 6 + random() * 5;
    }
    waves = waves.filter(wave => elapsed - wave.born < 13);
    draw();
  }
  function resume() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previous = 0;
    if (!document.hidden && !reduced.matches) frame = requestAnimationFrame(tick);
    else if (!document.hidden) draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(background);
  document.addEventListener("visibilitychange", resume);
  reduced.addEventListener("change", resume);
  resize(); resume();
  return () => {
    cancelAnimationFrame(frame); observer.disconnect();
    document.removeEventListener("visibilitychange", resume);
    reduced.removeEventListener("change", resume);
  };
}


