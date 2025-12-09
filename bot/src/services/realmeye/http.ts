/**
 * HTTP utilities for RealmEye scraping.
 * Inspired by RealmEyeSharper's HTTP client configuration.
 */

/**
 * Base URL for RealmEye.
 * Mirrors RealmEyeSharper's Constants.BaseUrl
 */
export const REALMEYE_BASE_URL = 'https://www.realmeye.com';

/**
 * Player profile path segment.
 * Mirrors RealmEyeSharper's Constants.PlayerSegment
 */
export const PLAYER_SEGMENT = 'player';

/**
 * Custom User-Agent for Realmeye API requests.
 * Using a specific identifier to be respectful to Realmeye's servers.
 */
const CUSTOM_USER_AGENT = 'console-dungeoneer-sjkd (rotmg-raid-bot)';

/**
 * Rate limiting: Track the last request time to ensure 1 request per second.
 */
let lastRequestTime = 0;
const RATE_LIMIT_MS = 1000; // 1 second between requests

/**
 * Build the full URL for a player profile.
 * @param ign The player's in-game name
 * @returns Full URL to the player's RealmEye profile
 */
export function buildPlayerUrl(ign: string): string {
    return `${REALMEYE_BASE_URL}/${PLAYER_SEGMENT}/${encodeURIComponent(ign)}`;
}

/**
 * Fetch a RealmEye page with proper headers and rate limiting.
 * Analogous to RealmEyeSharper's HTTP client setup.
 * Rate limited to 1 request per second to be respectful to Realmeye's servers.
 * 
 * @param url The URL to fetch
 * @returns Response object or null if request failed
 */
export async function fetchRealmEyePage(url: string): Promise<Response | null> {
    // Enforce rate limiting: wait if needed to maintain 1 request per second
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < RATE_LIMIT_MS) {
        const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
        console.log(`[RealmEye HTTP] Rate limiting: waiting ${waitTime}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Update last request time
    lastRequestTime = Date.now();
    
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': CUSTOM_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
            // Reasonable timeout
            signal: AbortSignal.timeout(10000), // 10 seconds
        });

        return response;
    } catch (error) {
        // Network error, timeout, or other fetch failure
        console.error('[RealmEye HTTP] Failed to fetch page:', error);
        return null;
    }
}
