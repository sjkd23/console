import type { GuildMember } from 'discord.js';

/** Organizer if:
 *  - has role ORGANIZER_ROLE_ID (if set)
 *  - OR matches the organizer mention in the embed description: "Organizer: <@123...>"
 */
export function isOrganizer(member: GuildMember | null, organizerIdInEmbed?: string): boolean {
    if (!member) return false;

    const roleId = process.env.ORGANIZER_ROLE_ID;
    if (roleId && member.roles.cache.has(roleId)) return true;

    if (organizerIdInEmbed && member.id === organizerIdInEmbed) return true;

    return false;
}

/** Extracts the first <@123...> mention id from a string. */
export function extractFirstUserMentionId(text?: string | null): string | undefined {
    if (!text) return;
    const m = text.match(/<@(\d{5,})>/);
    return m?.[1];
}
