/**
 * Helper functions to automatically add organizers to their runs/headcounts upon creation.
 * This mirrors the behavior of manually clicking the join button.
 */

import { Client, EmbedBuilder, Message, Guild } from 'discord.js';
import { postJSON, getJSON } from './http.js';
import { assignRunRole } from './run-role-manager.js';
import { updateRunParticipation } from './run-embed-helpers.js';
import { logRaidJoin } from '../logging/raid-logger.js';
import { createLogger } from '../logging/logger.js';
import { getParticipants, updateParticipantsList } from '../state/headcount-state.js';

const logger = createLogger('AutoJoin');

/**
 * Automatically add the organizer to their run upon creation.
 * This simulates clicking the join button - adds to raiders table, assigns role, updates embed.
 */
export async function autoJoinOrganizerToRun(
    client: Client,
    guild: Guild,
    runMessage: Message,
    runId: number,
    organizerId: string,
    organizerUsername: string,
    dungeonKey: string,
    dungeonLabel: string,
    roleId: string | null
): Promise<void> {
    try {
        // Add organizer to the run in the database
        const result = await postJSON<{ joinCount: number; joined: boolean }>(
            `/runs/${runId}/reactions`,
            {
                userId: organizerId,
                state: 'join'
            },
            { guildId: guild.id }
        );

        // Assign the run role if it exists
        if (roleId) {
            const member = await guild.members.fetch(organizerId).catch(() => null);
            if (member) {
                await assignRunRole(member, roleId);
            }
        }

        // Fetch class counts to update the display
        const classRes = await getJSON<{ classCounts: Record<string, number> }>(
            `/runs/${runId}/classes`,
            { guildId: guild.id }
        ).catch(() => ({ classCounts: {} }));

        // Update the embed to reflect the organizer's participation
        const embeds = runMessage.embeds ?? [];
        if (embeds.length > 0) {
            const first = EmbedBuilder.from(embeds[0]);
            const updated = updateRunParticipation(first, result.joinCount, classRes.classCounts);
            await runMessage.edit({ embeds: [updated, ...embeds.slice(1)] });
        }

        // Log to raid-log thread
        try {
            await logRaidJoin(
                client,
                {
                    guildId: guild.id,
                    organizerId,
                    organizerUsername,
                    dungeonName: dungeonLabel,
                    type: 'run',
                    runId
                },
                organizerId,
                'joined',
                result.joinCount
            );
        } catch (e) {
            logger.error('Failed to log auto-join to raid-log', {
                guildId: guild.id,
                runId,
                error: e instanceof Error ? e.message : String(e)
            });
        }

        logger.info('Organizer auto-joined to run', {
            guildId: guild.id,
            runId,
            organizerId,
            joinCount: result.joinCount
        });
    } catch (err) {
        logger.error('Failed to auto-join organizer to run', {
            guildId: guild.id,
            runId,
            organizerId,
            error: err instanceof Error ? err.message : String(err)
        });
        // Don't throw - this is a nice-to-have feature, not critical
    }
}

/**
 * Automatically add the organizer to their headcount upon creation.
 * This simulates clicking the join button - adds to participants set, updates embed.
 */
export async function autoJoinOrganizerToHeadcount(
    client: Client,
    guild: Guild,
    headcountMessage: Message,
    organizerId: string,
    organizerUsername: string,
    dungeonNames: string[],
    panelTimestamp: string
): Promise<void> {
    try {
        const embeds = headcountMessage.embeds ?? [];
        if (!embeds.length) {
            logger.warn('No embeds found on headcount message for auto-join', {
                guildId: guild.id,
                messageId: headcountMessage.id
            });
            return;
        }

        const embed = EmbedBuilder.from(embeds[0]);
        const participants = getParticipants(embed, headcountMessage.id);

        // Add organizer to participants
        participants.add(organizerId);

        // Update embed
        const updatedEmbed = updateParticipantsList(embed, participants);
        await headcountMessage.edit({ embeds: [updatedEmbed, ...embeds.slice(1)] });

        // Log to raid-log thread
        try {
            await logRaidJoin(
                client,
                {
                    guildId: guild.id,
                    organizerId,
                    organizerUsername,
                    dungeonName: dungeonNames.join(', '),
                    type: 'headcount',
                    panelTimestamp
                },
                organizerId,
                'joined',
                participants.size
            );
        } catch (e) {
            logger.error('Failed to log headcount auto-join to raid-log', {
                guildId: guild.id,
                messageId: headcountMessage.id,
                error: e instanceof Error ? e.message : String(e)
            });
        }

        logger.info('Organizer auto-joined to headcount', {
            guildId: guild.id,
            messageId: headcountMessage.id,
            organizerId,
            participantCount: participants.size
        });
    } catch (err) {
        logger.error('Failed to auto-join organizer to headcount', {
            guildId: guild.id,
            messageId: headcountMessage.id,
            organizerId,
            error: err instanceof Error ? err.message : String(err)
        });
        // Don't throw - this is a nice-to-have feature, not critical
    }
}
