document.documentElement.classList.add('js-ready');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LANG_KEY = 'axis_lang';
const THEME_KEY = 'axis_theme';
const i18n = window.AXIS_I18N || { defaultLang: 'en', catalog: [], sourceHash: '0', strings: { en: {} } };
if (!i18n.strings) i18n.strings = { en: {} };
if (!i18n.strings.en) i18n.strings.en = {};

let currentLang = i18n.defaultLang;
let latestCount = '…';
let themeAnimTimer = 0;
let langFocusIndex = -1;
let langBusy = false;

const TR_CACHE_PREFIX = 'axis_tr_';
const TR_SEP = ' |#| ';
const TR_CHUNK_CHARS = 1400;
const TR_PARALLEL = 10;
const PROTECT_RE =
    /\b(Axis|macOS|GitHub|Apple Silicon|HTTPS|JavaScript|Electron|Windows|Linux|JS)\b|\{count\}|<[^>]+>/g;
const packInflight = new Map();

const header = document.querySelector('.site-header');
const langPicker = document.getElementById('lang-picker');
const langTrigger = document.getElementById('lang-trigger');
const langTriggerText = document.getElementById('lang-trigger-text');
const langTriggerCode = document.getElementById('lang-trigger-code');
const langPanel = document.getElementById('lang-panel');
const langList = document.getElementById('lang-list');
const langSearch = document.getElementById('lang-search');
const navToggle = document.querySelector('.nav-toggle');
const mobileNav = document.getElementById('mobile-nav');
const themeToggle = document.getElementById('theme-toggle');
const themeColorMeta = document.getElementById('theme-color-meta');

function catalogEntry(code) {
    if (!code) return i18n.catalog[0];
    const exact = i18n.catalog.find((l) => l.code === code);
    if (exact) return exact;
    const short = String(code).split('-')[0];
    return (
        i18n.catalog.find((l) => l.code === short) ||
        i18n.catalog.find((l) => l.code.startsWith(`${short}-`)) ||
        i18n.catalog[0]
    );
}

function t(key) {
    const pack = i18n.strings[currentLang] || {};
    const en = i18n.strings.en || {};
    return pack[key] ?? en[key] ?? key;
}

function protectText(text) {
    const tokens = [];
    const out = String(text).replace(PROTECT_RE, (match) => {
        const id = tokens.length;
        tokens.push(match);
        return `@@${id}@@`;
    });
    return { out, tokens };
}

function restoreText(text, tokens) {
    return String(text).replace(/@@\s*(\d+)\s*@@/g, (_, n) => tokens[Number(n)] ?? '');
}

async function translateRaw(text, tl) {
    const tryGoogle = async () => {
        const url = new URL('https://translate.googleapis.com/translate_a/single');
        url.searchParams.set('client', 'gtx');
        url.searchParams.set('sl', 'en');
        url.searchParams.set('tl', tl);
        url.searchParams.set('dt', 't');
        url.searchParams.set('q', text);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`google ${res.status}`);
        const data = await res.json();
        return (data[0] || []).map((row) => row[0] || '').join('');
    };

    const tryMyMemory = async () => {
        const url = new URL('https://api.mymemory.translated.net/get');
        url.searchParams.set('q', text);
        url.searchParams.set('langpair', `en|${tl}`);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`mymemory ${res.status}`);
        const data = await res.json();
        const out = data?.responseData?.translatedText;
        if (!out || /INVALID SOURCE LANGUAGE|QUERY LENGTH/i.test(out)) {
            throw new Error('mymemory bad payload');
        }
        return out;
    };

    try {
        return await tryGoogle();
    } catch {
        return tryMyMemory();
    }
}

function chunkIndices(lengths, maxChars) {
    const chunks = [];
    let start = 0;
    while (start < lengths.length) {
        let end = start;
        let size = 0;
        while (end < lengths.length) {
            const add = (end > start ? TR_SEP.length : 0) + lengths[end];
            if (end > start && size + add > maxChars) break;
            size += add;
            end += 1;
        }
        chunks.push([start, end]);
        start = end;
    }
    return chunks;
}

