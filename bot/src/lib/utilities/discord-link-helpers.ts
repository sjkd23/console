/**
 * Utilities for building Discord message and channel links
 */

/**
 * Builds a Discord message link from guild, channel, and message IDs
 * @param guildId - The guild (server) ID
 * @param channelId - The channel ID
 * @param messageId - The message ID
 * @returns A fully formatted Discord message URL
 */
export function buildDiscordMessageLink(guildId: string, channelId: string, messageId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/**
 * Builds a Discord channel link from guild and channel IDs
 * @param guildId - The guild (server) ID
 * @param channelId - The channel ID
 * @returns A fully formatted Discord channel URL
 */
export function buildDiscordChannelLink(guildId: string, channelId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}`;
}
