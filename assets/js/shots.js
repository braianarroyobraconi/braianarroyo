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

  // ---------------------------------------------------------------- 2. Dithered portrait
  function dither(stage) {
    const cv = stage.querySelector('canvas');
    const P = glProgram(cv, `precision highp float;uniform vec2 r;uniform vec2 m;uniform float px;uniform sampler2D img;uniform float ia;
      float b2(vec2 a){a=floor(a);return fract(dot(a,vec2(.5,a.y*.75)));}
      float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
      void main(){vec2 uv=gl_FragCoord.xy/r;float a=r.x/r.y;
      float lens=1.-smoothstep(.16,.19,length((uv-m)*vec2(a,1.)));
      float cell=mix(px*4.,px*1.5,lens);
      vec2 g=floor(gl_FragCoord.xy/cell)*cell+cell*.5;vec2 cuv=g/r;
      vec2 s=a>ia?vec2(1.,ia/a):vec2(a/ia,1.);vec2 tuv=(cuv-.5)*s+vec2(.5,.56);
      vec3 c=texture2D(img,tuv).rgb;float l=dot(c,vec3(.299,.587,.114));l=pow(l,.9)*1.08;
      float on=step(b4(gl_FragCoord.xy/cell),l);
      float ring=smoothstep(.003,0.,abs(length((uv-m)*vec2(a,1.))-.185))*.5;
      vec3 col=mix(vec3(.043),vec3(.93),on);col=mix(col,vec3(.6),ring);gl_FragColor=vec4(col,1.);}`);
    if (!P) return fallback(stage, 'WebGL no disponible.');
    const { gl } = P;
    const tex = gl.createTexture(); let ready = false;
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      ready = true; R.once();
    };
    img.src = '/assets/img/braian.webp';
    let mx = .5, my = .55, tx = .5, ty = .55, hover = false;
    stage.addEventListener('pointermove', e => { const l = local(stage, e); tx = l.x / l.w; ty = 1 - l.y / l.h; hover = true; if (reduce) { mx = tx; my = ty; R.once(); } });
    stage.addEventListener('pointerleave', () => { hover = false; });
    const R = runner(stage, t => {
      if (!ready) return;
      if (!hover) { tx = .5 + Math.sin(t / 2400) * .22; ty = .58 + Math.cos(t / 3100) * .16; }
      mx += (tx - mx) * .09; my += (ty - my) * .09;
      const d = fit(cv, 1.5);
      gl.uniform2f(P.u.r, cv.width, cv.height); gl.uniform2f(P.u.m, mx, my); gl.uniform1f(P.u.px, d);
      gl.uniform1f(P.u.ia, img.width / img.height); gl.uniform1i(P.u.img, 0); P.draw();
    });
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

  // ---------------------------------------------------------------- 4. Peel (Pegote's core gesture)
  function peel(stage) {
    const cv = stage.querySelector('canvas'); const ctx = cv.getContext('2d');
    let fx = .5, fy = .5;                     // sticker center, relative to the stage
    let G = null, Pp = null, tgt = null, vx = 0, vy = 0;
    let mode = 'rest';                        // rest | peel | carry | drop
    let lift = 0, liftV = 0, tilt = 0, last = null, carryOff = null, hint = true;
    let snd = null;                           // live peel noise while dragging
    const geo = () => ({ cx: fx * cv.width, cy: fy * cv.height, r: Math.min(cv.width, cv.height) * .27 });

    function peelSound(speed) {
      const ac = audio(); if (!ac) return;
      if (!snd) {
        const src = ac.createBufferSource(); src.buffer = noiseBuffer(ac, 1); src.loop = true;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = .8;
        const g = ac.createGain(); g.gain.value = 0;
        src.connect(f).connect(g).connect(ac.destination); src.start();
        snd = { src, f, g };
      }
      const k = Math.min(1, speed / 26);
      snd.g.gain.setTargetAtTime(.02 + k * .16, ac.currentTime, .03);
      snd.f.frequency.setTargetAtTime(1800 + k * 2600, ac.currentTime, .05);
    }
    function stopPeel() { if (!snd || !AC) return; const s = snd; snd = null; s.g.gain.setTargetAtTime(0, AC.currentTime, .04); setTimeout(() => s.src.stop(), 300); }
    function tap(freq = 180, vol = .35) { // soft "thup" when it sticks
      const ac = audio(); if (!ac) return; const t = ac.currentTime;
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(freq * 1.6, t); o.frequency.exponentialRampToValueAtTime(freq, t + .08);
      const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .14);
      const n = ac.createBufferSource(); n.buffer = noiseBuffer(ac, .05); const nf = ac.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 3000; const ng = ac.createGain(); ng.gain.value = .05;
      o.connect(g).connect(ac.destination); n.connect(nf).connect(ng).connect(ac.destination); o.start(t); o.stop(t + .15); n.start(t);
      if (navigator.vibrate) navigator.vibrate(6);
    }

    function face(cx, cy, r) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#e9e9e6'; ctx.fill();
      ctx.fillStyle = '#0b0b0c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${r * .24}px Geist, sans-serif`; ctx.fillText(lang() === 'en' ? 'peel me' : 'despegame', cx, cy);
    }
    function shadow(blur, oy, a = .45) { const d = window.devicePixelRatio || 1; ctx.shadowColor = `rgba(0,0,0,${a})`; ctx.shadowBlur = blur * d; ctx.shadowOffsetY = oy * d; }
    function draw() {
      fit(cv); const { cx, cy, r } = geo();
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (mode === 'carry' || mode === 'drop') { // fully lifted: bigger shadow, slight scale and tilt
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt); ctx.scale(1 + lift * .06, 1 + lift * .06); ctx.translate(-cx, -cy);
        ctx.save(); shadow(10 + lift * 30, 4 + lift * 18, .35 + lift * .2); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#e9e9e6'; ctx.fill(); ctx.restore();
        face(cx, cy, r); ctx.restore(); return;
      }
      if (!G || !Pp || Math.hypot(Pp.x - G.x, Pp.y - G.y) < 1) {
        ctx.save(); shadow(14, 4, .4); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#e9e9e6'; ctx.fill(); ctx.restore();
        face(cx, cy, r); return;
      }
      // Fold line = perpendicular bisector of the grab point G and the finger P; the part on G's side flips over it.
      const mx = (G.x + Pp.x) / 2, my = (G.y + Pp.y) / 2;
      let nx = Pp.x - G.x, ny = Pp.y - G.y; const L = Math.hypot(nx, ny); nx /= L; ny /= L;
      const BIG = Math.max(cv.width, cv.height) * 4, tx = -ny, ty = nx;
      const half = sign => {
        ctx.beginPath();
        ctx.moveTo(mx + tx * BIG, my + ty * BIG); ctx.lineTo(mx - tx * BIG, my - ty * BIG);
        ctx.lineTo(mx - tx * BIG + nx * BIG * sign, my - ty * BIG + ny * BIG * sign);
        ctx.lineTo(mx + tx * BIG + nx * BIG * sign, my + ty * BIG + ny * BIG * sign); ctx.closePath();
      };
      ctx.save(); half(1); ctx.clip();
      ctx.save(); shadow(14, 4, .4); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#e9e9e6'; ctx.fill(); ctx.restore();
      face(cx, cy, r); ctx.restore();
      const dot = mx * nx + my * ny;
      ctx.save();
      ctx.transform(1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, 2 * dot * nx, 2 * dot * ny);
      half(-1); ctx.clip();
      shadow(22, 10, .55);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const g = ctx.createLinearGradient(mx, my, mx - nx * r, my - ny * r);
      g.addColorStop(0, '#cfcfcb'); g.addColorStop(1, '#a6a6a2');
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
    }

    const R = runner(stage, () => {
      const { cx, cy, r } = geo();
      if (mode === 'peel' && tgt) { Pp.x += (tgt.x - Pp.x) * .5; Pp.y += (tgt.y - Pp.y) * .5; }
      if (mode === 'rest' && G && Pp) { // let go before it came off: spring back and stick again
        const ax = (G.x - Pp.x) * .16 - vx * .5, ay = (G.y - Pp.y) * .16 - vy * .5;
        vx += ax; vy += ay; Pp.x += vx; Pp.y += vy;
        if (Math.hypot(G.x - Pp.x, G.y - Pp.y) < .5 && Math.hypot(vx, vy) < .5) { G = Pp = null; tap(150, .2); }
      }
      if (mode === 'carry' && tgt) {
        const nfx = (tgt.x - carryOff.x) / cv.width, nfy = (tgt.y - carryOff.y) / cv.height;
        const dx = (nfx - fx) * cv.width; fx += (nfx - fx) * .35; fy += (nfy - fy) * .35;
        tilt += ((Math.max(-1, Math.min(1, dx / (r * 1.5))) * .18) - tilt) * .2;
        lift += (1 - lift) * .2;
      }
      if (mode === 'drop') { // settle onto the table with a tiny overshoot
        liftV += (0 - lift) * .25 - liftV * .45; lift += liftV; tilt *= .8;
        if (Math.abs(lift) < .004 && Math.abs(liftV) < .004) { lift = 0; tilt = 0; mode = 'rest'; }
      }
      if (hint && mode === 'rest' && !G && !reduce) { // a gentle hint: a corner lifts every few seconds
        const s = (performance.now() % 4200) / 4200, k = Math.max(0, Math.sin(s * Math.PI * 2)) ** 3 * .22;
        if (k > .002) { const a = -0.75; G = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; Pp = { x: G.x - Math.cos(a) * r * k, y: G.y - Math.sin(a) * r * k }; draw(); G = Pp = null; return; }
      }
      draw();
    });

    stage.addEventListener('pointerdown', e => {
      const d = fit(cv); const l = local(stage, e); const x = l.x * d, y = l.y * d; const { cx, cy, r } = geo();
      if (Math.hypot(x - cx, y - cy) > r * 1.25) return;
      audio(); hint = false; stage.setPointerCapture(e.pointerId); stage.style.cursor = 'grabbing';
      // grab point = the edge in the direction of the finger, so a press anywhere peels from the nearest rim
      const a = Math.atan2(y - cy, x - cx || 1e-3);
      G = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; Pp = { x: G.x, y: G.y }; tgt = { x, y }; vx = vy = 0;
      mode = 'peel'; last = { x, y, t: performance.now() };
      if (reduce) { Pp = { x, y }; draw(); }
    });
    stage.addEventListener('pointermove', e => {
      if (mode !== 'peel' && mode !== 'carry') return;
      const d = fit(cv); const l = local(stage, e); const x = l.x * d, y = l.y * d; const { cx, cy, r } = geo();
      const now = performance.now(), speed = last ? Math.hypot(x - last.x, y - last.y) / Math.max(1, now - last.t) * 16 / d : 0; last = { x, y, t: now };
      tgt = { x, y }; peelSound(speed);
      if (mode === 'peel' && Math.hypot(x - G.x, y - G.y) > r * 1.7) { // pulled far enough: it comes off
        mode = 'carry'; G = Pp = null; carryOff = { x: x - cx, y: y - cy }; lift = .6; tap(320, .12);
      }
      if (reduce) { if (mode === 'peel') Pp = { x, y }; else { fx = (x - carryOff.x) / cv.width; fy = (y - carryOff.y) / cv.height; lift = 1; } draw(); }
    });
    const up = () => {
      stopPeel(); stage.style.cursor = 'grab';
      if (mode === 'carry') { // stick it where it was dropped, kept inside the stage
        const { r } = geo(); const mxr = r / cv.width + .02, myr = r / cv.height + .02;
        fx = Math.min(1 - mxr, Math.max(mxr, fx)); fy = Math.min(1 - myr, Math.max(myr, fy));
        mode = 'drop'; liftV = -.05; tap();
        if (reduce) { mode = 'rest'; lift = 0; tilt = 0; draw(); }
      } else if (mode === 'peel') { mode = 'rest'; if (reduce) { G = Pp = null; draw(); } }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('dblclick', () => { fx = .5; fy = .5; mode = 'rest'; G = Pp = null; draw(); });
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
  const kinds = { liquid, dither, ripples, peel, grid, particles, bubbles, hold, scramble, toggle, tabs, copy };
  document.querySelectorAll('[data-shot]').forEach(stage => { try { kinds[stage.dataset.shot](stage); } catch (e) { console.warn('shot', stage.dataset.shot, e); } });
  document.querySelectorAll('[data-pause]').forEach(pause);
})();
