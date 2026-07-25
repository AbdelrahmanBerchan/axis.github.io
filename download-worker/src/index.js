/**
 * Axis download counter (Cloudflare Worker)
 *
 * IMPORTANT: We do NOT proxy the DMG bytes through this Worker.
 * Proxying large binaries was truncating/corrupting the file (~31MB of 117MB),
 * which made macOS report the app as damaged and move it to Trash.
 *
 * Flow:
 *   GET /download/mac  →  302 redirect to the real GitHub LFS DMG
 *   Count increments when a download is granted (rate-limited per IP)
 *
 * - No public API to set/edit the count
 * - Stats: GET /api/stats with Authorization: Bearer <STATS_SECRET>
 * - Public read-only: GET /api/count  →  { "count": 123 }
 */

const COUNT_KEY = 'downloads:mac:total';
const DAY_MS = 24 * 60 * 60 * 1000;

function json(data, status = 200, extra = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'access-control-allow-origin': '*',
            ...extra,
        },
    });
}

function parseAllowed(env) {
    return String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function clientIp(request) {
    return (
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
        'unknown'
    );
}

function dayKey(ip) {
    const day = new Date().toISOString().slice(0, 10);
    return `rl:${day}:${ip}`;
}

function isAllowedReferrer(request, allowed) {
    const origin = request.headers.get('Origin') || '';
    const referer = request.headers.get('Referer') || '';

    if (origin && allowed.includes(origin)) return true;
    if (referer) {
        try {
            const refOrigin = new URL(referer).origin;
            if (allowed.includes(refOrigin)) return true;
        } catch {
            /* ignore */
        }
    }

    // Direct hits (no Referer) — still allowed but rate-limited.
    if (!origin && !referer) return true;
    return false;
}

async function getCount(env) {
    const raw = await env.DOWNLOADS.get(COUNT_KEY);
    const n = Number.parseInt(raw || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function incrementCount(env, rlKey, maxPerDay) {
    const usedNow = Number.parseInt((await env.DOWNLOADS.get(rlKey)) || '0', 10) || 0;
    if (usedNow >= maxPerDay) return false;

    await env.DOWNLOADS.put(rlKey, String(usedNow + 1), {
        expirationTtl: Math.ceil(DAY_MS / 1000) + 3600,
    });

    const current = await getCount(env);
    await env.DOWNLOADS.put(COUNT_KEY, String(current + 1));
    return true;
}

async function handleCount(env) {
    const count = await getCount(env);
    return json({ count });
}

async function handleStats(request, env) {
    const secret = env.STATS_SECRET;
    if (!secret) {
        return json({ error: 'STATS_SECRET not configured' }, 500);
    }

    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || token !== secret) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const count = await getCount(env);
    return json({
        count,
        file: env.DMG_FILENAME || 'Axis-0.3.0-arm64.dmg',
        note: 'Count increases when a macOS download redirect is granted (file is served directly from GitHub for integrity).',
    });
}

async function handleDownload(request, env, ctx) {
    const allowed = parseAllowed(env);
    const maxPerDay = Math.max(1, Number.parseInt(env.MAX_PER_IP_PER_DAY || '100', 10) || 100);
    const ip = clientIp(request);
    const dmgUrl = env.DMG_URL;

    if (!dmgUrl) {
        return json({ error: 'DMG_URL not configured' }, 500);
    }

    if (!isAllowedReferrer(request, allowed)) {
        return json({ error: 'Download must be started from the Axis website.' }, 403);
    }

    const rlKey = dayKey(ip);
    const used = Number.parseInt((await env.DOWNLOADS.get(rlKey)) || '0', 10) || 0;

    // Always send people to the real intact file. Only skip counting when rate-limited.
    if (used < maxPerDay) {
        ctx.waitUntil(incrementCount(env, rlKey, maxPerDay));
    }

    return new Response(null, {
        status: 302,
        headers: {
            location: dmgUrl,
            'cache-control': 'no-store',
            // Help some clients keep a sensible filename after redirect.
            'content-disposition': `attachment; filename="${env.DMG_FILENAME || 'Axis-0.3.0-arm64.dmg'}"`,
        },
    });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'access-control-allow-origin': '*',
                    'access-control-allow-methods': 'GET, OPTIONS',
                    'access-control-allow-headers': 'Authorization, Content-Type',
                },
            });
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return json({ error: 'Method not allowed' }, 405);
        }

        if (url.pathname === '/api/count') {
            return handleCount(env);
        }

        if (url.pathname === '/api/stats') {
            return handleStats(request, env);
        }

        if (url.pathname === '/download/mac' || url.pathname === '/download/mac/') {
            return handleDownload(request, env, ctx);
        }

        return json({
            service: 'axis-downloads',
            endpoints: {
                download: '/download/mac',
                publicCount: '/api/count',
                privateStats: '/api/stats',
            },
        });
    },
};
