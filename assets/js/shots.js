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

  // ---------------------------------------------------------------- Sticker: a port of Pegote's peel model
  // (sobrecito-pegote.html: peelFrom / peelGeom / updPeel / detach / updLift / updCarry / drawSticker and its SND)
  const PSND = {
    burst(ac, t, f, q, dur, vol, type = 'bandpass') {
      const s = ac.createBufferSource(); s.buffer = PSND.nb || (PSND.nb = noiseBuffer(ac, 1));
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ac.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .0015); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      s.connect(fl).connect(g).connect(ac.destination); s.start(t, Math.random() * .8); s.stop(t + dur + .02); return fl;
    },
    crackle(n, base) { const ac = audio(); if (!ac) return; const t = ac.currentTime; for (let i = 0; i < n; i++) PSND.burst(ac, t + Math.random() * .028, base * (.6 + Math.random() * .9), 1.4, .004 + Math.random() * .012, .05 + Math.random() * .09); },
    tick() { const ac = audio(); if (!ac) return; PSND.burst(ac, ac.currentTime, 5200, 2, .014, .12); },
    rip() { const ac = audio(); if (!ac) return; const t = ac.currentTime; const f = PSND.burst(ac, t, 1300, .9, .15, .2); f.frequency.exponentialRampToValueAtTime(5400, t + .13); for (let i = 0; i < 7; i++) PSND.burst(ac, t + Math.random() * .1, 2400 + Math.random() * 3200, 1.5, .006, .12); if (navigator.vibrate) navigator.vibrate(12); },
    thump() { const ac = audio(); if (!ac) return; const t = ac.currentTime; const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(68, t + .09); const g = ac.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.26, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .12); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + .14); PSND.burst(ac, t, 900, .7, .05, .14, 'lowpass'); if (navigator.vibrate) navigator.vibrate(8); },
    settle() { const ac = audio(); if (!ac) return; PSND.burst(ac, ac.currentTime, 2400, 1, .02, .05); }
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eOutCubic = t => 1 - Math.pow(1 - t, 3);
  const eOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const rotv = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
  function clipHalf(pts, M, n, sg) {
    const out = []; let prev = pts[pts.length - 1], dp = sg * ((prev.x - M.x) * n.x + (prev.y - M.y) * n.y);
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], dc = sg * ((cur.x - M.x) * n.x + (cur.y - M.y) * n.y);
      if (dc >= 0) { if (dp < 0) { const t = dp / (dp - dc); out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }); } out.push(cur); }
      else if (dp >= 0) { const t = dp / (dp - dc); out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }); }
      prev = cur; dp = dc;
    }
    return out;
  }
  const extent = (pts, n) => { let mn = 1e9, mx = -1e9; for (const p of pts) { const d = p.x * n.x + p.y * n.y; if (d < mn) mn = d; if (d > mx) mx = d; } return [mn, mx]; };

  function peel(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    const S = { fx: .5, fy: .5, onSheet: true, state: 'rest', peel: null, geom: null, L: 0, scale: 1, rot: 0, psi: 0, psiV: 0, lf: null, hold: null, hv: { x: 0, y: 0 }, acc: { x: 0, y: 0 } };
    const ptr = { x: 0, y: 0, sx: 0, sy: 0, down: false, type: 'mouse' };
    let r = 60, pts = [], t0 = 0;
    const dpr = () => cv.width / Math.max(1, cv.getBoundingClientRect().width);
    function shape() { r = Math.min(cv.width, cv.height) * .22; pts = Array.from({ length: 72 }, (_, i) => { const a = i / 72 * Math.PI * 2; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }); }
    const home = () => ({ x: cv.width / 2, y: cv.height / 2 });
    const center = () => ({ x: S.fx * cv.width, y: S.fy * cv.height });
    const path = P => { const p = new Path2D(); P.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y))); p.closePath(); return p; };
    function shadow(L) { const d = dpr(); ctx.shadowColor = `rgba(0,0,0,${.32 + L * .25})`; ctx.shadowBlur = (4 + L * 26) * d; ctx.shadowOffsetY = (1.5 + L * 16) * d; }
    const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
    function paintFront(p) {
      ctx.save(); ctx.clip(p);
      ctx.fillStyle = '#0b0b0c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${r * .24}px Geist, sans-serif`; ctx.fillText(lang() === 'en' ? 'peel me' : 'despegame', 0, 0);
      ctx.restore();
    }
    function paintBack(p, g) {
      ctx.save(); ctx.clip(p);
      const M = g.M, n = g.n, bg = ctx.createLinearGradient(M.x, M.y, M.x - n.x * r * 1.2, M.y - n.y * r * 1.2);
      bg.addColorStop(0, 'rgba(0,0,0,.18)'); bg.addColorStop(.35, 'rgba(255,255,255,.05)'); bg.addColorStop(1, 'rgba(0,0,0,.06)');
      ctx.fillStyle = bg; ctx.fillRect(-r * 3, -r * 3, r * 6, r * 6); ctx.restore();
    }
    function sheet() {
      const h = home(), d = dpr(), w = r * 3.1, rr = r * .22;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 18 * d; ctx.shadowOffsetY = 8 * d;
      ctx.beginPath(); ctx.roundRect(h.x - w / 2, h.y - w / 2, w, w, rr); ctx.fillStyle = '#2a2a2d'; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(h.x, h.y, r + 1.5 * d, 0, Math.PI * 2); ctx.fillStyle = '#232326'; ctx.fill();
      ctx.setLineDash([4 * d, 4 * d]); ctx.strokeStyle = 'rgba(237,237,235,.18)'; ctx.lineWidth = d; ctx.stroke(); ctx.restore();
      ctx.fillStyle = 'rgba(237,237,235,.35)'; ctx.font = `${Math.round(r * .11)}px "Geist Mono", monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('PEGOTE · Nº 01', h.x - w / 2 + rr * .7, h.y + w / 2 - rr * .6);
    }
    function draw() {
      ctx.clearRect(0, 0, cv.width, cv.height); sheet();
      const c = center(), g = S.geom, L = S.L;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(S.rot + S.psi); if (S.scale !== 1) ctx.scale(S.scale, S.scale);
      const full = path(pts);
      if (!g) { ctx.fillStyle = '#f3f2ee'; shadow(L); ctx.fill(full); noShadow(); paintFront(full); }
      else {
        const k = 1 - Math.cos(g.theta), M = g.M, n = g.n;
        const base = clipHalf(pts, M, n, 1), flap = clipHalf(pts, M, n, -1);
        if (base.length > 2) {
          const bp = path(base); ctx.fillStyle = '#f3f2ee'; shadow(L); ctx.fill(bp); noShadow(); paintFront(bp);
          ctx.save(); ctx.clip(bp); const cg = ctx.createLinearGradient(M.x, M.y, M.x + n.x * 14 * dpr(), M.y + n.y * 14 * dpr());
          cg.addColorStop(0, 'rgba(0,0,0,.22)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = cg; ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4); ctx.restore();
        }
        if (flap.length > 2) {
          const md = M.x * n.x + M.y * n.y;
          ctx.save(); ctx.transform(1 - k * n.x * n.x, -k * n.x * n.y, -k * n.x * n.y, 1 - k * n.y * n.y, k * md * n.x, k * md * n.y);
          const fp = path(flap); ctx.fillStyle = '#d6d5d0'; shadow(Math.max(L, g.lift)); ctx.fill(fp); noShadow();
          if (Math.cos(g.theta) < 0) paintBack(fp, g); else paintFront(fp);
          ctx.restore();
        }
      }
      ctx.restore();
    }
    // --- model (same constants as Pegote)
    const toLocal = p => { const c = center(), d = rotv(p.x - c.x, p.y - c.y, -(S.rot + S.psi)); return { x: d.x / S.scale, y: d.y / S.scale }; };
    function peelFrom(p, nailT) {
      const q = toLocal(p), lq = Math.hypot(q.x, q.y) || 1, G = { x: q.x / lq * r, y: q.y / lq * r };
      let cx = -G.x, cy = -G.y; const lc = Math.hypot(cx, cy) || 1; cx /= lc; cy /= lc;
      let ax = q.x - G.x, ay = q.y - G.y; const l = Math.hypot(ax, ay);
      if (l > 1.5 && lq < r) { ax = ax / l * .6 + cx * .4; ay = ay / l * .6 + cy * .4; } else { ax = cx; ay = cy; }
      const la = Math.hypot(ax, ay) || 1;
      return { G, a: { x: ax / la, y: ay / la }, nail: S.peel ? S.peel.nail : 0, nailT, D: { x: 0, y: 0 }, Dv: { x: 0, y: 0 }, theta: Math.PI - .5, prevFold: null, acc: 0 };
    }
    function peelGeom(dt) {
      const P = S.peel, G = P.G, a = P.a, D = P.D;
      const nailPx = clamp(r * .22, 6 * dpr(), 15 * dpr()) * P.nail;
      const ad = D.x * a.x + D.y * a.y, dl = Math.hypot(D.x, D.y);
      let vx = D.x, vy = D.y; if (ad < 0) { vx -= 2 * ad * a.x; vy -= 2 * ad * a.y; }
      const out = dl > 3 ? Math.max(0, -ad) / dl : 0;
      const thT = Math.PI - .16 - out * .95 - (S.state === 'hover' ? .55 : 0);
      P.theta += (thT - P.theta) * (1 - Math.exp(-dt * 16));
      const tx = G.x + a.x * nailPx + vx, ty = G.y + a.y * nailPx + vy, dx = tx - G.x, dy = ty - G.y, l = Math.hypot(dx, dy);
      if (l < .6) return null;
      return { M: { x: G.x + dx / 2, y: G.y + dy / 2 }, n: { x: dx / l, y: dy / l }, theta: P.theta, lift: .16 + .55 * out };
    }
    function updPeel(dt) {
      const P = S.peel;
      P.nail += (P.nailT - P.nail) * (1 - Math.exp(-dt * (P.nailT > P.nail ? 30 : 16)));
      if (S.state === 'release') {
        const K = 520, C = 2 * Math.sqrt(K) * .6;
        P.Dv.x += (-K * P.D.x - C * P.Dv.x) * dt; P.Dv.y += (-K * P.D.y - C * P.Dv.y) * dt;
        P.D.x += P.Dv.x * dt; P.D.y += P.Dv.y * dt;
      }
      const g = peelGeom(dt); S.geom = g;
      if (g) {
        const [mn, mx] = extent(pts, g.n), md = g.M.x * g.n.x + g.M.y * g.n.y;
        g.frac = clamp((md - mn) / (mx - mn), 0, 1);
        const fd = md - mn, step = 1.8 * dpr() * (r / (60 * dpr()));
        if (P.prevFold != null && S.state === 'peel') { const dd = fd - P.prevFold; if (dd > 0) { P.acc += dd; let n = 0; while (P.acc > step && n < 5) { P.acc -= step; n++; } if (n) PSND.crackle(n, 3200); } }
        P.prevFold = fd;
        if (S.state === 'peel' && (g.frac > .54 || Math.hypot(P.D.x, P.D.y) > r * 2.6)) { detach(g); return; }
      }
      if ((S.state === 'release' || S.state === 'hover') && S.state === 'release' && P.nail < .03 && Math.hypot(P.D.x, P.D.y) < .4 && Math.hypot(P.Dv.x, P.Dv.y) < 6) {
        S.state = 'rest'; S.peel = null; S.geom = null; PSND.settle();
      }
    }
    function detach(g) {
      const c = center();
      S.lf = { t: 0, M: g.M, n: g.n, th0: g.theta, x0: c.x, y0: c.y };
      S.state = 'lift'; S.onSheet = false; S.hold = { x: ptr.x, y: ptr.y }; S.hv = { x: 0, y: 0 }; S.acc = { x: 0, y: 0 }; S.psi = 0; S.psiV = 0;
      PSND.rip();
      if (reduce) { S.state = 'carry'; S.geom = null; S.L = 1; S.scale = 1.075; }
    }
    function followHold(dt) {
      const k = 1 - Math.exp(-dt * 38);
      const nx = S.hold.x + (ptr.x - S.hold.x) * k, ny = S.hold.y + (ptr.y - S.hold.y) * k;
      const vx = (nx - S.hold.x) / dt, vy = (ny - S.hold.y) / dt, ax = (vx - S.hv.x) / dt, ay = (vy - S.hv.y) / dt;
      S.acc.x += (ax - S.acc.x) * .35; S.acc.y += (ay - S.acc.y) * .35; S.hv.x = vx; S.hv.y = vy; S.hold.x = nx; S.hold.y = ny;
    }
    const setCenter = (x, y) => { S.fx = x / cv.width; S.fy = y / cv.height; };
    function updLift(dt) {
      const L = S.lf; L.t += dt / (reduce ? .15 : .3); const t = clamp(L.t, 0, 1), e = eOutCubic(t);
      followHold(dt);
      const th = L.th0 * (1 - e);
      S.geom = th > .03 ? { M: L.M, n: L.n, theta: th, lift: .3 * (1 - e) } : null;
      S.L = e; S.scale = 1 + .075 * eOutBack(t);
      const G = S.peel.G, off = rotv(G.x * S.scale, G.y * S.scale, S.rot + S.psi);
      setCenter(lerp(L.x0, S.hold.x - off.x, e), lerp(L.y0, S.hold.y - off.y, e));
      if (t >= 1) { S.state = 'carry'; S.geom = null; if (!ptr.down) drop(); }
    }
    function updCarry(dt, T) {
      followHold(dt);
      const G = S.peel.G;
      if (!reduce) {
        const c = rotv(-G.x * S.scale, -G.y * S.scale, S.rot + S.psi), cl = c.x * c.x + c.y * c.y + 120 * dpr() * dpr();
        const tq = clamp((c.x * -S.acc.y - c.y * -S.acc.x) / cl, -70, 70);
        const K = 110, C = 2 * .33 * Math.sqrt(K);
        S.psiV += (tq - K * S.psi - C * S.psiV) * dt; S.psi = clamp(S.psi + S.psiV * dt, -.5, .5);
      }
      S.L += (1 - S.L) * (1 - Math.exp(-dt * 10));
      S.scale += (1.075 - S.scale) * (1 - Math.exp(-dt * 10)) + Math.sin(T * 2.1) * .0006;
      const off = rotv(G.x * S.scale, G.y * S.scale, S.rot + S.psi);
      setCenter(S.hold.x - off.x, S.hold.y - off.y);
    }
    function drop() {
      // keep the rotation it landed with; snap home if dropped over its outline
      S.rot += S.psi; S.psi = 0; S.psiV = 0; S.peel = null; S.geom = null;
      const c = center(), h = home();
      if (Math.hypot(c.x - h.x, c.y - h.y) < r * .6) { S.fx = .5; S.fy = .5; S.rot = 0; S.onSheet = true; }
      const mx = r / cv.width, my = r / cv.height; S.fx = clamp(S.fx, mx, 1 - mx); S.fy = clamp(S.fy, my, 1 - my);
      S.state = 'stick'; PSND.thump();
    }
    function frame(now) {
      fit(cv); if (!pts.length || Math.abs(r - Math.min(cv.width, cv.height) * .22) > 1) shape();
      const dt = Math.min(.05, Math.max(.001, (now - (t0 || now)) / 1000)) || .016; t0 = now;
      if (S.state === 'peel' || S.state === 'release' || S.state === 'hover') updPeel(dt);
      if (S.state === 'lift') updLift(dt);
      else if (S.state === 'carry') updCarry(dt, now / 1000);
      else if (S.state === 'stick') { S.scale += (1 - S.scale) * (1 - Math.exp(-dt * 18)); S.L += (0 - S.L) * (1 - Math.exp(-dt * 14)); if (Math.abs(S.scale - 1) < .002 && S.L < .01) { S.scale = 1; S.L = 0; S.state = 'rest'; } }
      draw();
    }
    const R = runner(stage, frame);
    const toCanvas = e => { const l = local(stage, e), d = dpr(); return { x: l.x * d, y: l.y * d }; };
    const onSticker = p => { const q = toLocal(p); return Math.hypot(q.x, q.y) <= r + (ptr.type === 'mouse' ? 3 : 12) * dpr(); };
    stage.addEventListener('pointerdown', e => {
      fit(cv); if (!pts.length) shape();
      const p = toCanvas(e); ptr.type = e.pointerType; ptr.x = ptr.sx = p.x; ptr.y = ptr.sy = p.y;
      if (!onSticker(p) || !['rest', 'hover', 'release', 'stick'].includes(S.state)) return;
      audio(); ptr.down = true; stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing';
      if (S.state === 'hover' && S.peel) { S.peel.nailT = 1; S.peel.D = { x: 0, y: 0 }; } else S.peel = peelFrom(p, 1);
      S.state = 'peel'; S.scale = 1; PSND.tick();
      if (reduce) R.once();
    });
    stage.addEventListener('pointermove', e => {
      const p = toCanvas(e); ptr.x = p.x; ptr.y = p.y; ptr.type = e.pointerType;
      if (S.state === 'peel' && ptr.down) { S.peel.D.x = p.x - ptr.sx; S.peel.D.y = p.y - ptr.sy; }
      else if (!ptr.down && e.pointerType === 'mouse' && (S.state === 'rest' || S.state === 'hover' || S.state === 'release')) {
        // hover near the rim: the corner lifts a little, like in Pegote
        const q = toLocal(p), d = Math.hypot(q.x, q.y), near = d < r && d > r - 16 * dpr();
        if (near && S.state !== 'hover') { S.peel = peelFrom(p, .7); S.state = 'hover'; }
        else if (!near && S.state === 'hover') { S.state = 'release'; S.peel.nailT = 0; }
      }
      if (reduce) R.once();
    });
    const up = () => {
      if (!ptr.down) return; ptr.down = false; stage.style.cursor = 'grab';
      if (S.state === 'peel') { S.state = 'release'; S.peel.nailT = 0; }
      else if (S.state === 'carry') drop();
      if (reduce) { if (S.state === 'release') { S.state = 'rest'; S.peel = null; S.geom = null; } if (S.state === 'stick') { S.state = 'rest'; S.scale = 1; S.L = 0; } R.once(); }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('pointerleave', () => { if (!ptr.down && S.state === 'hover') { S.state = 'release'; S.peel.nailT = 0; } });
    stage.addEventListener('dblclick', () => { if (S.state === 'rest') { S.fx = .5; S.fy = .5; S.rot = 0; S.onSheet = true; R.once(); } });
    new ResizeObserver(() => { fit(cv); shape(); R.once(); }).observe(stage);
    window.SITE_HOOKS.push(() => R.once());
    R.once();
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

  // ---------------------------------------------------------------- Morphogenesis: Gray-Scott reaction-diffusion
  // Two imaginary chemicals: B eats A and reproduces. Draw with your finger and coral grows from the stroke.
  // Feed/kill drift slowly between stable "species"; if the culture dies out or floods, it reseeds itself.
  function morpho(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    const SPECIES = [[.0545, .062], [.029, .057], [.0367, .0649], [.039, .058]]; // coral, worms, spots, labyrinth
    let W = 0, H = 0, A, B, A2, B2, img, off, octx, feed = SPECIES[0][0], kill = SPECIES[0][1], last = null, down = false, frames = 0;
    function build() {
      const r = stage.getBoundingClientRect(); const k = Math.max(r.width, r.height) > 600 ? 3.4 : 2.8;
      W = Math.max(60, Math.round(r.width / k)); H = Math.max(45, Math.round(r.height / k));
      A = new Float32Array(W * H).fill(1); B = new Float32Array(W * H); A2 = new Float32Array(W * H); B2 = new Float32Array(W * H);
      reseed();
      off = document.createElement('canvas'); off.width = W; off.height = H; octx = off.getContext('2d'); img = octx.createImageData(W, H);
    }
    function reseed() { for (let n = 0; n < 6; n++) seed(W * (.15 + Math.random() * .7), H * (.15 + Math.random() * .7), 3); }
    function seed(x, y, rad) { for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) { if (i * i + j * j > rad * rad) continue; const xx = Math.round(x + i), yy = Math.round(y + j); if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; B[yy * W + xx] = 1; A[yy * W + xx] = .5; } }
    function step(now) {
      // the species changes slowly on its own, always within the stable range
      const t = (now || 0) / 1000 / 14, i = Math.floor(t) % SPECIES.length, f = (Math.sin((t % 1) * Math.PI - Math.PI / 2) + 1) / 2, n2 = (i + 1) % SPECIES.length;
      feed = SPECIES[i][0] + (SPECIES[n2][0] - SPECIES[i][0]) * f; kill = SPECIES[i][1] + (SPECIES[n2][1] - SPECIES[i][1]) * f;
      for (let it = 0; it < 5; it++) {
        for (let y = 0; y < H; y++) {
          const ym = ((y - 1 + H) % H) * W, y0 = y * W, yp = ((y + 1) % H) * W;
          for (let x = 0; x < W; x++) {
            const xm = (x - 1 + W) % W, xp = (x + 1) % W, k = y0 + x;
            const a = A[k], bb = B[k];
            const la = -a + .2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) + .05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]);
            const lb = -bb + .2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) + .05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]);
            const abb = a * bb * bb;
            A2[k] = Math.min(1, Math.max(0, a + (la - abb + feed * (1 - a))));
            B2[k] = Math.min(1, Math.max(0, bb + (.5 * lb + abb - (kill + feed) * bb)));
          }
        }
        [A, A2] = [A2, A]; [B, B2] = [B2, B];
      }
      // keep the culture alive: reseed if it fades, thin it out if it floods
      if (++frames % 30 === 0) { let sum = 0; for (let k = 0; k < B.length; k += 3) sum += B[k]; const m = sum / (B.length / 3); if (m < .004) reseed(); else if (m > .35) { A.fill(1); B.fill(0); reseed(); } }
      const d = img.data;
      for (let k = 0; k < W * H; k++) { const v = Math.max(0, Math.min(1, B[k] * 3.2)); const c = 16 + v * 222; d[k * 4] = c; d[k * 4 + 1] = c; d[k * 4 + 2] = c - 2; d[k * 4 + 3] = 255; }
      octx.putImageData(img, 0, 0);
      fit(cv, 1.5); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(off, 0, 0, cv.width, cv.height);
    }
    const toGrid = e => { const l = local(stage, e); return { x: l.x / l.w * W, y: l.y / l.h * H }; };
    stage.addEventListener('pointerdown', e => { const p = toGrid(e); down = true; last = p; seed(p.x, p.y, 3); stage.setPointerCapture(e.pointerId); if (reduce) step(); });
    stage.addEventListener('pointermove', e => {
      if (!down) return; const p = toGrid(e);
      const dist = Math.hypot(p.x - last.x, p.y - last.y), n = Math.ceil(dist / 1.5);
      for (let i = 1; i <= n; i++) seed(last.x + (p.x - last.x) * i / n, last.y + (p.y - last.y) * i / n, 2);
      last = p; if (reduce) step();
    });
    const up = () => { down = false; }; stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('dblclick', () => { A.fill(1); B.fill(0); reseed(); });
    new ResizeObserver(() => { build(); step(); }).observe(stage);
    runner(stage, step);
  }

  // ---------------------------------------------------------------- Attractor: Peter de Jong
  // x' = sin(a·y) − cos(b·x), y' = sin(c·x) − cos(d·y). Chaotic almost everywhere; four numbers decide its shape.
  function attractor(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    let W = 0, H = 0, dens = null, img = null, off, octx, x = .1, y = .1, ta = 1.4, tb = -2.3, hover = false;
    let a = 1.4, b = -2.3, c = 2.4, d = -2.1;
    function build() { fit(cv, 1); W = Math.max(80, Math.round(cv.width / 1.2)); H = Math.max(60, Math.round(cv.height / 1.2)); dens = new Float32Array(W * H); off = document.createElement('canvas'); off.width = W; off.height = H; octx = off.getContext('2d'); img = octx.createImageData(W, H); }
    function step(now) {
      const t = (now || 0) / 1000;
      const ga = hover ? ta : 1.4 + Math.sin(t * .13) * .5, gb = hover ? tb : -2.3 + Math.cos(t * .09) * .5;
      a += (ga - a) * .05; b += (gb - b) * .05; c = 2.4 + Math.sin(t * .07) * .35; d = -2.1 + Math.cos(t * .05) * .35;
      for (let i = 0; i < dens.length; i++) dens[i] *= .86;
      const sc = Math.min(W, H * 1.25) / 4.9;
      for (let i = 0; i < 90000; i++) {
        const nx = Math.sin(a * y) - Math.cos(b * x), ny = Math.sin(c * x) - Math.cos(d * y); x = nx; y = ny;
        const px = (W / 2 + x * sc) | 0, py = (H / 2 + y * sc * .8) | 0;
        if (px >= 0 && py >= 0 && px < W && py < H) dens[py * W + px] += 1;
      }
      let mxd = 1; for (let i = 0; i < dens.length; i += 5) if (dens[i] > mxd) mxd = dens[i];
      const L = Math.log(1 + mxd), dd = img.data;
      for (let i = 0; i < dens.length; i++) { const v = Math.pow(Math.log(1 + dens[i]) / L, .75); const c2 = 11 + v * 232; dd[i * 4] = c2; dd[i * 4 + 1] = c2; dd[i * 4 + 2] = c2 - 3; dd[i * 4 + 3] = 255; }
      octx.putImageData(img, 0, 0); fit(cv, 1); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, cv.width, cv.height);
    }
    stage.addEventListener('pointermove', e => { const l = local(stage, e); hover = true; ta = .6 + l.x / l.w * 2.2; tb = -3 + (1 - l.y / l.h) * 1.8; if (reduce) step(performance.now()); });
    stage.addEventListener('pointerleave', () => { hover = false; });
    new ResizeObserver(() => { build(); step(performance.now()); }).observe(stage);
    runner(stage, step);
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
  const kinds = { liquid, ripples, peel, grid, particles, scramble, copy, rocket, jelly, morpho, attractor };
  document.querySelectorAll('[data-shot]').forEach(stage => { try { kinds[stage.dataset.shot](stage); } catch (e) { console.warn('shot', stage.dataset.shot, e); } });
  document.querySelectorAll('[data-pause]').forEach(pause);
})();
