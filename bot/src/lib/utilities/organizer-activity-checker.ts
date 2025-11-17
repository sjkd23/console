/**
 * Utilities for checking organizer's active runs and headcounts
 * Consolidates duplicate logic from run.ts and headcount.ts
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { getActiveRunsByOrganizer } from './http.js';
import { hasActiveHeadcount, getActiveHeadcount } from '../state/active-headcount-tracker.js';
import { buildDiscordMessageLink } from './discord-link-helpers.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('OrganizerActivityChecker');

export interface ActiveRunInfo {
    id: number;
    dungeonLabel: string;
    status: 'open' | 'live';
    createdAt: string;
    channelId: string;
    postMessageId: string | null;
}

export interface ActivityCheckResult {
    hasActiveRun: boolean;
    hasActiveHeadcount: boolean;
    errorMessage: string | null;
}

/**
 * Checks if an organizer has any active runs or headcounts and builds appropriate error messages
 * @param interaction - The command interaction
 * @param guildId - The guild ID to check in
 * @param organizerId - The organizer's user ID
 * @returns Result indicating if organizer has active activities and error message if applicable
 */
export async function checkOrganizerActiveActivities(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    organizerId: string
): Promise<ActivityCheckResult> {
    // Check for active runs
    try {
        const { activeRuns } = await getActiveRunsByOrganizer(guildId, organizerId);
        
        if (activeRuns.length > 0) {
            const activeRun = activeRuns[0] as ActiveRunInfo;
            const errorMessage = buildActiveRunErrorMessage(guildId, activeRun);
            return {
                hasActiveRun: true,
                hasActiveHeadcount: false,
                errorMessage
            };
        }
    } catch (err) {
        logger.error('Failed to check for active runs', {
            guildId,
            organizerId,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
        });
        // Don't block on API failure - allow the operation to continue
    }

    // Check for active headcount
    if (hasActiveHeadcount(guildId, organizerId)) {
        const activeHeadcount = getActiveHeadcount(guildId, organizerId);
        if (activeHeadcount) {
            const errorMessage = buildActiveHeadcountErrorMessage(guildId, activeHeadcount);
            return {
                hasActiveRun: false,
                hasActiveHeadcount: true,
                errorMessage
            };
        }
    }

    return {
        hasActiveRun: false,
        hasActiveHeadcount: false,
        errorMessage: null
    };
}

/**
 * Builds error message for when organizer has an active run
 */
function buildActiveRunErrorMessage(guildId: string, activeRun: ActiveRunInfo): string {
    let message = `⚠️ **You already have an active run**\n\n`;
    message += `**Dungeon:** ${activeRun.dungeonLabel}\n`;
    message += `**Status:** ${activeRun.status === 'open' ? '⏳ Starting Soon' : '🔴 Live'}\n`;
    message += `**Created:** <t:${Math.floor(new Date(activeRun.createdAt).getTime() / 1000)}:R>\n\n`;
    
    if (activeRun.channelId && activeRun.postMessageId) {
        const runLink = buildDiscordMessageLink(guildId, activeRun.channelId, activeRun.postMessageId);
        message += `[Jump to Run](${runLink})\n\n`;
    }
    
    message += `Please end or cancel your current run before starting a new one.\n\n`;
    message += `**To end your run:**\n`;
    message += `• Click the "Organizer Panel" button on your active run\n`;
    message += `• Use the "End Run" or "Cancel Run" button\n\n`;
    message += `*If your run is glitched and you can't end it, contact a server admin for help.*`;
    
    return message;
}

/**
 * Builds error message for when organizer has an active headcount
 */
function buildActiveHeadcountErrorMessage(
    guildId: string,
    activeHeadcount: { channelId: string; messageId: string; dungeons: string[]; createdAt: Date }
): string {
    const headcountLink = buildDiscordMessageLink(guildId, activeHeadcount.channelId, activeHeadcount.messageId);
    
    let message = `⚠️ **You have an active headcount**\n\n`;
    message += `**Dungeons:** ${activeHeadcount.dungeons.join(', ')}\n`;
    message += `**Created:** <t:${Math.floor(activeHeadcount.createdAt.getTime() / 1000)}:R>\n\n`;
    message += `[Jump to Headcount](${headcountLink})\n\n`;
    message += `Please end your headcount before starting a run.\n\n`;
    message += `**To end your headcount:**\n`;
    message += `• Click the "Organizer Panel" button on your active headcount\n`;
    message += `• Use the "End Headcount" button`;
    
    return message;
}

/**
 * Builds error message for when organizer tries to create headcount but has active run
 * (Slight variation in wording)
 */
export function buildActiveRunErrorForHeadcount(guildId: string, activeRun: ActiveRunInfo): string {
    let message = `⚠️ **You already have an active run**\n\n`;
    message += `**Dungeon:** ${activeRun.dungeonLabel}\n`;
    message += `**Status:** ${activeRun.status === 'open' ? '⏳ Starting Soon' : '🔴 Live'}\n`;
    message += `**Created:** <t:${Math.floor(new Date(activeRun.createdAt).getTime() / 1000)}:R>\n\n`;
    
    if (activeRun.channelId && activeRun.postMessageId) {
        const runLink = buildDiscordMessageLink(guildId, activeRun.channelId, activeRun.postMessageId);
        message += `[Jump to Run](${runLink})\n\n`;
    }
    
    message += `Please end or cancel your current run before starting a headcount.\n\n`;
    message += `**To end your run:**\n`;
    message += `• Click the "Organizer Panel" button on your active run\n`;
    message += `• Use the "End Run" or "Cancel Run" button`;
    
    return message;
}

/**
 * Builds error message for when organizer tries to create headcount but has active headcount
 * (Slight variation in wording)
 */
export function buildActiveHeadcountErrorForHeadcount(
    guildId: string,
    activeHeadcount: { channelId: string; messageId: string; dungeons: string[]; createdAt: Date }
): string {
    const headcountLink = buildDiscordMessageLink(guildId, activeHeadcount.channelId, activeHeadcount.messageId);
    
    let message = `⚠️ **You already have an active headcount**\n\n`;
    message += `**Dungeons:** ${activeHeadcount.dungeons.join(', ')}\n`;
    message += `**Created:** <t:${Math.floor(activeHeadcount.createdAt.getTime() / 1000)}:R>\n\n`;
    message += `[Jump to Headcount](${headcountLink})\n\n`;
    message += `Please end your current headcount before starting a new one.\n\n`;
    message += `**To end your headcount:**\n`;
    message += `• Click the "Organizer Panel" button on your active headcount\n`;
    message += `• Use the "End Headcount" button`;
    
    return message;
}
