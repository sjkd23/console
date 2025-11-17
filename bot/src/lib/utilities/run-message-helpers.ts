/**
 * Utilities for building run message content
 * Consolidates duplicate logic for formatting public run messages
 */

/**
 * Builds the public run message content with @here ping and optional party/location
 * @param party - Optional party name
 * @param location - Optional location/server
 * @param additionalPings - Optional array of role IDs to ping
 * @returns Formatted message content string
 */
export function buildRunMessageContent(
    party?: string | null,
    location?: string | null,
    additionalPings?: string[]
): string {
    let content = '@here';
    
    // Add additional role pings if provided
    if (additionalPings && additionalPings.length > 0) {
        for (const roleId of additionalPings) {
            content += ` <@&${roleId}>`;
        }
    }
    
    // Add party and location info if both are provided
    if (party && location) {
        content += ` Party: **${party}** | Location: **${location}**`;
    } else if (party) {
        content += ` Party: **${party}**`;
    } else if (location) {
        content += ` Location: **${location}**`;
    }
    
    return content;
}
