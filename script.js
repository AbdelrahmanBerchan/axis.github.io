const navMenu = document.getElementById('nav-menu');
const navToggle = document.querySelector('.nav-toggle');
const navbar = document.querySelector('.navbar');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sections = [
    { id: 'features', link: navMenu?.querySelector('a[href="#features"]') },
    { id: 'values', link: navMenu?.querySelector('a[href="#values"]') },
    { id: 'download', link: navMenu?.querySelector('a[href="#download"]') },
].filter(s => s.link);

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') return;

        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();
        const offsetTop = target.offsetTop - 88;
        window.scrollTo({
            top: offsetTop,
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });

        closeMobileMenu();
    });
});

function closeMobileMenu() {
    if (navMenu?.classList.contains('active')) {
        navMenu.classList.remove('active');
        navToggle?.classList.remove('active');
        navToggle?.setAttribute('aria-expanded', 'false');
    }
}

function updateNavbar() {
    if (!navbar) return;
    navbar.classList.toggle('scrolled', window.pageYOffset > 40);
}

function updateActiveNav() {
    if (!sections.length) return;

    const scrollPos = window.pageYOffset + 120;
    let current = null;

    for (const { id } of sections) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= scrollPos) {
            current = id;
        }
    }

    sections.forEach(({ id, link }) => {
        link.classList.toggle('active', id === current);
    });
}

function updateParallax() {
    if (prefersReducedMotion) return;

    const browserMockup = document.querySelector('.browser-mockup-container');
    if (!browserMockup) return;

    const scrolled = window.pageYOffset;
    if (scrolled < window.innerHeight) {
        browserMockup.style.setProperty('--mockup-lift', `${scrolled * 0.12}px`);
    }
}

let scrollTicking = false;
window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
        updateNavbar();
        updateActiveNav();
        updateParallax();
        scrollTicking = false;
    });
}, { passive: true });

updateNavbar();
updateActiveNav();

const mockupContainer = document.querySelector('.browser-mockup-container');
if (mockupContainer) {
    mockupContainer.addEventListener('mouseenter', () => mockupContainer.classList.add('is-flat'));
    mockupContainer.addEventListener('mouseleave', () => mockupContainer.classList.remove('is-flat'));
}

if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
        const isOpen = navMenu.classList.toggle('active');
        navToggle.classList.toggle('active', isOpen);
        navToggle.setAttribute('aria-expanded', isOpen);
    });
}

document.addEventListener('click', (e) => {
    if (!navMenu || !navToggle) return;
    if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
        closeMobileMenu();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileMenu();
});

const revealElements = document.querySelectorAll('.reveal');

function showReveal(el, delay = 0) {
    setTimeout(() => el.classList.add('visible'), delay);
}

if (revealElements.length && !prefersReducedMotion) {
    const heroReveals = document.querySelectorAll('.hero .reveal');
    heroReveals.forEach((el, i) => showReveal(el, i * 60));

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const el = entry.target;
            if (el.closest('.hero')) return;

            const parent = el.closest('.feature-list, .values-grid, .download-content, .productivity-text, .values-text');
            let delay = 0;

            if (parent) {
                const siblings = [...parent.querySelectorAll('.reveal:not(.visible)')];
                delay = siblings.indexOf(el) * 70;
            }

            showReveal(el, delay);
            revealObserver.unobserve(el);
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -48px 0px'
    });

    revealElements.forEach(el => {
        if (!el.closest('.hero')) revealObserver.observe(el);
    });
} else {
    revealElements.forEach(el => el.classList.add('visible'));
}

document.querySelectorAll('.btn-primary, .nav-link--cta').forEach(btn => {
    btn.addEventListener('click', function (e) {
        if (prefersReducedMotion) return;

        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        ripple.classList.add('ripple');

        this.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    });
});

window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});

