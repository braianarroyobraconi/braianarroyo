// Home doors: the After hours carousel.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- After hours carousel: autoplay with story bars, arrows, swipe; pauses on hover, offscreen and hidden tab.
  const car = document.querySelector('[data-car]');
  if (!car) return;
  const slides = [...car.querySelectorAll('.car-slide')], bars = [...car.querySelectorAll('.car-bar')];
  const DUR = 5000;
  let outT = 0, i = 0, t0 = performance.now(), elapsed = 0, paused = false, visible = false, raf = 0;
  function go(n, dir) {
    const prev = i; i = (n + slides.length) % slides.length; if (prev === i) return;
    clearTimeout(outT); outT = setTimeout(() => slides[prev].classList.remove('out'), 950);
    slides.forEach((s, j) => {
      s.classList.toggle('on', j === i); s.classList.toggle('out', j === prev);
      s.style.setProperty('--dir', dir || (n > prev ? 1 : -1));
      s.toggleAttribute('inert', j !== i);
    });
    wake();
    elapsed = 0; t0 = performance.now(); paint(0);
  }
  function paint(p) { bars.forEach((b, j) => b.firstChild.style.transform = `scaleX(${j < i ? 1 : j === i ? p : 0})`); }
  function loop(now) {
    if (!paused && visible && !document.hidden && !reduce) {
      elapsed += now - t0;
      if (elapsed >= DUR) go(i + 1, 1); else paint(elapsed / DUR);
    }
    t0 = now; raf = requestAnimationFrame(loop);
  }
  // the lamp shows its colors while its slide is up
  const wake = () => slides.forEach((s, j) => { const l = s.querySelector('.lamp-stage'); if (l) l.classList.toggle('awake', j === i); });
  slides.forEach((s, j) => { s.classList.toggle('on', j === 0); s.toggleAttribute('inert', j !== 0); });
  wake();
  paint(0);
  bars.forEach((b, j) => b.addEventListener('click', () => go(j)));
  car.querySelector('[data-car-prev]').addEventListener('click', () => go(i - 1, -1));
  car.querySelector('[data-car-next]').addEventListener('click', () => go(i + 1, 1));
  car.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') paused = true; });
  car.addEventListener('pointerleave', () => { paused = false; });
  car.addEventListener('focusin', () => { paused = true; }); car.addEventListener('focusout', () => { paused = false; });
  // swipe on touch (vertical scroll still works: the stage only claims horizontal drags)
  let sx = null, sy = 0;
  car.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && !e.target.closest('[data-shot="peel"]')) { sx = e.clientX; sy = e.clientY; } }); // the sticker needs the drag for itself
  car.addEventListener('pointerup', e => {
    if (sx === null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swiped = true; go(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); }
  });
  let swiped = false;
  car.addEventListener('click', e => { if (swiped) { e.preventDefault(); swiped = false; } }, true);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: .4 }).observe(car);
  raf = requestAnimationFrame(loop);
})();
