// Living lamp: a port of Braian's Processing sketch (lampara_viva.pde).
// The ESP32 sends light and temperature (0-100); here the pointer stands in for the sensors:
// horizontal position is light, vertical is temperature.
// Markup: .lamp-stage > canvas + [data-lamp-light] [data-lamp-temp] [data-lamp-hint]
(() => {
  function initLamp(stage) {
    const cv = stage.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const lightEl = stage.querySelector('[data-lamp-light]');
    const tempEl = stage.querySelector('[data-lamp-temp]');
    const hintEl = stage.querySelector('[data-lamp-hint]');
    let W = 0, H = 0, img = null;
    function size() {
      // Same cell density as the original 80x80 grid, stretched to the stage's aspect ratio.
      const r = stage.getBoundingClientRect();
      H = 64; W = Math.max(48, Math.min(180, Math.round(H * r.width / Math.max(1, r.height))));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; img = ctx.createImageData(W, H); }
    }

    // Classic Perlin noise, scaled to 0..1 like Processing's noise().
    const p = new Uint8Array(512);
    { const b = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } for (let i = 0; i < 512; i++) p[i] = b[i & 255]; }
    const fade = x => x * x * x * (x * (x * 6 - 15) + 10);
    const lerp = (a, b, x) => a + (b - a) * x;
    const grad = (h, x, y, z) => { const u = (h & 15) < 8 ? x : y, v = (h & 15) < 4 ? y : ((h & 15) === 12 || (h & 15) === 14) ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
    function noise(x, y, z) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
      x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
      const u = fade(x), v = fade(y), w = fade(z);
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      const r = lerp(lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
        lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
      return (r + 1) / 2;
    }

    let light = 72, temp = 8, tLight = 72, tTemp = 8, vLight = 0, vTemp = 0, tt = 0, cur = 0, next = 0, blend = 0, running = false, raf = 0, visible = false;
    const dist = (x, y) => Math.hypot(x - W / 2, y - H / 2);
    function pattern(m, nx, ny, x, y) {
      switch (m) {
        case 0: return noise(nx, ny, tt);
        case 1: return Math.sin(nx * 4 + tt) * Math.cos(ny * 4 + tt);
        case 2: return Math.sin(dist(x, y) * 0.4 + tt);
        case 3: return noise(nx * 2, ny * 2, tt * 1.5);
        case 4: return Math.sin(nx * 3 + Math.sin(tt) * 2);
        case 5: return Math.cos(ny * 4 + tt);
        case 6: return noise(nx + Math.sin(tt) * 2, ny + Math.cos(tt) * 2, tt);
        case 7: return Math.sin((nx + ny) * 4 + tt);
        case 8: return Math.cos(dist(x, y) * 0.3 + tt);
        case 9: return noise(nx * 4, ny * 4, tt * 0.5) * Math.sin(tt);
      }
      return 0;
    }
    // HSB with all channels on a 0..255 scale, as in colorMode(HSB, 255).
    function hsb(h, s, b) {
      h = ((h % 255) + 255) % 255 / 255 * 6; s = Math.max(0, Math.min(1, s / 255)); b = Math.max(0, Math.min(1, b / 255));
      const i = Math.floor(h), f = h - i, P = b * (1 - s), Q = b * (1 - s * f), T = b * (1 - s * (1 - f));
      const c = [[b, T, P], [Q, b, P], [P, b, T], [P, Q, b], [T, P, b], [b, P, Q]][i % 6];
      return [c[0] * 255, c[1] * 255, c[2] * 255];
    }
    // The pointer sets a target; the reading follows on a critically damped spring instead of jumping.
    function follow() {
      const k = 0.06, damp = 2 * Math.sqrt(k);
      vLight += (tLight - light) * k - vLight * damp; light += vLight;
      vTemp += (tTemp - temp) * k - vTemp * damp; temp += vTemp;
      if (Math.abs(vLight) > 0.01 || Math.abs(vTemp) > 0.01) labels();
    }
    function step() {
      if (!img) return;
      follow();
      let ln = light / 100;
      ln = ln < 0.5 ? 0 : (ln - 0.5) / 0.5;
      const stress = ln ** 3;
      tt += stress * 0.3 + 0.004; // small floor so the calm state still breathes
      if (Math.random() < 0.001 + stress * 0.02 && blend === 0) { next = (Math.random() * 10) | 0; blend = 0.001; }
      if (blend > 0) { blend += 0.02; if (blend >= 1) { cur = next; blend = 0; } }
      const hueBase = 25 + (temp / 100) ** 1.5 * 175;
      const sat = 200 - stress * 80;
      const d = img.data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const nx = x * 0.08, ny = y * 0.08;
        const v1 = pattern(cur, nx, ny, x, y);
        const v = blend > 0 ? lerp(v1, pattern(next, nx, ny, x, y), blend) : v1;
        const sh = Math.abs(v) ** 1.8;
        const c = hsb(hueBase + (sh * 80 - 40), sat, sh * 255);
        const o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }
    function loop() { step(); raf = requestAnimationFrame(loop); }
    function start() { if (!running && !reduce && visible && !document.hidden) { running = true; loop(); } }
    function stop() { running = false; cancelAnimationFrame(raf); }
    function labels() {
      const t = window.Site ? window.Site.t : (k => k);
      if (lightEl) lightEl.textContent = `${t('light')} ${Math.round(light)}%`;
      if (tempEl) tempEl.textContent = `${t('temp')} ${Math.round(temp)}%`;
      if (hintEl) hintEl.textContent = t(coarse ? 'lamp.hintTouch' : 'lamp.hint');
    }
    function input(e) {
      const r = stage.getBoundingClientRect();
      tLight = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100));
      tTemp = Math.max(0, Math.min(100, 100 - (e.clientY - r.top) / r.height * 100));
      if (reduce) { light = tLight; temp = tTemp; vLight = vTemp = 0; labels(); step(); }
    }
    stage.addEventListener('pointermove', input);
    stage.addEventListener('pointerdown', input);
    // Touch has no hover: a tap wakes the color for a few seconds.
    let wake = 0;
    const awake = () => { stage.classList.add('awake'); clearTimeout(wake); wake = setTimeout(() => stage.classList.remove('awake'), 4000); };
    stage.addEventListener('pointerdown', awake);
    stage.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') awake(); });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(stage);
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    new ResizeObserver(() => { size(); step(); }).observe(stage);
    size(); step();
    return { labels };
  }

  // Register every stage on the page and keep its labels in the current language.
  window.SITE_HOOKS = window.SITE_HOOKS || [];
  const lamps = [...document.querySelectorAll('.lamp-stage')].map(initLamp);
  window.SITE_HOOKS.push(() => lamps.forEach(l => l.labels()));
})();
