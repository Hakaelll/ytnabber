import sourcePoints from "./emblem-points.json";

type Glyph = { x: number; y: number; phase: number; depth: number; glyph: number };
type Wave = { x: number; y: number; born: number; strength: number; ellipse: number };
type Point = { x: number; y: number; z: number; edge: boolean; face: number };
const TAU = Math.PI * 2;
const alphabet = "01aexz{}[]<>/+=:;*";

export function startGraphics(background: HTMLCanvasElement, emblem: HTMLCanvasElement): () => void {
  const field = background.getContext("2d", { alpha: false, willReadFrequently: true });
  const mark = emblem.getContext("2d", { willReadFrequently: true });
  if (!field || !mark) return () => {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const atlas = document.createElement("canvas");
  atlas.width = alphabet.length * 12;
  atlas.height = 28;
  const ink = atlas.getContext("2d", { willReadFrequently: true })!;
  ink.fillStyle = "#fff";
  ink.textBaseline = "top";
  for (let row = 0; row < 2; row++) {
    ink.font = (row ? "9" : "7") + "px Consolas, monospace";
    for (let i = 0; i < alphabet.length; i++) ink.fillText(alphabet[i], i * 12, row * 14);
  }
  const atlasData = ink.getImageData(0, 0, atlas.width, atlas.height).data;
  const masks: { x: number; y: number; coverage: number }[][] = [];
  for (let row = 0; row < 2; row++) for (let glyph = 0; glyph < alphabet.length; glyph++) {
    const mask = [];
    for (let y = 0; y < 14; y++) for (let x = 0; x < 10; x++) {
      const alpha = atlasData[((row * 14 + y) * atlas.width + glyph * 12 + x) * 4 + 3];
      if (alpha > 8) mask.push({ x, y, coverage: Math.max(1, alpha >>> 4) });
    }
    masks.push(mask);
  }
  // Preblend glyph ink once; a frame needs two canvas uploads instead of thousands of draw calls.
  const colors = new Uint32Array(2 * 64 * 16);
  for (let blue = 0; blue < 2; blue++) for (let level = 0; level < 64; level++) for (let coverage = 0; coverage < 16; coverage++) {
    const alpha = level / 128 * coverage / 15;
    const r = Math.round(8 + ((blue ? 155 : 195) - 8) * alpha);
    const g = Math.round(9 + ((blue ? 180 : 199) - 9) * alpha);
    const b = Math.round(10 + ((blue ? 201 : 203) - 10) * alpha);
    colors[(blue * 64 + level) * 16 + coverage] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  let fieldImage: ImageData;
  let fieldPixels: Uint32Array;
  const markImage = mark.createImageData(360, 360);
  const markPixels = new Uint32Array(markImage.data.buffer);
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
  let lastField = -1;
  let glyphs: Glyph[] = [];
  let waves: Wave[] = [];
  let seed = 41;
  const symbolSize = 360;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  function drawField(time: number) {
    if (!field) return;
    fieldPixels.fill(0xff0a0908);
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
      const level = Math.min(63, Math.round(opacity * 128));
      const palette = ((light > 0.08 ? 64 : 0) + level) * 16;
      const mask = masks[g.glyph + (g.depth > 0.55 ? alphabet.length : 0)];
      const left = Math.round(x), top = Math.round(y);
      for (const pixel of mask) {
        const px = left + pixel.x, py = top + pixel.y;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const index = py * width + px;
        const color = colors[palette + pixel.coverage];
        if ((color & 255) > (fieldPixels[index] & 255)) fieldPixels[index] = color;
      }
    }
    field.putImageData(fieldImage, 0, 0);
  }

  function drawEmblem(time: number) {
    if (!mark) return;
    markPixels.fill(0);
    // Negative Y rotation moves the front surface to the right; the artwork is never mirrored.
    const angle = reduced.matches ? -0.28 : -0.28 - time * 0.15;
    const cy = Math.cos(angle), sy = Math.sin(angle);
    const tilt = -0.16 + Math.sin(time * 0.07) * 0.035;
    const cx = Math.cos(tilt), sx = Math.sin(tilt);

    for (const p of points) {
      const rx = p.x * cy + p.z * sy;
      const rz = -p.x * sy + p.z * cy;
      const ry = p.y * cx - rz * sx;
      const z = p.y * sx + rz * cx;
      const perspective = 4.2 / (4.2 + z);
      const facing = p.face === 0 ? 0.5 + Math.abs(sy) * 0.4 : Math.max(0.1, -p.face * cy);
      const light = (p.edge ? 0.55 : 0.3) + facing * 0.34;
      const opacity = Math.min(0.94, light * (0.8 - z * 0.16));
      const x = 180 + rx * 163 * perspective, y = 180 + ry * 163 * perspective;
      const left = Math.floor(x), top = Math.floor(y);
      const fx = x - left, fy = y - top;
      // Bilinear coverage keeps subpixel rotation smooth at the emblem's compact display size.
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const px = left + dx, py = top + dy;
        if (px < 0 || py < 0 || px >= symbolSize || py >= symbolSize) continue;
        const index = py * symbolSize + px;
        const alpha = Math.min(255, Math.round(opacity * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * 460));
        if (alpha > (markPixels[index] >>> 24)) markPixels[index] = (alpha << 24) | 0x00efe2d6;
      }
    }
    mark.putImageData(markImage, 0, 0);
  }
  function draw() {
    if (lastField < 0 || elapsed - lastField >= 0.075 || reduced.matches) {
      drawField(elapsed);
      lastField = elapsed;
    }
    drawEmblem(elapsed);
  }
  function resize() {
    // The atmospheric field stays at logical resolution; high-DPI text sharpness is unnecessary here.
    const scale = Math.min(1, 1000 / background.clientWidth, 1200 / background.clientHeight);
    width = Math.round(background.clientWidth * scale);
    height = Math.round(background.clientHeight * scale);
    background.width = width;
    background.height = height;
    fieldImage = field!.createImageData(width, height);
    fieldPixels = new Uint32Array(fieldImage.data.buffer);
    emblem.width = symbolSize;
    emblem.height = symbolSize;
    seed = 41;
    lastField = -1;
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