function initCustomCursor() {
    if (prefersReducedMotion || !window.matchMedia('(pointer: fine)').matches) return;

    const INTERACTIVE =
        'a, button, .btn-primary, .btn-secondary, .nav-link, .nav-toggle, .download-btn, .download-btn-wrapper, .footer-social-link, .skip-link, input, textarea, select, label[for], [role="button"]';

    const RING_DEFAULT = { w: 42, h: 42, r: 50 };
    const SPRING = {
        ring: { tension: 0.22, friction: 0.74 },
        glow: { tension: 0.1, friction: 0.84 },
        halo: { tension: 0.55, friction: 0.62 },
    };

    const root = document.createElement('div');
    root.className = 'cursor-root';

    const canvas = document.createElement('canvas');
    canvas.className = 'cursor-canvas';
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const glow = document.createElement('div');
    glow.className = 'cursor-glow';

    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    const ringOrbit = document.createElement('span');
    ringOrbit.className = 'cursor-ring-orbit';
    const ringFill = document.createElement('span');
    ringFill.className = 'cursor-ring-fill';
    const ringCore = document.createElement('span');
    ringCore.className = 'cursor-ring-core';
    ring.append(ringOrbit, ringFill, ringCore);

    const dotHalo = document.createElement('div');
    dotHalo.className = 'cursor-dot-halo';

    const dot = document.createElement('div');
    dot.className = 'cursor-dot';

    root.append(canvas, glow, ring, dotHalo, dot);
    [root, canvas, glow, ring, dotHalo, dot].forEach((el) => el.setAttribute('aria-hidden', 'true'));
    document.body.appendChild(root);
    document.body.classList.add('has-custom-cursor');

    const sparkPool = Array.from({ length: 12 }, () => {
        const el = document.createElement('span');
        el.className = 'cursor-spark';
        el.setAttribute('aria-hidden', 'true');
        root.appendChild(el);
        return { el, busy: false };
    });

    let dpr = 1;
    let cw = 0;
    let ch = 0;
    let x = -200;
    let y = -200;
    let prevX = x;
    let prevY = y;
    let haloX = x;
    let haloY = y;
    let haloVelX = 0;
    let haloVelY = 0;
    let ringX = x;
    let ringY = y;
    let ringVelX = 0;
    let ringVelY = 0;
    let glowX = x;
    let glowY = y;
    let glowVelX = 0;
    let glowVelY = 0;
    let ringW = RING_DEFAULT.w;
    let ringH = RING_DEFAULT.h;
    let ringR = RING_DEFAULT.r;
    let targetRing = { ...RING_DEFAULT };
    let vx = 0;
    let vy = 0;
    let hoverTarget = 0;
    let hoverBlend = 0;
    let pressTarget = 0;
    let pressBlend = 0;
    let visible = false;
    let rafId = null;
    let hoverEl = null;
    let orbitAngle = 0;
    let sectionZone = '';
    let lastHoverKey = '';
    let lastTrailX = x;
    let lastTrailY = y;

    const trail = [];
    const TRAIL_MAX = 28;
    const TRAIL_MIN_DIST = 5;
    const TRAIL_LIFE = 520;
    const TRAIL_LIFE_IDLE = 280;
    let lastMoveAt = 0;
    let trailOpacity = 0;
    const layers = [glow, ring, dotHalo, dot];

    const lerp = (a, b, t) => a + (b - a) * t;

    const setTransform = (el, px, py, extra = '') => {
        el.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)${extra}`;
    };

    const spring = (pos, vel, target, tension, friction) => {
        const force = (target - pos) * tension;
        const nextVel = (vel + force) * friction;
        return [pos + nextVel, nextVel];
    };

    const setCursorState = (mode, hovering, pressed) => {
        document.body.dataset.cursorMode = mode || 'default';
        document.body.dataset.cursorHover = hovering ? '1' : '0';
        document.body.dataset.cursorPress = pressed ? '1' : '0';
        document.documentElement.style.setProperty('--cursor-hover', String(hoverBlend));
    };

    const resizeCanvas = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        cw = window.innerWidth;
        ch = window.innerHeight;
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const pushTrailPoint = (px, py) => {
        const now = performance.now();
        const dist = Math.hypot(px - lastTrailX, py - lastTrailY);
        if (dist < TRAIL_MIN_DIST) return;
        lastTrailX = px;
        lastTrailY = py;
        lastMoveAt = now;
        trail.push({ x: px, y: py, t: now });
        if (trail.length > TRAIL_MAX) trail.shift();
    };

    const trailLifetime = (now) => {
        const idleMs = now - lastMoveAt;
        if (idleMs <= 60) return TRAIL_LIFE;
        return Math.max(70, TRAIL_LIFE_IDLE - idleMs * 0.5);
    };

    const pruneTrail = (now) => {
        const life = trailLifetime(now);
        while (trail.length && now - trail[0].t > life) {
            trail.shift();
        }
    };

    const pointFade = (now, t) => {
        const age = (now - t) / trailLifetime(now);
        return Math.max(0, 1 - age * 1.2);
    };

    const paintTrail = (now) => {
        ctx.clearRect(0, 0, cw, ch);

        if (hoverBlend > 0.5) {
            if (trail.length) trail.length = 0;
            trailOpacity = 0;
            return;
        }

        pruneTrail(now);

        const speed = Math.hypot(vx, vy);
        const moving = speed > 1.5;
        trailOpacity = lerp(trailOpacity, moving ? 1 : 0, moving ? 0.4 : 0.14);

        if (trail.length < 2 || trailOpacity < 0.02) {
            if (!trail.length) trailOpacity = 0;
            return;
        }

        const boost = (0.3 + Math.min(speed, 40) / 50) * trailOpacity;
        const idleMs = now - lastMoveAt;

        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 1; i < trail.length; i++) {
            const prev = trail[i - 1];
            const p = trail[i];
            const along = i / (trail.length - 1);
            const fadePrev = pointFade(now, prev.t);
            const fadeP = pointFade(now, p.t);
            const fade = Math.min(fadePrev, fadeP) * along;
            const alpha = fade * 0.7 * boost;
            if (alpha < 0.02) continue;

            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            if (i < trail.length - 1) {
                const next = trail[i + 1];
                const midX = (p.x + next.x) * 0.5;
                const midY = (p.y + next.y) * 0.5;
                ctx.quadraticCurveTo(p.x, p.y, midX, midY);
            } else {
                ctx.lineTo(p.x, p.y);
            }
            ctx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
            ctx.lineWidth = along * 4.5 + 0.5;
            ctx.stroke();
        }

        const head = trail[trail.length - 1];
        const headFade = pointFade(now, head.t) * trailOpacity;
        if (headFade > 0.03 && idleMs < 120) {
            ctx.beginPath();
            ctx.moveTo(head.x, head.y);
            ctx.lineTo(x, y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${headFade * 0.2 * boost})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        const headAlpha = headFade * 0.35 * boost;
        if (headAlpha > 0.02) {
            ctx.beginPath();
            ctx.arc(head.x, head.y, 2 + Math.min(speed * 0.04, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${headAlpha})`;
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';
    };

    const cursorMode = (el) => {
        if (!el) return '';
        if (el.matches('.nav-link--cta, .btn-primary')) return 'cta';
        if (el.closest('.download-btn-wrapper') || el.matches('.download-btn')) return 'download';
        if (el.matches('.footer-social-link')) return 'social';
        return 'link';
    };

    const updateRingTarget = () => {
        if (!hoverEl) {
            targetRing = { ...RING_DEFAULT };
            return;
        }
        const rect = hoverEl.getBoundingClientRect();
        const mode = ring.dataset.mode;
        const pad = mode === 'download' ? 10 : mode === 'social' ? 10 : 12;
        const maxW = mode === 'social' ? 48 : Math.min(window.innerWidth * 0.48, 280);
        const maxH = mode === 'social' ? 48 : 128;

        targetRing = {
            w: Math.min(Math.max(rect.width + pad, 38), maxW),
            h: Math.min(Math.max(rect.height + pad, 38), maxH),
            r: mode === 'download' ? 14 : mode === 'social' ? 50 : 999,
        };
    };

    const magneticTarget = () => {
        if (!hoverEl) return { tx: x, ty: y };
        const rect = hoverEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const mode = ring.dataset.mode;
        const pull =
            hoverBlend * (mode === 'download' ? 0.7 : mode === 'cta' ? 0.58 : 0.5) +
            (1 - hoverBlend) * 0.14;
        return { tx: x + (cx - x) * pull, ty: y + (cy - y) * pull };
    };

    const applyRingSize = () => {
        const radius = ringR > 100 ? '50%' : `${ringR}px`;
        ring.style.width = `${ringW}px`;
        ring.style.height = `${ringH}px`;
        ring.style.borderRadius = radius;
        ringCore.style.borderRadius = radius;
        ringOrbit.style.borderRadius = radius;
        ringFill.style.borderRadius = radius;
        ring.classList.toggle('is-morph', hoverBlend > 0.28);
        ringFill.style.opacity = String(Math.min(hoverBlend * 0.5, 0.45));
    };

    const dotScale = () => (pressTarget ? 0.72 : 1 + hoverBlend * 0.08);

    const updateDot = () => setTransform(dot, x, y, ` scale(${dotScale()})`);

    const updateHalo = () => {
        const size = 18 + hoverBlend * 14;
        setTransform(dotHalo, haloX, haloY, ` scale(${size / 18})`);
        dotHalo.style.opacity = String(0.25 + hoverBlend * 0.55);
    };

    const activateSpark = (slot) => {
        slot.el.classList.remove('is-active');
        void slot.el.offsetWidth;
        slot.el.classList.add('is-active');
        slot.busy = true;
        const done = () => {
            slot.el.classList.remove('is-active');
            slot.busy = false;
            slot.el.removeEventListener('animationend', done);
        };
        slot.el.addEventListener('animationend', done);
    };

    const spawnSparks = (px, py) => {
        for (let i = 0; i < 10; i++) {
            const slot = sparkPool.find((p) => !p.busy);
            if (!slot) break;
            const angle = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.4;
            const dist = 16 + Math.random() * 20;
            slot.el.style.setProperty('--tx', `${px}px`);
            slot.el.style.setProperty('--ty', `${py}px`);
            slot.el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
            slot.el.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
            activateSpark(slot);
        }
    };

    const spawnPulse = (px, py) => {
        const pulse = document.createElement('div');
        pulse.className = 'cursor-pulse';
        pulse.setAttribute('aria-hidden', 'true');
        pulse.style.setProperty('--tx', `${px}px`);
        pulse.style.setProperty('--ty', `${py}px`);
        root.appendChild(pulse);
        pulse.addEventListener('animationend', () => pulse.remove());
    };

    const show = () => {
        if (visible) return;
        visible = true;
        ringX = glowX = haloX = x;
        ringY = glowY = haloY = y;
        ringVelX = ringVelY = glowVelX = glowVelY = haloVelX = haloVelY = 0;
        trail.length = 0;
        lastTrailX = x;
        lastTrailY = y;
        lastMoveAt = performance.now();
        trailOpacity = 0;
        root.classList.add('is-visible');
        layers.forEach((el) => el.classList.add('is-visible'));
        updateDot();
        loop();
    };

    const hide = () => {
        visible = false;
        root.classList.remove('is-visible');
        layers.forEach((el) => el.classList.remove('is-visible', 'is-pressed', 'is-hover'));
        glow.classList.remove('is-spotlight');
        ring.classList.remove('is-morph');
        ring.dataset.mode = '';
        glow.dataset.zone = '';
        setCursorState('', false, false);
        trail.length = 0;
        ctx.clearRect(0, 0, cw, ch);
        lastHoverKey = '';
        hoverEl = null;
        hoverTarget = 0;
        pressTarget = 0;
        vx = vy = 0;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    };

    const loop = () => {
        if (!visible) return;

        const { tx, ty } = magneticTarget();

        [ringX, ringVelX] = spring(ringX, ringVelX, tx, SPRING.ring.tension, SPRING.ring.friction);
        [ringY, ringVelY] = spring(ringY, ringVelY, ty, SPRING.ring.tension, SPRING.ring.friction);
        [glowX, glowVelX] = spring(glowX, glowVelX, x, SPRING.glow.tension, SPRING.glow.friction);
        [glowY, glowVelY] = spring(glowY, glowVelY, y, SPRING.glow.tension, SPRING.glow.friction);
        [haloX, haloVelX] = spring(haloX, haloVelX, x, SPRING.halo.tension, SPRING.halo.friction);
        [haloY, haloVelY] = spring(haloY, haloVelY, y, SPRING.halo.tension, SPRING.halo.friction);

        hoverBlend += (hoverTarget - hoverBlend) * 0.22;
        pressBlend += (pressTarget - pressBlend) * 0.4;

        const morphEase = hoverBlend * hoverBlend;
        ringW = lerp(ringW, targetRing.w, 0.26 + morphEase * 0.1);
        ringH = lerp(ringH, targetRing.h, 0.26 + morphEase * 0.1);
        ringR = lerp(ringR, targetRing.r, 0.24);
        applyRingSize();

        const speed = Math.hypot(vx, vy);
        const speedClamped = Math.min(speed, 52);
        const stretch = 1 + speedClamped * 0.0035 * (1 - morphEase * 0.9);
        const squash = 2 - stretch;
        const moveAngle = (Math.atan2(vy, vx) * 180) / Math.PI;
        const mode = ring.dataset.mode;
        const modeBoost = mode === 'cta' ? 0.12 : mode === 'download' ? 0.16 : 0;
        const motionScale = 1 + (1 - morphEase) * hoverBlend * (0.32 + modeBoost);
        const pressMul = 1 - pressBlend * 0.32;
        const scaleX = motionScale * stretch * pressMul;
        const scaleY = motionScale * squash * pressMul;
        const idle = Math.max(0, 1 - speedClamped / 12);
        const t = performance.now() * 0.001;
        const breathe = 1 + Math.sin(t * 2.4) * 0.07 * idle;
        const glowScale = (1.12 + hoverBlend * 0.5 + modeBoost) * breathe;

        orbitAngle = (orbitAngle + 0.7 + speedClamped * 0.08 + morphEase) % 360;

        const ringRotate = morphEase > 0.35 ? 0 : speedClamped > 2.5 ? moveAngle : 0;
        setTransform(ring, ringX, ringY, ` rotate(${ringRotate}deg) scale(${scaleX}, ${scaleY})`);
        setTransform(glow, glowX, glowY, ` scale(${glowScale})`);
        updateDot();
        updateHalo();
        paintTrail(performance.now());

        const isHovering = hoverBlend > 0.04;
        const isPressed = pressBlend > 0.04;
        ring.classList.toggle('is-hover', isHovering);
        ring.classList.toggle('is-pressed', isPressed);
        dot.classList.toggle('is-hover', isHovering);
        dot.classList.toggle('is-pressed', isPressed);
        dotHalo.classList.toggle('is-hover', isHovering);
        glow.classList.toggle('is-hover', isHovering);
        setCursorState(mode, isHovering, isPressed);

        document.documentElement.style.setProperty('--cursor-orbit', `${orbitAngle}deg`);
        document.documentElement.style.setProperty(
            '--cursor-energy',
            String(Math.min(speedClamped / 52, 1) * (1 - hoverBlend * 0.7))
        );

        vx *= 0.75;
        vy *= 0.75;
        rafId = requestAnimationFrame(loop);
    };

    const onPointerMove = (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;

        prevX = x;
        prevY = y;
        x = e.clientX;
        y = e.clientY;
        vx = x - prevX;
        vy = y - prevY;
        if (Math.hypot(vx, vy) > 80) {
            vx = 0;
            vy = 0;
        }

        const now = performance.now();
        if (!visible) show();
        else {
            updateDot();
            pushTrailPoint(x, y);
            if (Math.hypot(vx, vy) < 0.4) pruneTrail(now);
        }

        const target = document.elementFromPoint(x, y);
        hoverEl = target?.closest(INTERACTIVE) ?? null;
        hoverTarget = hoverEl ? 1 : 0;

        const mode = cursorMode(hoverEl);
        ring.dataset.mode = mode;

        const hoverKey = hoverEl
            ? `${mode}:${Math.round(hoverEl.getBoundingClientRect().width)}:${Math.round(hoverEl.getBoundingClientRect().height)}`
            : '';

        if (hoverKey !== lastHoverKey) {
            lastHoverKey = hoverKey;
            if (hoverEl) updateRingTarget();
            else targetRing = { ...RING_DEFAULT };
        }

        const zone = target?.closest('section[id]')?.id || '';
        if (zone !== sectionZone) {
            sectionZone = zone;
            glow.dataset.zone = zone;
        }

        glow.classList.toggle(
            'is-spotlight',
            !!target?.closest('.browser-mockup-wrapper, .browser-mockup-container, .browser-screenshot')
        );
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener(
        'mousedown',
        () => {
            pressTarget = 1;
            updateDot();
            spawnPulse(x, y);
            spawnSparks(x, y);
            trail.length = 0;
        },
        { passive: true }
    );
    document.addEventListener(
        'mouseup',
        () => {
            pressTarget = 0;
            updateDot();
        },
        { passive: true }
    );
    document.documentElement.addEventListener('mouseleave', hide);
    window.addEventListener('blur', hide);
}

initCustomCursor();