async function translateMany(texts, tl) {
    const protected = texts.map((text) => protectText(text || ''));
    const payloads = protected.map((p) => p.out);
    const results = payloads.slice();
    const ranges = chunkIndices(
        payloads.map((p) => p.length),
        TR_CHUNK_CHARS
    );

    const runRange = async ([start, end]) => {
        const slice = payloads.slice(start, end);
        if (!slice.length) return;
        if (slice.length === 1) {
            try {
                results[start] = await translateRaw(slice[0], tl);
            } catch {
                results[start] = slice[0];
            }
            return;
        }

        try {
            const joined = slice.join(TR_SEP);
            const translated = await translateRaw(joined, tl);
            const parts = translated.split(TR_SEP);
            if (parts.length === slice.length) {
                for (let i = 0; i < parts.length; i += 1) results[start + i] = parts[i];
                return;
            }
        } catch {
            /* fall through to parallel singles */
        }

        await Promise.all(
            slice.map(async (text, i) => {
                try {
                    results[start + i] = await translateRaw(text, tl);
                } catch {
                    results[start + i] = text;
                }
            })
        );
    };

    for (let i = 0; i < ranges.length; i += TR_PARALLEL) {
        await Promise.all(ranges.slice(i, i + TR_PARALLEL).map(runRange));
    }

    return results.map((text, i) => restoreText(text, protected[i].tokens));
}

function cacheKey(lang) {
    return `${TR_CACHE_PREFIX}${i18n.sourceHash || '0'}_${lang}`;
}

function readPackCache(lang) {
    try {
        const raw = localStorage.getItem(cacheKey(lang));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

function writePackCache(lang, pack) {
    try {
        localStorage.setItem(cacheKey(lang), JSON.stringify(pack));
    } catch {
        /* ignore quota */
    }
}

function hasLanguagePack(code) {
    if (code === 'en') return true;
    const mem = i18n.strings[code];
    if (mem && Object.keys(mem).length) return true;
    const cached = readPackCache(code);
    if (cached && Object.keys(cached).length) {
        i18n.strings[code] = cached;
        return true;
    }
    return false;
}

async function buildLanguagePack(code) {
    const entry = catalogEntry(code);
    const en = i18n.strings.en;
    const keys = Object.keys(en);
    const tl = entry.translate || code;
    const values = await translateMany(
        keys.map((key) => en[key]),
        tl
    );
    const pack = {};
    keys.forEach((key, i) => {
        pack[key] = values[i] || en[key];
    });
    i18n.strings[code] = pack;
    writePackCache(code, pack);
    return pack;
}

async function ensureLanguagePack(lang) {
    const entry = catalogEntry(lang);
    const code = entry.code;
    if (code === 'en') return i18n.strings.en;

    if (hasLanguagePack(code)) return i18n.strings[code];

    if (packInflight.has(code)) return packInflight.get(code);

    const pending = buildLanguagePack(code).finally(() => {
        packInflight.delete(code);
    });
    packInflight.set(code, pending);
    return pending;
}

function setLangLoading(on) {
    langBusy = on;
    langPicker?.classList.toggle('is-loading', on);
    if (langTrigger) langTrigger.disabled = on;
    const status = document.getElementById('lang-status');
    if (status) {
        status.hidden = !on;
        status.textContent = on ? t('nav.translating') : '';
    }
}

function paintLanguage() {
    const entry = catalogEntry(currentLang);
    document.documentElement.lang = entry.code;
    document.documentElement.dir = entry.dir || 'ltr';
    syncLangTrigger(entry);

    document.querySelectorAll('[data-i18n]').forEach((node) => {
        const key = node.getAttribute('data-i18n');
        const value = t(key);
        const attr = node.getAttribute('data-i18n-attr');
        if (attr) {
            node.setAttribute(attr, value);
            return;
        }
        if (node.hasAttribute('data-i18n-html')) node.innerHTML = value;
        else node.textContent = value;
        if (node.tagName === 'TITLE') document.title = value;
    });

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', t('meta.description'));

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', t('meta.title'));

    document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
        node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria')));
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
        node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
    });

    document.querySelectorAll('[data-i18n-alt]').forEach((node) => {
        node.setAttribute('alt', t(node.getAttribute('data-i18n-alt')));
    });

    document.querySelectorAll('.lang-option').forEach((btn) => {
        const on = btn.dataset.lang === currentLang;
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.classList.toggle('is-active', on);
    });

    updateDownloadMeta(latestCount);
    paintTheme(getTheme());
}

async function applyLanguage(code, { quiet = false } = {}) {
    const entry = catalogEntry(code) || catalogEntry('en');
    currentLang = entry.code;
    try {
        localStorage.setItem(LANG_KEY, currentLang);
    } catch {
        /* ignore */
    }

    const ready = hasLanguagePack(entry.code);
    paintLanguage();
    if (ready) return;

    if (!quiet) setLangLoading(true);
    try {
        await ensureLanguagePack(entry.code);
        if (currentLang === entry.code) paintLanguage();
    } finally {
        if (!quiet) setLangLoading(false);
    }
}

function getTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    try {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
    } catch {
        /* ignore */
    }
    return 'dark';
}

function paintTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    if (themeToggle) {
        const isLight = next === 'light';
        themeToggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
        themeToggle.setAttribute('aria-label', t(isLight ? 'nav.themeDark' : 'nav.themeLight'));
    }
    if (themeColorMeta) {
        themeColorMeta.setAttribute('content', next === 'light' ? '#f4f0e8' : '#0c0b0a');
    }
    try {
        localStorage.setItem(THEME_KEY, next);
    } catch {
        /* ignore */
    }
}

function applyTheme(theme, { animate = false } = {}) {
    const next = theme === 'light' ? 'light' : 'dark';
    if (next === getTheme() && document.documentElement.getAttribute('data-theme') === next) {
        paintTheme(next);
        return;
    }

    const run = () => paintTheme(next);

    if (!animate || prefersReducedMotion) {
        run();
        return;
    }

    if (typeof document.startViewTransition === 'function') {
        document.startViewTransition(run);
        return;
    }

    document.documentElement.classList.add('theme-animating');
    run();
    window.clearTimeout(themeAnimTimer);
    themeAnimTimer = window.setTimeout(() => {
        document.documentElement.classList.remove('theme-animating');
    }, 480);
}

function detectLang() {
    try {
        const saved = localStorage.getItem(LANG_KEY);
        if (saved) {
            const hit = catalogEntry(saved);
            if (hit && hit.code === saved) return saved;
            if (hit) return hit.code;
        }
    } catch {
        /* ignore */
    }
    const nav = (navigator.language || 'en').toLowerCase();
    if (nav.startsWith('zh-tw') || nav.startsWith('zh-hk') || nav.startsWith('zh-hant')) return 'zh-TW';
    if (nav.startsWith('zh')) return 'zh-CN';
    if (nav.startsWith('pt-br')) return 'pt-BR';
    if (nav.startsWith('he') || nav.startsWith('iw')) return 'he';
    const short = nav.split('-')[0];
    const hit = catalogEntry(short);
    return hit ? hit.code : 'en';
}

function updateDownloadMeta(countText) {
    latestCount = countText;
    const el = document.querySelector('[data-i18n-template="download.meta"]');
    if (!el) return;
    const html = t('download.meta').replace(
        '{count}',
        `<span id="mac-download-count">${String(countText)}</span>`
    );
    el.innerHTML = html;
}

function syncLangTrigger(entry) {
    if (langTriggerText) langTriggerText.textContent = entry.native;
    const codeLabel = String(entry.code || 'en').toUpperCase().split('-')[0];
    if (langTriggerCode) langTriggerCode.textContent = codeLabel;
    if (langTrigger) {
        const label = `${t('nav.lang')}: ${entry.native}`;
        langTrigger.setAttribute('aria-label', label);
    }
}

function sortedCatalog() {
    const list = [...(i18n.catalog || [])];
    list.sort((a, b) => {
        if (a.code === currentLang) return -1;
        if (b.code === currentLang) return 1;
        return String(a.native).localeCompare(String(b.native), undefined, { sensitivity: 'base' });
    });
    return list;
}

function buildLangList() {
    if (!langList) return;
    langList.innerHTML = '';
    sortedCatalog().forEach((lang) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        const selected = lang.code === currentLang;
        btn.type = 'button';
        btn.className = `lang-option${selected ? ' is-active' : ''}`;
        btn.dataset.lang = lang.code;
        btn.dataset.search = `${lang.native} ${lang.name} ${lang.code}`.toLowerCase();
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        btn.innerHTML = `
            <span class="lang-option-native">${lang.native}</span>
            <svg class="lang-option-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        `;
        btn.addEventListener('click', async () => {
            if (langBusy) return;
            await applyLanguage(lang.code);
            buildLangList();
            closeLangPanel();
            langTrigger?.focus();
        });
        li.appendChild(btn);
        langList.appendChild(li);
    });
}

function visibleLangOptions() {
    return [...document.querySelectorAll('.lang-option')].filter(
        (btn) => !btn.classList.contains('is-hidden')
    );
}

