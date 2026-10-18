/**
 * Axis site analytics (GA4).
 * Measurement ID: G-1PCWZFPMH9
 */
(function () {
    var MEASUREMENT_ID = 'G-1PCWZFPMH9';

    window.dataLayer = window.dataLayer || [];
    function gtag() {
        window.dataLayer.push(arguments);
    }
    window.gtag = window.gtag || gtag;

    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
        anonymize_ip: true,
        send_page_view: true,
    });

    function track(name, params) {
        if (typeof window.gtag !== 'function') return;
        window.gtag('event', name, params || {});
    }

    window.axisTrack = track;

    function hostOf(url) {
        try {
            return new URL(url, window.location.href).hostname.replace(/^www\./, '');
        } catch (_) {
            return '';
        }
    }

    function labelFor(el, href) {
        var text = (el.getAttribute('aria-label') || el.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80);
        if (text) return text;
        return href || 'link';
    }

    document.addEventListener(
        'click',
        function (e) {
            var el = e.target && e.target.closest ? e.target.closest('a, button') : null;
            if (!el) return;

            if (el.id === 'download-mac' || el.classList.contains('download-primary')) {
                track('download_click', {
                    event_category: 'download',
                    event_label: 'macOS',
                    file_name: 'Axis-0.3.2-a-arm64.dmg',
                    page_path: location.pathname,
                });
                return;
            }

            if (el.id === 'theme-toggle') {
                track('theme_toggle', {
                    event_category: 'ui',
                    page_path: location.pathname,
                });
                return;
            }

            if (el.tagName !== 'A') return;
            var href = el.getAttribute('href') || '';
            if (!href || href === '#' || href.charAt(0) === '#') {
                if (href === '#download') {
                    track('cta_click', {
                        event_category: 'engagement',
                        event_label: 'hero_download_anchor',
                        page_path: location.pathname,
                    });
                }
                return;
            }

            var host = hostOf(href);
            var label = labelFor(el, href);
            var page = location.pathname || '/';

            if (host.indexOf('discord.') === 0 || href.indexOf('discord.gg/') !== -1) {
                track('outbound_click', {
                    event_category: 'outbound',
                    event_label: 'discord',
                    link_url: href,
                    link_text: label,
                    page_path: page,
                    page_location: location.href,
                });
                if (page.indexOf('join') !== -1) {
                    track('join_discord_click', {
                        event_category: 'join',
                        event_label: label,
                        page_path: page,
                    });
                }
                return;
            }

            if (host === 'github.com' || host === 'x.com' || host === 'twitter.com' || host === 'patreon.com') {
                var network =
                    host === 'github.com'
                        ? 'github'
                        : host === 'patreon.com'
                          ? 'patreon'
                          : 'x';
                track('outbound_click', {
                    event_category: 'outbound',
                    event_label: network,
                    link_url: href,
                    link_text: label,
                    page_path: page,
                });
                return;
            }

            if (el.classList.contains('join-brand') || (page.indexOf('join') !== -1 && host === 'axis-browser.com')) {
                track('join_website_click', {
                    event_category: 'join',
                    event_label: label,
                    link_url: href,
                    page_path: page,
                });
            }
        },
        true
    );
})();
