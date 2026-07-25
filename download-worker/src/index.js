/**
 * Axis download counter (Cloudflare Worker)
 *
 * Flow:
 *   GET /download/mac?device=<id>  →  302 to the real GitHub LFS DMG
 *   Count +1 at most once per device id (browser), forever
 *
 * Uninstalls cannot be detected from a website download counter.
 *
 * - No public API to set/edit the count
 * - Stats: GET /api/stats with Authorization: Bearer <STATS_SECRET>
 * - Public read-only: GET /api/count  →  { "count": 123 }
 */

const COUNT_KEY = 'downloads:mac:total';
const DEVICE_COOKIE = 'axis_device';
const DAY_MS = 24 * 60 * 60 * 1000;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5; // 5 years

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

    if (!origin && !referer) return true;
    return false;
}

function getCookie(request, name) {
    const raw = request.headers.get('Cookie') || '';
    for (const part of raw.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

/** Accept site UUIDs / opaque ids; reject junk. */
function normalizeDeviceId(value) {
    const id = String(value || '').trim().slice(0, 80);
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return '';
    return id;
}

function randomDeviceId() {
    return crypto.randomUUID().replace(/-/g, '');
}

async function getCount(env) {
    const raw = await env.DOWNLOADS.get(COUNT_KEY);
    const n = Number.parseInt(raw || '0', 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function tryCountDevice(env, deviceId, ip, maxNewDevicesPerIpPerDay) {
    const deviceKey = `device:${deviceId}`;
    const already = await env.DOWNLOADS.get(deviceKey);
    if (already) return { counted: false, reason: 'already' };

    // Soft anti-farm: limit how many *new* devices one IP can register per day
    const rlKey = dayKey(ip);
    const used = Number.parseInt((await env.DOWNLOADS.get(rlKey)) || '0', 10) || 0;
    if (used >= maxNewDevicesPerIpPerDay) {
        return { counted: false, reason: 'ip_limit' };
    }

    await env.DOWNLOADS.put(deviceKey, '1');
    await env.DOWNLOADS.put(rlKey, String(used + 1), {
        expirationTtl: Math.ceil(DAY_MS / 1000) + 3600,
    });

    const current = await getCount(env);
    await env.DOWNLOADS.put(COUNT_KEY, String(current + 1));
    return { counted: true, reason: 'new' };
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
        note: 'Count increases at most once per device (browser id). Uninstalls are not detectable.',
    });
}

async function handleDownload(request, env, ctx) {
    const allowed = parseAllowed(env);
    const maxNewDevicesPerIpPerDay = Math.max(
        1,
        Number.parseInt(env.MAX_NEW_DEVICES_PER_IP_PER_DAY || '5', 10) || 5
    );
    const ip = clientIp(request);
    const dmgUrl = env.DMG_URL;
    const url = new URL(request.url);

    if (!dmgUrl) {
        return json({ error: 'DMG_URL not configured' }, 500);
    }

    if (!isAllowedReferrer(request, allowed)) {
        return json({ error: 'Download must be started from the Axis website.' }, 403);
    }

    let deviceId =
        normalizeDeviceId(url.searchParams.get('device')) ||
        normalizeDeviceId(getCookie(request, DEVICE_COOKIE));

    if (!deviceId) {
        deviceId = randomDeviceId();
    }

    // Always send the intact file. Count only the first time we see this device.
    ctx.waitUntil(tryCountDevice(env, deviceId, ip, maxNewDevicesPerIpPerDay));

    return new Response(null, {
        status: 302,
        headers: {
            location: dmgUrl,
            'cache-control': 'no-store',
            'content-disposition': `attachment; filename="${env.DMG_FILENAME || 'Axis-0.3.0-arm64.dmg'}"`,
            'set-cookie': `${DEVICE_COOKIE}=${encodeURIComponent(deviceId)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; Secure; SameSite=Lax; HttpOnly`,
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