function setLangFocus(index) {
    const options = visibleLangOptions();
    if (!options.length) {
        langFocusIndex = -1;
        return;
    }
    langFocusIndex = ((index % options.length) + options.length) % options.length;
    options.forEach((btn, i) => {
        btn.classList.toggle('is-keyboard-focus', i === langFocusIndex);
        if (i === langFocusIndex) btn.focus({ preventScroll: true });
    });
}

function openLangPanel() {
    if (!langPanel || !langPicker || !langTrigger) return;
    buildLangList();
    langPanel.hidden = false;
    langPicker.classList.add('is-open');
    langTrigger.setAttribute('aria-expanded', 'true');
    langFocusIndex = -1;
    if (langSearch) {
        langSearch.value = '';
        filterLangList('');
        requestAnimationFrame(() => langSearch.focus({ preventScroll: true }));
    }
}

function closeLangPanel() {
    if (!langPanel || !langPicker || !langTrigger) return;
    langPanel.hidden = true;
    langPicker.classList.remove('is-open');
    langTrigger.setAttribute('aria-expanded', 'false');
    langFocusIndex = -1;
}

function filterLangList(query) {
    const q = query.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.lang-option').forEach((btn) => {
        const match = !q || (btn.dataset.search || '').includes(q);
        btn.classList.toggle('is-hidden', !match);
        btn.parentElement?.classList.toggle('is-hidden', !match);
        if (match) visible += 1;
    });
    const empty = document.getElementById('lang-empty');
    if (empty) empty.hidden = visible > 0;
    if (langList) langList.hidden = visible === 0;
    langFocusIndex = -1;
}

if (langTrigger) {
    langTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (langPanel?.hidden) openLangPanel();
        else closeLangPanel();
    });
}

if (langSearch) {
    langSearch.addEventListener('input', () => filterLangList(langSearch.value));
    langSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeLangPanel();
            langTrigger?.focus();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setLangFocus(0);
        } else if (e.key === 'Enter') {
            const first = visibleLangOptions()[0];
            if (first) first.click();
        }
    });
}

if (langList) {
    langList.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setLangFocus(langFocusIndex + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (langFocusIndex <= 0) {
                langSearch?.focus();
                langFocusIndex = -1;
            } else {
                setLangFocus(langFocusIndex - 1);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeLangPanel();
            langTrigger?.focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            setLangFocus(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            setLangFocus(visibleLangOptions().length - 1);
        }
    });
}

document.addEventListener('click', (e) => {
    if (!langPicker?.contains(e.target)) closeLangPanel();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLangPanel();
        if (mobileNav && !mobileNav.hidden) {
            mobileNav.hidden = true;
            navToggle?.setAttribute('aria-expanded', 'false');
        }
    }
});

buildLangList();

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        applyTheme(getTheme() === 'light' ? 'dark' : 'light', { animate: true });
    });
}

if (navToggle && mobileNav) {
    navToggle.addEventListener('click', () => {
        const open = mobileNav.hidden;
        mobileNav.hidden = !open;
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobileNav.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => {
            mobileNav.hidden = true;
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        window.scrollTo({
            top: target.offsetTop - 72,
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
    });
});

const sectionIds = ['features', 'privacy', 'values', 'download'];

function onScroll() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 20);

    const pos = window.scrollY + 120;
    let current = null;
    sectionIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= pos) current = id;
    });
    document.querySelectorAll('.nav a[href^="#"]').forEach((a) => {
        const id = a.getAttribute('href')?.slice(1);
        a.classList.toggle('is-active', id === current);
    });
}

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

function initReveals() {
    const reveals = [...document.querySelectorAll('.reveal')];
    if (prefersReducedMotion) {
        reveals.forEach((el) => el.classList.add('is-in'));
        return;
    }

    const heroReveals = reveals.filter((el) => el.closest('.hero'));
    heroReveals.forEach((el, i) => {
        el.style.transitionDelay = `${0.04 + i * 0.07}s`;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.add('is-in'));
        });
    });

    const sectionIndex = new WeakMap();
    const revealNow = (el) => {
        el.classList.add('is-in');
    };

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                revealNow(entry.target);
                observer.unobserve(entry.target);
            });
        },
        { rootMargin: '0px 0px -40px 0px', threshold: 0.01 }
    );

    reveals
        .filter((el) => !el.closest('.hero'))
        .forEach((el) => {
            const section = el.closest('section') || el.parentElement;
            const i = sectionIndex.get(section) || 0;
            sectionIndex.set(section, i + 1);
            el.style.transitionDelay = `${Math.min(i, 5) * 0.05}s`;

            const rect = el.getBoundingClientRect();
            const inView = rect.top < window.innerHeight * 0.96 && rect.bottom > 48;
            if (inView) {
                requestAnimationFrame(() => revealNow(el));
            } else {
                observer.observe(el);
            }
        });
}

