// Shots: small live experiments for /after-hours/. Each one only animates while it is on screen
// and the tab is visible. Under reduced motion nothing loops on its own; pieces still answer to input.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const T = k => (window.Site ? window.Site.t(k) : k);
  const lang = () => (window.Site ? window.Site.lang : 'es');

  // Run `frame(t)` on rAF only while `el` is visible and the page is shown.
  function runner(el, frame) {
    let raf = 0, on = false, vis = false;
    const loop = t => { frame(t); raf = requestAnimationFrame(loop); };
    const start = () => { if (!on && vis && !document.hidden && !reduce) { on = true; raf = requestAnimationFrame(loop); } };
    const stop = () => { on = false; cancelAnimationFrame(raf); };
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; vis ? start() : stop(); }, { rootMargin: '80px' }).observe(el);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    return { start, stop, once: () => frame(performance.now()) };
  }
  function fit(cv, maxDpr = 2) {
    const r = cv.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return d;
  }
  const local = (el, e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
  const fallback = (stage, msg) => { stage.innerHTML = `<p class="shot-fallback">${msg}</p>`; };

  // ---------------------------------------------------------------- WebGL helper
  function glProgram(canvas, frag) {
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
    const fs = sh(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = new Proxy({}, { get: (c, n) => c[n] ?? (c[n] = gl.getUniformLocation(pr, n)) });
    const draw = () => { gl.viewport(0, 0, canvas.width, canvas.height); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    return { gl, u, draw };
  }
  const NOISE = `
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
    float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}`;

  // ---------------------------------------------------------------- 1. Liquid noise shader
  function liquid(stage) {
    const cv = stage.querySelector('canvas');
    const P = glProgram(cv, `precision highp float;uniform vec2 r;uniform float t;uniform vec2 m;uniform float mi;${NOISE}
      void main(){vec2 uv=gl_FragCoord.xy/r;float a=r.x/r.y;vec2 p=uv*vec2(a,1.)*2.4;vec2 mm=m*vec2(a,1.)*2.4;
      float d=length(p-mm);vec2 q=vec2(fbm(p+t*.05),fbm(p+vec2(5.2,1.3)-t*.04));
      q+=mi*.9*exp(-d*d*1.6)*(p-mm);
      float v=fbm(p+2.6*q);v=smoothstep(.18,.86,v);
      float lines=.5+.5*sin(v*46.);float c=mix(v,v*lines,.42);
      c*=1.-.45*length(uv-.5);gl_FragColor=vec4(vec3(c*.9+.03),1.);}`);
    if (!P) return fallback(stage, 'WebGL no disponible.');
    let mx = .5, my = .5, tx = .5, ty = .5, mi = 0, ti = 0;
    stage.addEventListener('pointermove', e => { const l = local(stage, e); tx = l.x / l.w; ty = 1 - l.y / l.h; ti = 1; if (reduce) R.once(); });
    stage.addEventListener('pointerleave', () => { ti = 0; });
    const R = runner(stage, t => {
      fit(cv, 1.5);
      mx += (tx - mx) * .08; my += (ty - my) * .08; mi += (ti - mi) * .05;
      P.gl.uniform2f(P.u.r, cv.width, cv.height); P.gl.uniform1f(P.u.t, reduce ? 12 : t / 1000);
      P.gl.uniform2f(P.u.m, mx, my); P.gl.uniform1f(P.u.mi, mi); P.draw();
    });
    R.once();
  }

  // ---------------------------------------------------------------- 3. Ripples
  function ripples(stage) {
    const cv = stage.querySelector('canvas');
    const N = 6;
    const P = glProgram(cv, `precision highp float;uniform vec2 r;uniform float t;uniform vec3 rp[${N}];
      void main(){vec2 uv=gl_FragCoord.xy/r;float a=r.x/r.y;vec2 p=uv*vec2(a,1.);float disp=0.;
      for(int i=0;i<${N};i++){vec3 q=rp[i];float age=t-q.z;if(age<0.||age>4.)continue;
        float d=length(p-vec2(q.x*a,q.y));float front=age*.42;
        disp+=sin((d-front)*55.)*exp(-abs(d-front)*14.)*exp(-age*.9)*.035;}
      float y=uv.y+disp;float k=abs(fract(y*30.)-.5);
      float line=smoothstep(.06,.0,k-.40)*.0+smoothstep(.47,.5,1.-k);
      float c=mix(.06,.88,smoothstep(.40,.5,k*(1.+abs(disp)*14.)));
      gl_FragColor=vec4(vec3(c),1.);}`);
    if (!P) return fallback(stage, 'WebGL no disponible.');
    const drops = Array.from({ length: N }, () => [0, 0, -99]);
    let k = 0, last = 0, now = 0;
    const drop = (x, y) => { drops[k] = [x, y, now]; k = (k + 1) % N; };
    stage.addEventListener('pointerdown', e => { const l = local(stage, e); drop(l.x / l.w, 1 - l.y / l.h); last = now; if (reduce) R.once(); });
    const R = runner(stage, t => {
      now = t / 1000;
      if (now - last > 2.6) { drop(.2 + Math.random() * .6, .2 + Math.random() * .6); last = now; }
      fit(cv, 1.5);
      P.gl.uniform2f(P.u.r, cv.width, cv.height); P.gl.uniform1f(P.u.t, now);
      P.gl.uniform3fv(P.u.rp, new Float32Array(drops.flat())); P.draw();
    });
    R.once();
  }

  // ---------------------------------------------------------------- Shared sound (only after a user gesture)
  let AC = null;
  const audio = () => { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; } return AC; };
  const noiseBuffer = (ac, secs) => { const b = ac.createBuffer(1, ac.sampleRate * secs, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };

  // ---------------------------------------------------------------- Sticker sounds
  // Peeling adhesive is a crackle, not a hiss: tiny filtered clicks at random, more of them the faster you pull.
  let GRAIN = null;
  function crackle(speed) {
    const ac = audio(); if (!ac) return;
    GRAIN = GRAIN || (() => { const b = ac.createBuffer(1, ac.sampleRate * .006, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); return b; })();
    const n = Math.min(7, Math.round(speed * .45 + Math.random()));
    for (let i = 0; i < n; i++) {
      const t = ac.currentTime + Math.random() * .018;
      const src = ac.createBufferSource(); src.buffer = GRAIN; src.playbackRate.value = .6 + Math.random() * 1.2;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 2600; f.Q.value = 2 + Math.random() * 4;
      const g = ac.createGain(); g.gain.value = (.04 + Math.random() * .2) * Math.min(1, .35 + speed / 18);
      src.connect(f).connect(g).connect(ac.destination); src.start(t);
    }
  }
  function thump(vol = .5) { // pressing a sticker down: a short, muffled knock
    const ac = audio(); if (!ac) return; const t = ac.currentTime;
    const n = ac.createBufferSource(); n.buffer = noiseBuffer(ac, .05);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(140, t + .05);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .07);
    n.connect(lp).connect(g).connect(ac.destination); n.start(t);
    const o = ac.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(60, t + .08);
    const og = ac.createGain(); og.gain.setValueAtTime(vol * .5, t); og.gain.exponentialRampToValueAtTime(.001, t + .09);
    o.connect(og).connect(ac.destination); o.start(t); o.stop(t + .1);
    if (navigator.vibrate) navigator.vibrate(8);
  }

  // ---------------------------------------------------------------- 4. Peel (Pegote's core gesture)
  // The sticker sits on a backing sheet. Pull it and it folds along the line between grab point and finger;
  // pull far enough and it comes off, leaving its die-cut outline on the sheet. Drop it anywhere to stick it.
  function peel(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    let fx = .5, fy = .5, onSheet = true;
    let G = null, Pp = null, tgt = null, vx = 0, vy = 0;
    let mode = 'rest', lift = 0, liftV = 0, tilt = 0, last = null, carryOff = null, hint = true, press = null;
    const geo = () => { const r = Math.min(cv.width, cv.height) * .22; return { cx: fx * cv.width, cy: fy * cv.height, r, hx: cv.width / 2, hy: cv.height / 2 }; };
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    function shadow(blur, oy, a) { const d = dpr(); ctx.shadowColor = `rgba(0,0,0,${a})`; ctx.shadowBlur = blur * d; ctx.shadowOffsetY = oy * d; }
    function sheet() { // backing sheet with the die-cut outline
      const { r, hx, hy } = geo(), w = r * 3.1, h = r * 3.1, rr = r * .22;
      ctx.save(); shadow(18, 8, .5);
      ctx.beginPath(); ctx.roundRect(hx - w / 2, hy - h / 2, w, h, rr); ctx.fillStyle = '#2a2a2d'; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, r + 2 * dpr(), 0, Math.PI * 2); ctx.fillStyle = '#232326'; ctx.fill();
      ctx.setLineDash([4 * dpr(), 4 * dpr()]); ctx.strokeStyle = 'rgba(237,237,235,.18)'; ctx.lineWidth = 1 * dpr(); ctx.stroke(); ctx.restore();
      ctx.fillStyle = 'rgba(237,237,235,.35)'; ctx.font = `${Math.round(r * .11)}px "Geist Mono", monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('PEGOTE · Nº 01', hx - w / 2 + rr * .7, hy + h / 2 - rr * .6);
    }
    function face(cx, cy, r) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#ededea'; ctx.fill();
      ctx.lineWidth = r * .035; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.fillStyle = '#0b0b0c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${r * .24}px Geist, sans-serif`; ctx.fillText(lang() === 'en' ? 'peel me' : 'despegame', cx, cy);
    }
    function flat(cx, cy, r) { ctx.save(); shadow(onSheet ? 3 : 10, onSheet ? 1 : 4, .4); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#ededea'; ctx.fill(); ctx.restore(); face(cx, cy, r); }
    function draw() {
      fit(cv); const { cx, cy, r } = geo();
      ctx.clearRect(0, 0, cv.width, cv.height); sheet();
      if (mode === 'carry' || mode === 'drop') {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt); const k = 1 + lift * .07; ctx.scale(k, k); ctx.translate(-cx, -cy);
        ctx.save(); shadow(10 + lift * 34, 4 + lift * 22, .35 + lift * .25); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#ededea'; ctx.fill(); ctx.restore();
        face(cx, cy, r); ctx.restore(); return;
      }
      if (!G || !Pp || Math.hypot(Pp.x - G.x, Pp.y - G.y) < 1) { flat(cx, cy, r); return; }
      const mx = (G.x + Pp.x) / 2, my = (G.y + Pp.y) / 2;
      let nx = Pp.x - G.x, ny = Pp.y - G.y; const L = Math.hypot(nx, ny); nx /= L; ny /= L;
      const BIG = Math.max(cv.width, cv.height) * 4, tx = -ny, ty = nx;
      const half = sign => {
        ctx.beginPath();
        ctx.moveTo(mx + tx * BIG, my + ty * BIG); ctx.lineTo(mx - tx * BIG, my - ty * BIG);
        ctx.lineTo(mx - tx * BIG + nx * BIG * sign, my - ty * BIG + ny * BIG * sign);
        ctx.lineTo(mx + tx * BIG + nx * BIG * sign, my + ty * BIG + ny * BIG * sign); ctx.closePath();
      };
      ctx.save(); half(1); ctx.clip(); flat(cx, cy, r); ctx.restore();
      const dot = mx * nx + my * ny;
      ctx.save();
      ctx.transform(1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, 2 * dot * nx, 2 * dot * ny);
      half(-1); ctx.clip();
      shadow(22, 10, .55);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(mx, my, mx - nx * r, my - ny * r);
      g.addColorStop(0, '#d6d6d2'); g.addColorStop(1, '#a9a9a5');
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
    }
    runner(stage, () => {
      const { cx, cy, r } = geo();
      if (mode === 'peel' && tgt) { Pp.x += (tgt.x - Pp.x) * .55; Pp.y += (tgt.y - Pp.y) * .55; }
      if (mode === 'rest' && G && Pp) {
        const ax = (G.x - Pp.x) * .18 - vx * .5, ay = (G.y - Pp.y) * .18 - vy * .5;
        vx += ax; vy += ay; Pp.x += vx; Pp.y += vy;
        if (Math.hypot(G.x - Pp.x, G.y - Pp.y) < .5 && Math.hypot(vx, vy) < .5) { G = Pp = null; thump(.25); }
      }
      if (mode === 'carry' && tgt) {
        const nfx = (tgt.x - carryOff.x) / cv.width, nfy = (tgt.y - carryOff.y) / cv.height;
        const dx = (nfx - fx) * cv.width; fx += (nfx - fx) * .4; fy += (nfy - fy) * .4;
        tilt += ((Math.max(-1, Math.min(1, dx / (r * 1.2))) * .22) - tilt) * .2; lift += (1 - lift) * .25;
      }
      if (mode === 'drop') {
        liftV += (0 - lift) * .3 - liftV * .42; lift += liftV; tilt *= .78;
        if (Math.abs(lift) < .004 && Math.abs(liftV) < .004) { lift = 0; tilt = 0; mode = 'rest'; }
      }
      if (hint && mode === 'rest' && !G && !reduce) {
        const s = (performance.now() % 3600) / 3600, k = Math.max(0, Math.sin(s * Math.PI * 2)) ** 3 * .28;
        if (k > .002) { const a = -0.75; G = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; Pp = { x: G.x - Math.cos(a) * r * k, y: G.y - Math.sin(a) * r * k }; draw(); G = Pp = null; return; }
      }
      draw();
    });
    stage.addEventListener('pointerdown', e => {
      const d = fit(cv); const l = local(stage, e); const x = l.x * d, y = l.y * d; const { cx, cy, r } = geo();
      if (Math.hypot(x - cx, y - cy) > r * 1.3) return;
      audio(); hint = false; stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing';
      const a = Math.atan2(y - cy, (x - cx) || 1e-3);
      G = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; Pp = { x: G.x, y: G.y }; tgt = { x, y }; vx = vy = 0;
      mode = 'peel'; last = { x, y, t: performance.now() }; press = { x, y };
      if (reduce) { Pp = { x, y }; draw(); }
    });
    stage.addEventListener('pointermove', e => {
      if (mode !== 'peel' && mode !== 'carry') return;
      const d = fit(cv); const l = local(stage, e); const x = l.x * d, y = l.y * d; const { cx, cy, r } = geo();
      const now = performance.now(), speed = last ? Math.hypot(x - last.x, y - last.y) / d / Math.max(1, now - last.t) * 16 : 0; last = { x, y, t: now };
      tgt = { x, y };
      if (mode === 'peel') {
        crackle(speed);
        // measured from where the finger went down, so the fold is always visible before it comes off
        if (Math.hypot(x - press.x, y - press.y) > r * 1.25) { // it comes off
          mode = 'carry'; onSheet = false; G = Pp = null; carryOff = { x: x - cx, y: y - cy }; lift = .5; crackle(20);
        }
      }
      if (reduce) { if (mode === 'peel') Pp = { x, y }; else { fx = (x - carryOff.x) / cv.width; fy = (y - carryOff.y) / cv.height; lift = 1; } draw(); }
    });
    const up = () => {
      stage.style.cursor = 'grab';
      if (mode === 'carry') {
        const { r, hx, hy } = geo();
        // dropped back over its outline: it snaps home onto the sheet
        if (Math.hypot(fx * cv.width - hx, fy * cv.height - hy) < r * .6) { fx = .5; fy = .5; onSheet = true; }
        const mxr = r / cv.width + .02, myr = r / cv.height + .02;
        fx = Math.min(1 - mxr, Math.max(mxr, fx)); fy = Math.min(1 - myr, Math.max(myr, fy));
        mode = 'drop'; liftV = -.06; thump();
        if (reduce) { mode = 'rest'; lift = 0; tilt = 0; draw(); }
      } else if (mode === 'peel') { mode = 'rest'; if (reduce) { G = Pp = null; draw(); } }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('dblclick', () => { fx = .5; fy = .5; onSheet = true; mode = 'rest'; G = Pp = null; draw(); });
    new ResizeObserver(draw).observe(stage);
    draw();
    window.SITE_HOOKS.push(() => draw());
  }

  // ---------------------------------------------------------------- 5. Magnetic dot grid
  function grid(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    let dots = [], mx = -1e4, my = -1e4, d = 1, W = 0, H = 0;
    function build() {
      d = fit(cv); W = cv.width; H = cv.height; dots = [];
      const gap = 22 * d;
      for (let y = gap / 2; y < H; y += gap) for (let x = gap / 2; x < W; x += gap) dots.push({ x, y, ox: 0, oy: 0, vx: 0, vy: 0 });
    }
    new ResizeObserver(build).observe(stage); build();
    stage.addEventListener('pointermove', e => { const l = local(stage, e); mx = l.x * d; my = l.y * d; if (reduce) step(); });
    stage.addEventListener('pointerleave', () => { mx = my = -1e4; if (reduce) step(); });
    function step() {
      ctx.clearRect(0, 0, W, H);
      const R = 120 * d;
      for (const p of dots) {
        const dx = p.x - mx, dy = p.y - my, dist = Math.hypot(dx, dy);
        let tx = 0, ty = 0, near = 0;
        if (dist < R) { near = 1 - dist / R; const f = near * near * 30 * d; tx = dx / (dist || 1) * f; ty = dy / (dist || 1) * f; }
        if (reduce) { p.ox = tx; p.oy = ty; } else { p.vx += (tx - p.ox) * .12; p.vy += (ty - p.oy) * .12; p.vx *= .78; p.vy *= .78; p.ox += p.vx; p.oy += p.vy; }
        const a = .28 + near * .7;
        ctx.fillStyle = `rgba(237,237,235,${a})`;
        ctx.beginPath(); ctx.arc(p.x + p.ox, p.y + p.oy, (1.4 + near * 1.6) * d, 0, Math.PI * 2); ctx.fill();
      }
    }
    runner(stage, step); step();
  }

  // ---------------------------------------------------------------- 6. Text particles
  function particles(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    let pts = [], d = 1, W = 0, H = 0, mx = -1e4, my = -1e4, word = '';
    function build() {
      d = fit(cv); W = cv.width; H = cv.height;
      word = 'Braian';
      const off = document.createElement('canvas'); off.width = W; off.height = H; const o = off.getContext('2d');
      let fs = H * .5; o.font = `600 ${fs}px Geist, sans-serif`;
      const tw = o.measureText(word).width; if (tw > W * .82) { fs *= W * .82 / tw; o.font = `600 ${fs}px Geist, sans-serif`; }
      o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(word, W / 2, H / 2);
      const data = o.getImageData(0, 0, W, H).data; const step = Math.max(3, Math.round(4 * d));
      const old = pts; pts = [];
      for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 128) {
        const prev = old[pts.length];
        pts.push({ hx: x, hy: y, x: prev ? prev.x : Math.random() * W, y: prev ? prev.y : Math.random() * H, vx: 0, vy: 0 });
      }
      if (reduce) pts.forEach(p => { p.x = p.hx; p.y = p.hy; });
    }
    new ResizeObserver(() => { build(); if (reduce) step(); }).observe(stage);
    if (document.fonts) document.fonts.ready.then(() => { build(); if (reduce) step(); });
    stage.addEventListener('pointermove', e => { const l = local(stage, e); mx = l.x * d; my = l.y * d; if (reduce) step(); });
    stage.addEventListener('pointerleave', () => { mx = my = -1e4; if (reduce) step(); });
    function step() {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(237,237,235,.9)';
      const R = 70 * d, s = 1.6 * d;
      for (const p of pts) {
        const dx = p.x - mx, dy = p.y - my, dist = Math.hypot(dx, dy);
        if (dist < R) { const f = (1 - dist / R) * 6 * d; p.vx += dx / (dist || 1) * f; p.vy += dy / (dist || 1) * f; }
        if (!reduce) { p.vx += (p.hx - p.x) * .045; p.vy += (p.hy - p.y) * .045; p.vx *= .84; p.vy *= .84; p.x += p.vx; p.y += p.vy; }
        else if (dist < R) { p.x = p.hx + p.vx; p.y = p.hy + p.vy; p.vx = p.vy = 0; } else { p.x = p.hx; p.y = p.hy; }
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    runner(stage, step);
  }

  // ---------------------------------------------------------------- 7. Bubble wrap
  function bubbles(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    let cells = [], d = 1, W = 0, H = 0, R = 0, popped = 0;
    const counter = stage.querySelector('[data-count]');
    function build() {
      d = fit(cv); W = cv.width; H = cv.height; cells = []; popped = 0;
      R = Math.max(16, Math.min(W, H) / 9);
      const dx = R * 2.2, dy = R * 1.95;
      for (let row = 0, y = R * 1.3; y < H - R * .6; y += dy, row++) for (let x = R * 1.3 + (row % 2) * dx / 2; x < W - R * .6; x += dx) cells.push({ x, y, p: 0, t: 0 });
      label(); paint();
    }
    function label() { if (counter) counter.textContent = `${popped}/${cells.length}`; }
    function pop() {
      try {
        const ac = audio(); if (!ac) return; const t = ac.currentTime, len = .06;
        const b = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), ch = b.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 6);
        const src = ac.createBufferSource(); src.buffer = b;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 900; f.Q.value = 1.2;
        const g = ac.createGain(); g.gain.value = .5;
        src.connect(f).connect(g).connect(ac.destination); src.start(t);
      } catch (e) { /* sound is optional */ }
      if (navigator.vibrate) navigator.vibrate(8);
    }
    function paint() {
      ctx.clearRect(0, 0, W, H);
      for (const c of cells) {
        const k = c.p; // 0 = full bubble, 1 = popped
        const g = ctx.createRadialGradient(c.x - R * .35, c.y - R * .4, R * .1, c.x, c.y, R);
        g.addColorStop(0, `rgba(255,255,255,${.55 * (1 - k)})`); g.addColorStop(.6, `rgba(237,237,235,${.12 + .05 * (1 - k)})`); g.addColorStop(1, 'rgba(237,237,235,.05)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, R * (1 - k * .12), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(237,237,235,${.18 + .12 * (1 - k)})`; ctx.lineWidth = 1 * d; ctx.stroke();
        if (k > .5) { ctx.strokeStyle = 'rgba(237,237,235,.25)'; ctx.beginPath(); ctx.moveTo(c.x - R * .35, c.y - R * .1); ctx.lineTo(c.x + R * .1, c.y + R * .2); ctx.lineTo(c.x + R * .35, c.y - R * .15); ctx.stroke(); }
      }
    }
    let anim = false;
    function tick() {
      let busy = false;
      for (const c of cells) if (c.t && c.p < 1) { c.p = Math.min(1, c.p + .16); busy = true; }
      paint(); if (busy) requestAnimationFrame(tick); else anim = false;
    }
    stage.addEventListener('pointerdown', e => {
      const l = local(stage, e); const x = l.x * d, y = l.y * d;
      const c = cells.find(c => !c.t && Math.hypot(c.x - x, c.y - y) < R);
      if (!c) return;
      c.t = 1; popped++; label(); pop();
      if (reduce) { c.p = 1; paint(); } else if (!anim) { anim = true; requestAnimationFrame(tick); }
      if (popped === cells.length) setTimeout(build, 900);
    });
    new ResizeObserver(build).observe(stage); build();
  }

  // ---------------------------------------------------------------- Rocket: hold to count down, release to launch
  function rocket(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    const read = stage.querySelector('[data-rocket-read]');
    let mode = 'idle', charge = 0, y = 0, vy = 0, x = .5, vx = 0, alt = 0, t0 = 0, smoke = [], stars = [], chute = 0, aimX = .5;
    let rumble = null;
    const say = k => { if (read) read.textContent = T(k); };
    function engine(on, level = 1) {
      const ac = audio(); if (!ac) return;
      if (on && !rumble) {
        const src = ac.createBufferSource(); src.buffer = noiseBuffer(ac, 1); src.loop = true;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
        const g = ac.createGain(); g.gain.value = 0; src.connect(lp).connect(g).connect(ac.destination); src.start(); rumble = { src, lp, g };
      }
      if (!rumble) return;
      rumble.g.gain.setTargetAtTime(on ? .08 + level * .3 : 0, ac.currentTime, on ? .05 : .4);
      rumble.lp.frequency.setTargetAtTime(250 + level * 900, ac.currentTime, .1);
      if (!on) { const r = rumble; rumble = null; setTimeout(() => r.src.stop(), 1600); }
    }
    function puff(px, py, n, spread, up) {
      for (let i = 0; i < n; i++) smoke.push({ x: px + (Math.random() - .5) * spread * .3, y: py, vx: (Math.random() - .5) * spread, vy: up * (Math.random() * 1.5 + .5), r: 4 + Math.random() * 8, a: .5 + Math.random() * .3 });
    }
    function drawRocket(cx, cy, s, flame, angle) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(s, s);
      if (flame > 0) { // flame: layered teardrops that flicker
        for (let i = 0; i < 3; i++) {
          const len = (18 + flame * 46) * (1 - i * .28) * (.85 + Math.random() * .3), w = 9 - i * 2.5;
          ctx.beginPath(); ctx.moveTo(-w, 30); ctx.quadraticCurveTo(0, 30 + len * 1.3, w, 30); ctx.closePath();
          ctx.fillStyle = `rgba(${237 - i * 10},${237 - i * 10},${235 - i * 10},${.35 + i * .25})`; ctx.fill();
        }
      }
      ctx.fillStyle = '#ededea';
      ctx.beginPath(); ctx.moveTo(-11, 26); ctx.lineTo(-11, -14); ctx.quadraticCurveTo(-11, -40, 0, -52); ctx.quadraticCurveTo(11, -40, 11, -14); ctx.lineTo(11, 26); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-11, 8); ctx.lineTo(-22, 30); ctx.lineTo(-11, 26); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(11, 8); ctx.lineTo(22, 30); ctx.lineTo(11, 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.arc(0, -16, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function frame(now) {
      const d = fit(cv), W = cv.width, H = cv.height, s = Math.min(W, H) / 330;
      const pad = H * .86;
      ctx.clearRect(0, 0, W, H);
      const dt = Math.min(3, (now - (t0 || now)) / 16.7); t0 = now;
      // stars stream past once the rocket is high
      const speedLines = mode === 'flying' ? Math.min(1, alt / 3) : 0;
      if (stars.length < 60) for (let i = stars.length; i < 60; i++) stars.push({ x: Math.random(), y: Math.random(), z: Math.random() });
      for (const st of stars) {
        st.y += (.0006 + speedLines * .02) * (st.z + .3) * dt; if (st.y > 1) { st.y = 0; st.x = Math.random(); }
        ctx.fillStyle = `rgba(237,237,235,${.15 + st.z * .35})`;
        ctx.fillRect(st.x * W, st.y * H, 1.2 * d, (1.2 + speedLines * 26 * st.z) * d);
      }
      // pad
      ctx.fillStyle = '#2a2a2d'; ctx.fillRect(W * .3, pad, W * .4, 3 * d);
      let rx = x * W, ry = pad - 30 * s + y, flame = 0, angle = 0;
      if (mode === 'charging') {
        charge = Math.min(1, charge + .012 * dt);
        rx += (Math.random() - .5) * charge * 5 * d; flame = charge * .35;
        if (Math.random() < .6) puff(rx, pad, 2, 3 * d * (1 + charge * 3), -.3);
        say(charge < .34 ? 'rk.3' : charge < .67 ? 'rk.2' : charge < 1 ? 'rk.1' : 'rk.go');
        engine(true, charge * .5);
        if (charge >= 1) launch();
      } else if (mode === 'flying') {
        vy -= (.16 + charge * .22) * s * dt; y += vy * dt; alt += -vy * .004 * dt;
        vx += ((aimX - x) * .002 - vx * .05) * dt; x += vx * dt; angle = vx * 18;
        flame = 1; puff(rx, ry + 30 * s, 2, 2 * d, 2 * d);
        if (read) read.textContent = `${T('rk.alt')} ${alt.toFixed(1)} km`;
        if (ry < -120 * s && alt > 6) { mode = 'away'; t0 = now; engine(false); setTimeout(() => { if (mode === 'away') { mode = 'chute'; y = -(pad + 60 * s); vy = 0; x = .5; vx = 0; chute = 0; say('rk.back'); } }, 1400); }
      } else if (mode === 'chute') {
        chute = Math.min(1, chute + .03 * dt); vy = 1.1 * s; y += vy * dt; angle = Math.sin(now / 500) * .08;
        if (y >= 0) { y = 0; mode = 'idle'; charge = 0; alt = 0; puff(rx, pad, 18, 6 * d, -.5); say('rk.idle'); }
      }
      // smoke
      for (const p of smoke) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.r += .35 * dt * d; p.a -= .012 * dt; }
      smoke = smoke.filter(p => p.a > 0).slice(-220);
      for (const p of smoke) { ctx.fillStyle = `rgba(200,200,196,${p.a * .5})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * d * .6, 0, Math.PI * 2); ctx.fill(); }
      if (mode !== 'away') {
        rx = x * W; ry = pad - 30 * s + y;
        if (mode === 'chute') { // parachute
          ctx.strokeStyle = 'rgba(237,237,235,.5)'; ctx.lineWidth = 1 * d;
          const cy2 = ry - 52 * s - 40 * s * chute;
          ctx.beginPath(); ctx.moveTo(rx - 10 * s, ry - 40 * s); ctx.lineTo(rx - 34 * s * chute, cy2); ctx.moveTo(rx + 10 * s, ry - 40 * s); ctx.lineTo(rx + 34 * s * chute, cy2); ctx.stroke();
          ctx.fillStyle = '#d4d4d0'; ctx.beginPath(); ctx.ellipse(rx, cy2, 36 * s * chute, 20 * s * chute, 0, Math.PI, 0); ctx.fill();
        }
        drawRocket(rx, ry, s, flame, angle);
      }
    }
    function launch() { if (mode !== 'charging') return; mode = 'flying'; vy = -2 * (window.devicePixelRatio || 1); puff(x * cv.width, cv.height * .86, 40, 7, -.6); engine(true, 1); }
    const R = runner(stage, frame);
    stage.addEventListener('pointerdown', e => { if (mode !== 'idle') return; audio(); mode = 'charging'; charge = 0; stage.setPointerCapture(e.pointerId); if (reduce) { say('rk.go'); } });
    stage.addEventListener('pointermove', e => { const l = local(stage, e); aimX = Math.max(.15, Math.min(.85, l.x / l.w)); });
    const release = () => { if (mode === 'charging') { if (charge > .2) launch(); else { mode = 'idle'; engine(false); say('rk.idle'); } } };
    stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
    stage.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && mode === 'idle') { e.preventDefault(); audio(); mode = 'charging'; charge = 0; } });
    stage.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') release(); });
    window.SITE_HOOKS.push(() => { if (mode === 'idle') say('rk.idle'); });
    R.once();
  }

  // ---------------------------------------------------------------- Jelly with a face
  function jelly(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    const N = 28; let pts = [], cx = 0, cy = 0, R0 = 0, drag = null, mx = null, my = null, stretch = 0, blink = 0;
    function build() {
      fit(cv); cx = cv.width / 2; cy = cv.height * .54; R0 = Math.min(cv.width, cv.height) * .26;
      pts = Array.from({ length: N }, (_, i) => { const a = i / N * Math.PI * 2; return { a, x: cx + Math.cos(a) * R0, y: cy + Math.sin(a) * R0, vx: 0, vy: 0 }; });
    }
    function boing() {
      const ac = audio(); if (!ac) return; const t = ac.currentTime;
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(140, t + .35);
      const lfo = ac.createOscillator(); lfo.frequency.value = 18; const lg = ac.createGain(); lg.gain.value = 22; lfo.connect(lg).connect(o.frequency);
      const g = ac.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.22, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .45);
      o.connect(g).connect(ac.destination); o.start(t); lfo.start(t); o.stop(t + .5); lfo.stop(t + .5);
    }
    function step(now) {
      const d = fit(cv); const W = cv.width, H = cv.height;
      if (!pts.length) build();
      // physics: each point is pulled toward its rest spot around the current center, plus neighbor springs
      let sx = 0, sy = 0; pts.forEach(p => { sx += p.x; sy += p.y; }); const ccx = sx / N, ccy = sy / N;
      const homeX = cx + (ccx - cx) * .0, homeY = cy;
      pts.forEach((p, i) => {
        if (drag && drag.i === i) return;
        const rx = homeX + Math.cos(p.a) * R0, ry = homeY + Math.sin(p.a) * R0;
        p.vx += (rx - p.x) * .035; p.vy += (ry - p.y) * .035;
        const a = pts[(i + 1) % N], b = pts[(i + N - 1) % N];
        p.vx += ((a.x + b.x) / 2 - p.x) * .12; p.vy += ((a.y + b.y) / 2 - p.y) * .12;
        if (mx !== null && !drag) { const dx = p.x - mx, dy = p.y - my, dist = Math.hypot(dx, dy); if (dist < R0 * .5) { const f = (1 - dist / (R0 * .5)) * 1.6 * d; p.vx += dx / (dist || 1) * f; p.vy += dy / (dist || 1) * f; } }
        p.vx *= .9; p.vy *= .9; p.x += p.vx; p.y += p.vy;
      });
      if (drag) { const p = pts[drag.i]; p.x += (drag.x - p.x) * .5; p.y += (drag.y - p.y) * .5; }
      stretch = Math.max(0, Math.min(1, (Math.max(...pts.map(p => Math.hypot(p.x - ccx, p.y - ccy))) / R0 - 1.15) * 1.5));
      ctx.clearRect(0, 0, W, H);
      // shadow on the floor
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(ccx, cy + R0 * 1.12, R0 * .9, R0 * .14, 0, 0, Math.PI * 2); ctx.fill();
      // body: smooth closed curve through the midpoints
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const p = pts[i % N], q = pts[(i + 1) % N]; const mx2 = (p.x + q.x) / 2, my2 = (p.y + q.y) / 2; if (i === 0) ctx.moveTo(mx2, my2); else ctx.quadraticCurveTo(p.x, p.y, mx2, my2); }
      const g = ctx.createRadialGradient(ccx - R0 * .35, ccy - R0 * .45, R0 * .1, ccx, ccy, R0 * 1.3);
      g.addColorStop(0, '#f5f5f2'); g.addColorStop(.55, '#d9d9d5'); g.addColorStop(1, '#a8a8a4');
      ctx.fillStyle = g; ctx.fill();
      // face: eyes follow the pointer, the mouth opens when stretched
      const lx = mx ?? ccx, ly = my ?? (ccy - R0);
      const ex = Math.max(-1, Math.min(1, (lx - ccx) / (R0 * 2))), ey = Math.max(-1, Math.min(1, (ly - ccy) / (R0 * 2)));
      blink = (now % 4200) < 120 ? 1 : 0;
      [-1, 1].forEach(side => {
        const ox = ccx + side * R0 * .3, oy = ccy - R0 * .12;
        ctx.fillStyle = '#0b0b0c';
        if (blink) { ctx.fillRect(ox - R0 * .07, oy, R0 * .14, 2 * d); return; }
        ctx.beginPath(); ctx.ellipse(ox + ex * R0 * .06, oy + ey * R0 * .06, R0 * (.07 + stretch * .03), R0 * (.09 + stretch * .05), 0, 0, Math.PI * 2); ctx.fill();
      });
      ctx.strokeStyle = '#0b0b0c'; ctx.fillStyle = '#0b0b0c'; ctx.lineWidth = 2.2 * d; ctx.lineCap = 'round';
      if (stretch > .25) { ctx.beginPath(); ctx.ellipse(ccx, ccy + R0 * .22, R0 * .08 * stretch + R0 * .03, R0 * .12 * stretch + R0 * .03, 0, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(ccx, ccy + R0 * .12, R0 * .14, .2 * Math.PI, .8 * Math.PI); ctx.stroke(); }
    }
    stage.addEventListener('pointerdown', e => {
      const d = fit(cv); const l = local(stage, e); const x = l.x * d, y = l.y * d;
      let best = -1, bd = Infinity; pts.forEach((p, i) => { const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = i; } });
      if (bd > R0 * .9) return; audio(); drag = { i: best, x, y }; stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing';
    });
    stage.addEventListener('pointermove', e => { const d = fit(cv); const l = local(stage, e); mx = l.x * d; my = l.y * d; if (drag) { drag.x = mx; drag.y = my; } if (reduce) step(performance.now()); });
    stage.addEventListener('pointerleave', () => { if (!drag) mx = my = null; });
    const up = () => { if (!drag) return; drag = null; stage.style.cursor = 'grab'; if (stretch > .1) boing(); };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    new ResizeObserver(() => { build(); step(performance.now()); }).observe(stage);
    runner(stage, step);
  }

  // ---------------------------------------------------------------- 8. Hold to confirm
  function hold(stage) {
    const b = stage.querySelector('.hold'); let timer = 0;
    const start = e => { if (b.classList.contains('done')) return; if (e && e.type === 'keydown' && (e.repeat || (e.key !== ' ' && e.key !== 'Enter'))) return; if (e) e.preventDefault(); b.classList.add('holding'); timer = setTimeout(done, reduce ? 900 : 1400); };
    const cancel = () => { clearTimeout(timer); if (!b.classList.contains('done')) b.classList.remove('holding'); };
    const done = () => { b.classList.add('done'); b.classList.remove('holding'); setTimeout(() => b.classList.remove('done'), 1800); };
    b.addEventListener('pointerdown', start); b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel); b.addEventListener('pointercancel', cancel);
    b.addEventListener('keydown', start); b.addEventListener('keyup', cancel);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------------------------------------------------------------- 9. Scramble
  function scramble(stage) {
    const el = stage.querySelector('.scramble'); const glyphs = '▖▗▘▙▚▛▜▝▞▟/\\|-_+*#<>';
    let running = 0;
    function run() {
      const text = T('sh.scramble.text');
      el.setAttribute('aria-label', text);
      if (reduce) { el.textContent = text; return; }
      const id = ++running; const start = performance.now(); const chars = [...text];
      const f = now => {
        if (id !== running) return;
        const t = now - start; let out = '', doneAll = true;
        chars.forEach((ch, i) => {
          const reveal = i * 28 + 260;
          if (t >= reveal || ch === ' ') out += ch.replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s]));
          else { doneAll = false; out += `<span class="g">${glyphs[(Math.random() * glyphs.length) | 0].replace('<', '&lt;').replace('>', '&gt;')}</span>`; }
        });
        el.innerHTML = out;
        if (!doneAll) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    }
    stage.addEventListener('pointerenter', run); stage.addEventListener('pointerdown', run); el.addEventListener('focus', run);
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { run(); o.disconnect(); } }, { threshold: .6 }).observe(stage);
    window.SITE_HOOKS.push(() => { el.textContent = T('sh.scramble.text'); });
  }

  // ---------------------------------------------------------------- 10. Spring toggle
  function toggle(stage) {
    const sw = stage.querySelector('.sw'), th = sw.querySelector('.thumb'), st = stage.querySelector('.sw-state');
    const travel = () => sw.clientWidth - th.offsetWidth - 12;
    let on = false, x = 0, v = 0, target = 0, raf = 0, drag = null, moved = false;
    const paint = () => {
      const k = Math.max(0, Math.min(1, x / travel()));
      th.style.transform = `translateX(${x}px) scaleX(${drag ? 1.12 : 1})`;
      sw.style.backgroundColor = `rgb(${42 + k * 195},${42 + k * 195},${45 + k * 190})`;
      th.style.backgroundColor = k > .5 ? '#0b0b0c' : '#ededeb';
    };
    const animate = () => {
      cancelAnimationFrame(raf);
      if (reduce) { x = target; v = 0; paint(); return; }
      const f = () => { // spring with a little overshoot
        const a = (target - x) * .2 - v * .38; v += a; x += v; paint();
        if (Math.abs(target - x) > .2 || Math.abs(v) > .2) raf = requestAnimationFrame(f); else { x = target; paint(); }
      };
      raf = requestAnimationFrame(f);
    };
    const set = val => { on = val; target = on ? travel() : 0; sw.setAttribute('aria-checked', String(on)); st.textContent = T(on ? 'sh.toggle.on' : 'sh.toggle.off'); animate(); };
    sw.addEventListener('pointerdown', e => { drag = { sx: e.clientX, x0: x, last: e.clientX, lt: performance.now(), vel: 0 }; moved = false; sw.setPointerCapture(e.pointerId); paint(); });
    sw.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.sx; if (Math.abs(dx) > 3) moved = true;
      const now = performance.now(); drag.vel = (e.clientX - drag.last) / Math.max(1, now - drag.lt); drag.last = e.clientX; drag.lt = now;
      x = Math.max(-8, Math.min(travel() + 8, drag.x0 + dx)); cancelAnimationFrame(raf); paint();
    });
    const end = () => {
      if (!drag) return; const vel = drag.vel; drag = null;
      if (!moved) set(!on); else set(Math.abs(vel) > .3 ? vel > 0 : x > travel() / 2);
    };
    sw.addEventListener('pointerup', end); sw.addEventListener('pointercancel', end);
    sw.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set(!on); } });
    new ResizeObserver(() => { target = on ? travel() : 0; x = target; paint(); }).observe(sw);
    window.SITE_HOOKS.push(() => { st.textContent = T(on ? 'sh.toggle.on' : 'sh.toggle.off'); });
    set(false);
  }

  // ---------------------------------------------------------------- 11. Clip-path tabs
  function tabs(stage) {
    const wrap = stage.querySelector('.ctabs'), list = wrap.querySelector('.list'), copy = wrap.querySelector('.copy');
    let active = 0;
    const sync = () => {
      copy.innerHTML = ''; const c = list.cloneNode(true); c.classList.remove('list');
      c.querySelectorAll('button').forEach(b => { b.tabIndex = -1; b.removeAttribute('aria-selected'); b.removeAttribute('role'); }); c.setAttribute('aria-hidden', 'true'); copy.appendChild(c); place();
    };
    const place = () => {
      const btns = list.querySelectorAll('button'); const b = btns[active];
      btns.forEach((x, i) => x.setAttribute('aria-selected', String(i === active)));
      const l = b.offsetLeft - list.offsetLeft, r = list.offsetWidth - l - b.offsetWidth;
      copy.style.clipPath = `inset(0 ${r}px 0 ${l}px round 999px)`;
    };
    list.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => { active = i; place(); }));
    list.addEventListener('keydown', e => {
      const n = list.querySelectorAll('button').length;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { active = (active + (e.key === 'ArrowRight' ? 1 : n - 1)) % n; list.querySelectorAll('button')[active].focus(); place(); }
    });
    new ResizeObserver(place).observe(list);
    window.SITE_HOOKS.push(() => requestAnimationFrame(sync));
    sync();
  }

  // ---------------------------------------------------------------- 12. Copy with state
  function copy(stage) {
    const b = stage.querySelector('button'); let t = 0;
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText('braianarroyobraconi@gmail.com'); } catch (e) { /* the state change is the demo */ }
      b.setAttribute('data-copied', ''); clearTimeout(t); t = setTimeout(() => b.removeAttribute('data-copied'), 1600);
    });
  }

  // ---------------------------------------------------------------- Pause for recruiters
  function pause(root) {
    const btn = root.querySelector('[data-pause-start]'), circle = root.querySelector('.pause-circle'), say = root.querySelector('.pause-say'), bar = root.querySelector('.pause-bar i');
    const phases = [['pause.in', 4000, 1], ['pause.hold', 3000, 1], ['pause.out', 6000, 0]];
    const cycles = 2; let timers = [], running = false, sayKey = 'pause.ready';
    const show = k => { sayKey = k; say.textContent = T(k); };
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    function start() {
      clear(); running = true; root.classList.add('running'); root.classList.remove('finished');
      btn.textContent = T('pause.stop');
      let at = 0; const total = phases.reduce((s, p) => s + p[1], 0) * cycles;
      bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)';
      requestAnimationFrame(() => { bar.style.transition = `transform ${total}ms linear`; bar.style.transform = 'scaleX(1)'; });
      for (let c = 0; c < cycles; c++) for (const [key, ms, big] of phases) {
        timers.push(setTimeout(() => {
          show(key);
          circle.style.transitionDuration = `${reduce ? 400 : ms}ms`;
          circle.style.transform = reduce ? 'none' : `scale(${big ? 1 : .55})`;
          circle.style.opacity = reduce ? (big ? 1 : .55) : '';
        }, at));
        at += ms;
      }
      timers.push(setTimeout(finish, at));
    }
    function finish() {
      running = false; root.classList.remove('running'); root.classList.add('finished');
      show('pause.done'); btn.textContent = T('pause.again');
      circle.style.transitionDuration = '1200ms'; circle.style.transform = 'scale(.7)'; circle.style.opacity = '';
    }
    function stop() {
      clear(); running = false; root.classList.remove('running');
      bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)';
      show('pause.ready'); btn.textContent = T('pause.start');
      circle.style.transitionDuration = '600ms'; circle.style.transform = 'scale(.7)'; circle.style.opacity = '';
    }
    btn.addEventListener('click', () => (running ? stop() : start()));
    // Language changes keep the current phase: the pause owns its texts (no data-i18n on them).
    window.SITE_HOOKS.push(() => { say.textContent = T(sayKey); btn.textContent = T(running ? 'pause.stop' : root.classList.contains('finished') ? 'pause.again' : 'pause.start'); });
  }

  window.SITE_HOOKS = window.SITE_HOOKS || [];
  const kinds = { liquid, ripples, peel, grid, particles, bubbles, hold, scramble, toggle, tabs, copy, rocket, jelly };
  document.querySelectorAll('[data-shot]').forEach(stage => { try { kinds[stage.dataset.shot](stage); } catch (e) { console.warn('shot', stage.dataset.shot, e); } });
  document.querySelectorAll('[data-pause]').forEach(pause);
})();
