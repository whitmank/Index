// Author: Claude Code
// Safari context handler: reads the active tab URL via AppleScript and fetches OG metadata

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * @param {string} appName
 * @returns {boolean}
 */
export function canHandle(appName) {
  return appName === 'Safari';
}

/**
 * Read Safari's active tab URL + title via AppleScript, then enrich with OG metadata.
 * @returns {Promise<{name: string, uri: string, mediaTypeHint: string}|null>}
 */
export async function capture() {
  let url, title;

  try {
    const { stdout } = await execAsync(
      `osascript -e 'tell application "Safari"\nset tabURL to URL of current tab of front window\nset tabName to name of current tab of front window\nreturn tabURL & "\\n" & tabName\nend tell'`
    );
    const lines = stdout.trim().split('\n');
    url = lines[0]?.trim();
    title = lines.slice(1).join(' ').trim() || url;
  } catch (err) {
    console.error('[Capture:Safari] AppleScript failed:', err.message);
    return null;
  }

  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    console.warn('[Capture:Safari] No valid URL from Safari:', url);
    return null;
  }

  // Attempt OG metadata fetch — non-fatal if it fails
  let ogTitle = null;
  let ogType = null;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      // Only read enough of the body to find the <head> section
      const reader = response.body.getReader();
      let html = '';
      let headClosed = false;

      while (!headClosed) {
        const { done, value } = await reader.read();
        if (done) break;
        html += new TextDecoder().decode(value);
        if (html.toLowerCase().includes('</head>')) {
          headClosed = true;
        }
        // Safety limit: don't read more than 64 KB
        if (html.length > 65536) break;
      }
      reader.cancel();

      const head = html.slice(0, html.toLowerCase().indexOf('</head>') + 7);
      ogTitle = extractMetaContent(head, 'og:title');
      ogType = extractMetaContent(head, 'og:type');
    }
  } catch (err) {
    console.warn('[Capture:Safari] OG fetch failed (non-fatal):', err.message);
  }

  return {
    name: ogTitle || title,
    uri: url,
    // Use og:type verbatim; fall back to 'website' when absent
    mediaTypeHint: ogType || 'website',
  };
}

/**
 * Extract the content attribute of a named <meta property="..."> or <meta name="..."> tag.
 * @param {string} head - HTML head section string
 * @param {string} property - e.g. 'og:title'
 * @returns {string|null}
 */
function extractMetaContent(head, property) {
  // Match <meta property="og:title" content="..."> or attribute order reversed
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
  ];

  for (const re of patterns) {
    const match = head.match(re);
    if (match) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

/**
 * Decode common HTML entities in OG tag values.
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