const DOWNLOAD_WORKER_BASE = 'https://axis-downloads.axis-browser-dl.workers.dev';
const DIRECT_DMG_URL =
    'https://media.githubusercontent.com/media/AbdelrahmanBerchan/axis.github.io/main/downloads/Axis-0.3.0-arm64.dmg';
const DEVICE_STORAGE_KEY = 'axis_device_id';

function getAxisDeviceId() {
    try {
        let id = localStorage.getItem(DEVICE_STORAGE_KEY);
        if (id && /^[A-Za-z0-9_-]{8,80}$/.test(id)) return id;
        id =
            (crypto.randomUUID && crypto.randomUUID().replace(/-/g, '')) ||
            `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem(DEVICE_STORAGE_KEY, id);
        return id;
    } catch {
        return '';
    }
}

function macDownloadUrl() {
    if (!DOWNLOAD_WORKER_BASE) return DIRECT_DMG_URL;
    const id = getAxisDeviceId();
    const base = `${DOWNLOAD_WORKER_BASE}/download/mac`;
    return id ? `${base}?device=${encodeURIComponent(id)}` : base;
}

const macBtn = document.getElementById('download-mac');
if (macBtn) {
    macBtn.href = macDownloadUrl();
    macBtn.addEventListener('click', () => {
        macBtn.href = macDownloadUrl();
        let ticks = 0;
        const timer = setInterval(() => {
            refreshMacDownloadCount();
            if (++ticks >= 10) clearInterval(timer);
        }, 2000);
    });
}

async function refreshMacDownloadCount() {
    if (!DOWNLOAD_WORKER_BASE) {
        updateDownloadMeta('…');
        return;
    }
    try {
        const res = await fetch(`${DOWNLOAD_WORKER_BASE}/api/count`, {
            headers: { accept: 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        const n = Number(data.count);
        const locale = currentLang === 'zh' ? 'zh-CN' : currentLang;
        updateDownloadMeta(Number.isFinite(n) ? n.toLocaleString(locale) : '0');
    } catch {
        updateDownloadMeta('…');
    }
}

refreshMacDownloadCount();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshMacDownloadCount();
});
setInterval(refreshMacDownloadCount, 30000);

function setupTilt(el) {
    if (prefersReducedMotion) return;
    const max = 7;
    const shine = el.querySelector('.frame-shine');

    const move = (e) => {
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        el.style.setProperty('--tilt-y', `${((px - 0.5) * max * 2).toFixed(2)}deg`);
        el.style.setProperty('--tilt-x', `${((0.5 - py) * max * 2).toFixed(2)}deg`);
        el.style.setProperty('--spot-x', `${(px * 100).toFixed(1)}%`);
        el.style.setProperty('--spot-y', `${(py * 100).toFixed(1)}%`);
        el.classList.add('is-active');
        if (shine) shine.style.opacity = '1';
    };

    const reset = () => {
        el.style.setProperty('--tilt-x', '0deg');
        el.style.setProperty('--tilt-y', '0deg');
        el.classList.remove('is-active');
        if (shine) shine.style.opacity = '';
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', reset);
    el.addEventListener('pointercancel', reset);
}

document.querySelectorAll('[data-tilt]').forEach(setupTilt);

function prefetchLanguage(code) {
    const entry = catalogEntry(code);
    if (!entry || entry.code === 'en' || hasLanguagePack(entry.code)) return Promise.resolve();
    return ensureLanguagePack(entry.code).catch(() => {});
}

function scheduleLangPrefetch() {
    const warm = async () => {
        const queue = [navigator.language || '', 'es', 'fr', 'de', 'pt-BR', 'ja', 'zh-CN'];
        const seen = new Set(['en']);
        for (const code of queue) {
            const entry = catalogEntry(code);
            if (!entry || seen.has(entry.code)) continue;
            seen.add(entry.code);
            if (document.hidden) break;
            await prefetchLanguage(entry.code);
        }
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => {
            warm();
        }, { timeout: 2500 });
    } else {
        setTimeout(warm, 1200);
    }
}

applyLanguage(detectLang(), { quiet: true }).finally(() => {
    paintTheme(getTheme());
    initReveals();
    scheduleLangPrefetch();
});
