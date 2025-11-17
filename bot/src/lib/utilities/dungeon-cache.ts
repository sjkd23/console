// In-memory cache for recently used dungeons per guild
// Used to provide better autocomplete suggestions

import type { DungeonInfo } from '../../constants/dungeons/dungeon-types.js';

interface CacheEntry {
    dungeonCode: string;
    timestamp: number;
}

const MAX_RECENT = 10;
const guildCache = new Map<string, CacheEntry[]>();

/**
 * Add a dungeon to the guild's recent list.
 * Maintains up to MAX_RECENT items, sorted by most recent first.
 */
export function addRecentDungeon(guildId: string, dungeonCode: string): void {
    const current = guildCache.get(guildId) || [];
    
    // Remove existing entry if present
    const filtered = current.filter(e => e.dungeonCode !== dungeonCode);
    
    // Add new entry at the front
    filtered.unshift({
        dungeonCode,
        timestamp: Date.now()
    });
    
    // Keep only MAX_RECENT
    guildCache.set(guildId, filtered.slice(0, MAX_RECENT));
}

/**
 * Get recently used dungeon codes for a guild.
 * Returns up to `limit` codes, ordered by most recent first.
 */
export function getRecentDungeons(guildId: string, limit = 10): string[] {
    const entries = guildCache.get(guildId) || [];
    return entries.slice(0, limit).map(e => e.dungeonCode);
}

/**
 * Clear the cache for a specific guild (useful for testing or cleanup).
 */
export function clearGuildCache(guildId: string): void {
    guildCache.delete(guildId);
}
