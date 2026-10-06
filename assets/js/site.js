// Shared behavior for every page: language (ES/EN), section pill, copy-email, and the motion system
// (GSAP + ScrollTrigger, Lenis as the only smooth-scroll engine).
// Pages declare their English copy in window.I18N_EN and register language hooks in window.SITE_HOOKS
// before this file runs. Spanish is the markup itself.
(() => {
  document.documentElement.classList.add('js');
  const COMMON_EN = {
    'nav.work': 'Work', 'nav.after': 'After hours', 'nav.contact': 'Contact',
    'back': 'Back', 'contact.copy': 'Copy email', 'contact.copied': 'Copied',
    'cta.title': 'Let\'s talk.', 'cta.button': 'Write to me',
    'greet': ['Good morning', 'Good afternoon', 'Good evening'],
    'light': 'light', 'temp': 'temp', 'lamp.hint': 'Move your cursor', 'lamp.hintTouch': 'Touch and drag',
    'footer.top': 'Back to top'
  };
  const I18N = {
    en: Object.assign({}, COMMON_EN, window.I18N_EN || {}),
    es: Object.assign({ 'contact.copied': 'Copiado', 'greet': ['Buen día', 'Buenas tardes', 'Buenas noches'], 'light': 'luz', 'temp': 'temp', 'lamp.hint': 'Mové el cursor', 'lamp.hintTouch': 'Tocá y arrastrá' }, window.I18N_ES || {})
  };

  // Capture the Spanish copy from the markup so switching back restores it.
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (!(k in I18N.es)) I18N.es[k] = el.hasAttribute('data-html') ? el.innerHTML : el.textContent;
  });
  document.querySelectorAll('[data-i18n-alt]').forEach(el => { I18N.es[el.dataset.i18nAlt] = el.alt; });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { I18N.es[el.dataset.i18nAria] = el.getAttribute('aria-label'); });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches; // touch screens get copy that talks about fingers, not cursors
  let lang = 'es';
  const t = k => (I18N[lang] && I18N[lang][k]) ?? I18N.es[k];
  const hooks = window.SITE_HOOKS || [];
  window.Site = { t, get lang() { return lang; }, reduce };

  function greet() {
    const el = document.getElementById('greet');
    if (!el) return;
    const h = new Date().getHours();
    el.textContent = t('greet')[h >= 5 && h < 13 ? 0 : h >= 13 && h < 20 ? 1 : 2];
  }

  // ---- Section pill: the active tab is a restyled copy of the list, clipped to the current link ----
  const pill = document.getElementById('pill');
  const pillList = pill && pill.querySelector('.list');
  const pillCopy = pill && pill.querySelector('.active-copy');
  let activeSec = null;
  function syncPill() {
    if (!pill) return;
    pill.setAttribute('aria-label', lang === 'en' ? 'Sections' : 'Secciones');
    pillCopy.innerHTML = '';
    const clone = pillList.cloneNode(true);
    clone.querySelectorAll('a').forEach(a => { a.removeAttribute('href'); a.setAttribute('tabindex', '-1'); });
    pillCopy.appendChild(clone);
    placePill();
  }
  function placePill() {
    if (!pill) return;
    const link = activeSec && pillList.querySelector(`[data-sec="${activeSec}"]`);
    pillList.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a === link));
    if (!link) { pillCopy.style.opacity = '0'; return; }
    // offsetLeft is measured from the pill (it has padding); the copy sits on the list itself.
    const l = link.offsetLeft - pillList.offsetLeft;
    const r = pillList.offsetWidth - l - link.offsetWidth;
    pillCopy.style.clipPath = `inset(0 ${r}px 0 ${l}px round 999px)`;
    pillCopy.style.opacity = '1';
  }
  if (pill) {
    const secIO = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) activeSec = e.target.dataset.owner || null; });
      placePill();
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('[data-owner]').forEach(el => secIO.observe(el));
    new ResizeObserver(placePill).observe(pillList);
  }

  function setLang(l, remember = true) {
    lang = l;
    document.documentElement.lang = l;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = t((coarse && el.dataset.i18nTouch) || el.dataset.i18n);
      if (el.hasAttribute('data-html')) el.innerHTML = v; else el.textContent = v;
      // Split headings come back as plain, visible copy in the new language.
      if (el.hasAttribute('data-split-done')) { el.removeAttribute('data-split-done'); el.removeAttribute('aria-label'); }
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(el => { el.alt = t(el.dataset.i18nAlt); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    const toggle = document.querySelector('.lang');
    if (toggle) toggle.dataset.active = l;
    greet();
    hooks.forEach(fn => fn(l, t));
    syncPill();
    if (remember) { try { localStorage.setItem('lang', l); } catch (e) {} }
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }
  // Each language lives at its own URL (/ and /en/) so search and AI engines can read both.
  // The toggle remembers the choice in a cookie (read by middleware.js) and goes to the other page.
  const PAGE_LANG = document.documentElement.dataset.pageLang || 'es';
  const ALT = document.documentElement.dataset.alt;
  document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => {
    const l = b.dataset.lang;
    document.cookie = `lang=${l}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try { localStorage.setItem('lang', l); } catch (e) {}
    if (l === PAGE_LANG) return;
    if (ALT) location.href = ALT + location.hash; else setLang(l);
  }));

  // ---- Copy email ----
  const copyBtn = document.getElementById('copy');
  if (copyBtn) {
    let timer = 0;
    copyBtn.addEventListener('click', async () => {
      const status = document.getElementById('copyStatus');
      try {
        await navigator.clipboard.writeText('braianarroyobraconi@gmail.com');
        copyBtn.setAttribute('data-copied', '');
        if (status) status.textContent = t('contact.copied');
        clearTimeout(timer);
        timer = setTimeout(() => { copyBtn.removeAttribute('data-copied'); if (status) status.textContent = ''; }, 1800);
      } catch (e) {
        window.location.href = 'mailto:braianarroyobraconi@gmail.com';
      }
    });
  }


  // ---- Experience accordion: the whole row toggles. Height is measured and animated with an iOS-like curve;
  // the projects inside arrive in a short stagger. Closed panels are inert so focus skips them.
  const DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
  document.querySelectorAll('.job.has-panel').forEach(job => {
    const btn = job.querySelector('.job-toggle');
    const panel = job.querySelector('.job-panel');
    const head = () => job.style.setProperty('--row-h', panel.offsetTop + 'px');
    head(); new ResizeObserver(head).observe(job);
    panel.querySelectorAll('.job-areas, .job-sub, .job-projects li').forEach((el, i) => el.style.setProperty('--i', i));
    panel.inert = true;
    btn.addEventListener('click', () => {
      const open = !job.classList.contains('open');
      btn.setAttribute('aria-expanded', String(open));
      panel.inert = !open;
      if (reduce) { job.classList.toggle('open', open); panel.style.height = open ? 'auto' : '0px'; return; }
      const from = panel.getBoundingClientRect().height;
      job.classList.toggle('open', open);
      const to = open ? panel.scrollHeight : 0;
      panel.style.transition = 'none'; panel.style.height = from + 'px';
      panel.offsetHeight; // commit the start height before transitioning
      panel.style.transition = `height ${open ? 560 : 380}ms ${DRAWER}`;
      panel.style.height = to + 'px';
    });
    panel.addEventListener('transitionend', e => {
      if (e.target !== panel || e.propertyName !== 'height') return;
      if (job.classList.contains('open')) panel.style.height = 'auto';
      if (window.ScrollTrigger) requestAnimationFrame(() => ScrollTrigger.refresh());
    });
  });

  // ---- Phones: the floating section pill stays out of the way while the hero is on screen
  const heroEl = document.querySelector('.hero');
  if (pill && heroEl && matchMedia('(max-width: 720px)').matches) {
    new IntersectionObserver(([e]) => pill.classList.toggle('tucked', e.intersectionRatio > .3), { threshold: [0, .3, .6] }).observe(heroEl);
  }

  // ---- Language: fixed by the page (the server already sent the visitor to the right one)
  setLang(PAGE_LANG, false);

  // ---- Motion ----
  if (!reduce) document.documentElement.classList.add('has-motion');

  // Split into masked words; inline markup (em, span.dim) is re-applied around each word,
  // and the element keeps an unsplit accessible name.
  function split(el) {
    if (el.hasAttribute('data-split-done')) return el.querySelectorAll('.w');
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const walk = (node, wrapIn) => {
      const out = document.createDocumentFragment();
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (!part.trim()) { out.appendChild(document.createTextNode(' ')); return; }
            const mask = document.createElement('span'); mask.className = 'w-mask'; mask.setAttribute('aria-hidden', 'true');
            let inner = document.createElement('span'); inner.className = 'w'; inner.textContent = part;
            wrapIn.slice().reverse().forEach(tpl => { const c = tpl.cloneNode(false); c.appendChild(inner); inner = c; });
            mask.appendChild(inner); out.appendChild(mask);
          });
        } else if (n.nodeType === 1) {
          out.appendChild(walk(n, wrapIn.concat(n)));
        }
      });
      return out;
    };
    const frag = walk(el, []);
    el.textContent = ''; el.appendChild(frag);
    el.setAttribute('data-split-done', '');
    return el.querySelectorAll('.w');
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (reduce || !window.gsap || !window.ScrollTrigger) {
      document.documentElement.classList.remove('has-motion');
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: 'power3.out', duration: 0.85 });

    if (window.Lenis) {
      const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9, anchors: { offset: -80 } });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(time => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    // Intro: the first media unveils, the title rises word by word, then supporting copy and actions.
    const intro = document.querySelector('[data-intro-root]');
    if (intro) {
      const title = intro.querySelector('[data-split]');
      const words = title ? split(title) : [];
      const media = intro.querySelector('[data-unveil]');
      if (title) gsap.set(title, { autoAlpha: 1 });
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      if (media) {
        gsap.set(media, { autoAlpha: 1 });
        tl.fromTo(media, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 1.2, ease: 'expo.out' }, 0);
        const img = media.querySelector('img, video');
        if (img) tl.fromTo(img, { scale: 1.24 }, { scale: 1.1, duration: 1.6, ease: 'expo.out' }, 0);
      }
      tl.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 1, stagger: 0.05 }, 0.15)
        .fromTo(intro.querySelectorAll('[data-intro]'), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.09 }, 0.55);
    }

    // Headings outside the intro: word by word as they enter.
    document.querySelectorAll('[data-split]').forEach(el => {
      if (intro && intro.contains(el)) return;
      const words = split(el);
      gsap.set(el, { autoAlpha: 1 });
      gsap.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.95, ease: 'power4.out', stagger: 0.035, scrollTrigger: { trigger: el, start: 'top 86%', once: true } });
    });

    // Groups stagger their children; single elements fade up.
    document.querySelectorAll('[data-reveal-group]').forEach(group => {
      const items = group.querySelectorAll('[data-reveal]');
      gsap.fromTo(items, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.07, scrollTrigger: { trigger: group, start: 'top 86%', once: true } });
    });
    document.querySelectorAll('[data-reveal]').forEach(el => {
      if (el.closest('[data-reveal-group]')) return;
      gsap.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });

    // Media outside the intro: clip the image layer only; text stays selectable.
    document.querySelectorAll('[data-unveil]').forEach(fig => {
      if (intro && intro.contains(fig)) return;
      gsap.set(fig, { autoAlpha: 1 });
      gsap.fromTo(fig, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 1.1, ease: 'power4.out', scrollTrigger: { trigger: fig, start: 'top 85%', once: true } });
    });

    // Parallax: depth through speed differences. Images move inside their frames (never revealing edges),
    // text drifts slower than the page, and the three side-project panels travel at slightly different speeds.
    // Softer on small screens; none at all under reduced motion (this block never runs then).
    const mm = gsap.matchMedia();
    mm.add({ wide: '(min-width: 721px)', narrow: '(max-width: 720px)' }, ctx => {
      const k = ctx.conditions.wide ? 1 : 0.5;
      const scrub = { scrub: 1.2, invalidateOnRefresh: true };

      // Hero: copy sinks and dims, the portrait rises a little faster, the photo pans inside its frame.
      const hero = document.querySelector('.hero');
      if (hero) {
        const st = { trigger: hero, start: 'top top', end: 'bottom top', ...scrub };
        gsap.to('.hero-copy', { y: 110 * k, autoAlpha: 0.35, ease: 'none', scrollTrigger: st });
        gsap.to('.portrait', { y: -50 * k, ease: 'none', scrollTrigger: st });
        gsap.fromTo('.portrait img', { yPercent: 0 }, { yPercent: 4 * k, ease: 'none', scrollTrigger: st }); // within the 1.1 zoom margin
      }

      // Images inside panels and covers: up to ±8% of their own height (they are sized 116% in CSS).
      document.querySelectorAll('[data-parallax]').forEach(img => {
        const amt = 5.5 * k; // the image is 116% tall: 8% spare on each side of the frame
        gsap.fromTo(img, { yPercent: -amt }, { yPercent: amt, ease: 'none', scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', ...scrub } });
      });

      // Side-project panels: the middle one travels a bit further, so the row gains depth.
      if (ctx.conditions.wide) {
        document.querySelectorAll('.trio .panel').forEach((panel, i) => {
          // yPercent, not y: the entrance reveal already owns y on these panels.
          const d = [4, 9, 6][i] || 4;
          gsap.fromTo(panel, { yPercent: d }, { yPercent: -d, ease: 'none', scrollTrigger: { trigger: '.trio', start: 'top bottom', end: 'bottom top', ...scrub } });
        });
      }

      // Closing lines slide in opposite directions while the block crosses the screen.
      document.querySelectorAll('.handoff blockquote span').forEach((line, i) => {
        const dir = i % 2 ? -1 : 1;
        gsap.fromTo(line, { xPercent: -5 * dir * k }, { xPercent: 5 * dir * k, ease: 'none', scrollTrigger: { trigger: '.handoff', start: 'top bottom', end: 'bottom top', ...scrub } });
      });
    });

    // Lines that arrive one after another.
    document.querySelectorAll('[data-lines]').forEach(block => {
      gsap.set(block, { autoAlpha: 1 });
      gsap.fromTo(block.children, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 1, ease: 'power4.out', stagger: 0.12, scrollTrigger: { trigger: block, start: 'top 78%', once: true } });
    });

    if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
    window.addEventListener('load', () => ScrollTrigger.refresh());
  });

  // Autoplaying demo videos: only while visible, and never under reduced motion.
  document.querySelectorAll('video[data-autoplay]').forEach(v => {
    if (reduce) { v.removeAttribute('autoplay'); v.controls = true; return; }
    new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.25 }).observe(v);
  });
})();
