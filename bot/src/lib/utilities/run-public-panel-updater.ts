import { Client, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getJSON } from './http.js';
import { dungeonByCode } from '../../constants/dungeons/dungeon-helpers.js';
import { createLogger } from '../logging/logger.js';
import { buildRunButtons } from './run-panel-builder.js';

const logger = createLogger('RunPublicPanelUpdater');

/**
 * Updates the public run panel buttons to reflect the current join_locked state.
 * This is called when the organizer toggles the lock join button.
 */
export async function updateRunPublicPanel(
    client: Client,
    guildId: string,
    channelId: string,
    messageId: string,
    runId: number
): Promise<void> {
    try {
        // Fetch the latest run state
        const run = await getJSON<{
            status: string;
            dungeonKey: string;
            joinLocked: boolean;
        }>(`/runs/${runId}`, { guildId });

        // Only update if the run is still active
        if (run.status === 'ended' || run.status === 'cancelled') {
            return;
        }

        // Fetch the channel and message
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || channel.type !== ChannelType.GuildText) {
            logger.warn('Could not fetch channel for public panel update', { guildId, channelId, runId });
            return;
        }

        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
            logger.warn('Could not fetch message for public panel update', { guildId, channelId, messageId, runId });
            return;
        }

        // Get dungeon info for key buttons
        const dungeon = dungeonByCode[run.dungeonKey];
        if (!dungeon) {
            logger.warn('Unknown dungeon key for public panel update', { guildId, runId, dungeonKey: run.dungeonKey });
            return;
        }

        // Rebuild the button components with the updated join button state
        const components = buildRunButtons({
            runId: runId,
            dungeonData: dungeon,
            joinLocked: run.joinLocked
        });

        // Update the message with new components
        await message.edit({
            components: components
        });

        logger.debug('Public panel updated successfully', {
            guildId,
            runId,
            joinLocked: run.joinLocked
        });
    } catch (error) {
        logger.error('Failed to update public panel', {
            guildId,
            runId,
            channelId,
            messageId,
            error: error instanceof Error ? error.message : String(error)
        });
        // Don't throw - this is a non-critical update
    }
}
