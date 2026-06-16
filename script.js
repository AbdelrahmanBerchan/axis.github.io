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
