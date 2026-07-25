/**
 * Axis download counter (Cloudflare Worker)
 *
 * - Streams the DMG through this worker
 * - Increments only when the full file was sent (cancel mid-way = no count)
 * - Treats post-completion TCP resets as success (browsers often RST after finish)
 * - Rate-limits by IP so the number cannot be farmed
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
        note: 'Count increases only after a full successful download finishes.',
    });
}

async function handleDownload(request, env, ctx) {
    const allowed = parseAllowed(env);
    const maxPerDay = Math.max(1, Number.parseInt(env.MAX_PER_IP_PER_DAY || '3', 10) || 3);
    const ip = clientIp(request);

    if (!isAllowedReferrer(request, allowed)) {
        return json({ error: 'Download must be started from the Axis website.' }, 403);
    }

    const rlKey = dayKey(ip);
    const used = Number.parseInt((await env.DOWNLOADS.get(rlKey)) || '0', 10) || 0;
    if (used >= maxPerDay) {
        return json(
            {
                error: 'Daily download limit reached for this network. Try again tomorrow.',
            },
            429
        );
    }

    const upstream = await fetch(env.DMG_URL, {
        headers: { 'user-agent': 'Axis-Download-Worker/1.0' },
        cf: { cacheEverything: true, cacheTtl: 86400 },
    });

    if (!upstream.ok || !upstream.body) {
        return json({ error: 'Could not fetch release file.' }, 502);
    }

    const contentLengthHeader = upstream.headers.get('content-length');
    const expected = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
    const hasExpected = Number.isFinite(expected) && expected > 0;
    const filename = env.DMG_FILENAME || 'Axis-0.3.0-arm64.dmg';

    const { readable, writable } = new TransformStream();
    let bytes = 0;

    const pump = (async () => {
        const reader = upstream.body.getReader();
        const writer = writable.getWriter();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                await writer.write(value);
            }
            await writer.close();
            return 'clean';
        } catch {
            try {
                await writer.abort();
            } catch {
                /* ignore */
            }
            try {
                await reader.cancel();
            } catch {
                /* ignore */
            }
            return 'aborted';
        }
    })();

    ctx.waitUntil(
        pump.then(async (status) => {
            const deliveredFull = hasExpected ? bytes >= expected : status === 'clean';
            // Browsers often reset the socket right after the last byte — treat that as success.
            if (!deliveredFull) return;
            await incrementCount(env, rlKey, maxPerDay);
        })
    );

    const headers = new Headers();
    headers.set('content-type', 'application/octet-stream');
    headers.set('content-disposition', `attachment; filename="${filename}"`);
    headers.set('cache-control', 'no-store');
    headers.set('x-content-type-options', 'nosniff');
    if (hasExpected) headers.set('content-length', String(expected));

    return new Response(readable, { status: 200, headers });
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
            if (request.method === 'HEAD') {
                const upstream = await fetch(env.DMG_URL, { method: 'HEAD' });
                return new Response(null, {
                    status: upstream.status,
                    headers: {
                        'content-type': 'application/octet-stream',
                        'content-disposition': `attachment; filename="${env.DMG_FILENAME || 'Axis-0.3.0-arm64.dmg'}"`,
                        'content-length': upstream.headers.get('content-length') || '',
                    },
                });
            }
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
