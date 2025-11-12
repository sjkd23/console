// bot/src/lib/run-auto-end.ts
import { Client, type GuildTextBasedChannel, EmbedBuilder } from 'discord.js';
import { getJSON, patchJSON } from './http.js';

interface ExpiredRun {
    id: number;
    guild_id: string;
    channel_id: string | null;
    post_message_id: string | null;
    dungeon_label: string;
    organizer_id: string;
    created_at: string;
    auto_end_minutes: number;
}

/**
 * Check all active runs and automatically end those that have exceeded their auto_end_minutes duration
 * This runs periodically to ensure runs don't stay open indefinitely
 */
async function checkExpiredRuns(client: Client): Promise<void> {
    try {
        // Get list of runs that should be auto-ended
        const response = await getJSON<{ expired: ExpiredRun[] }>('/runs/expired');
        const { expired } = response;

        if (expired.length === 0) {
            return; // Nothing to do
        }

        console.log(`[RunAutoEnd] Found ${expired.length} expired runs to auto-end`);

        // Process each expired run
        for (const run of expired) {
            try {
                // Get the guild
                const guild = client.guilds.cache.get(run.guild_id);
                if (!guild) {
                    console.warn(`[RunAutoEnd] Guild ${run.guild_id} not found for run ${run.id}`);
                    continue;
                }

                // End the run via the API
                await patchJSON(`/runs/${run.id}`, {
                    actorId: client.user!.id, // Bot acts as the ender
                    status: 'ended',
                    isAutoEnd: true // Flag to bypass authorization and allow any->ended transition
                });

                console.log(`[RunAutoEnd] Auto-ended run ${run.id} (${run.dungeon_label}) in guild ${guild.name} after ${run.auto_end_minutes} minutes`);

                // Update the Discord message if we have the channel and message IDs
                if (run.channel_id && run.post_message_id) {
                    try {
                        const channel = await guild.channels.fetch(run.channel_id).catch(() => null) as GuildTextBasedChannel | null;
                        if (channel && channel.isTextBased()) {
                            const message = await channel.messages.fetch(run.post_message_id).catch(() => null);
                            if (message && message.editable) {
                                // Update the embed to show it's ended
                                const embed = new EmbedBuilder()
                                    .setTitle(`✅ Run Ended: ${run.dungeon_label}`)
                                    .setDescription(`Organizer: <@${run.organizer_id}>\n\n**Status:** Auto-ended (exceeded ${run.auto_end_minutes} minutes)`)
                                    .setColor(0x808080) // Gray color
                                    .setTimestamp();

                                await message.edit({ embeds: [embed], components: [] });
                                console.log(`[RunAutoEnd] Updated Discord message for run ${run.id}`);
                            }
                        }
                    } catch (err) {
                        console.error(`[RunAutoEnd] Failed to update Discord message for run ${run.id}:`, err);
                    }
                }
            } catch (err) {
                console.error(`[RunAutoEnd] Failed to auto-end run ${run.id}:`, err);
            }
        }
    } catch (err) {
        console.error('[RunAutoEnd] Failed to check expired runs:', err);
    }
}

/**
 * Start the automatic run auto-end task
 * Runs every 5 minutes to check for and process expired runs
 */
export function startRunAutoEnd(client: Client): () => void {
    console.log('[RunAutoEnd] Starting automatic run auto-end task');

    // Run immediately on startup
    checkExpiredRuns(client);

    // Then run every 5 minutes
    const intervalId = setInterval(() => {
        checkExpiredRuns(client);
    }, 5 * 60 * 1000); // 5 minutes

    // Return cleanup function
    return () => {
        console.log('[RunAutoEnd] Stopping automatic run auto-end task');
        clearInterval(intervalId);
    };
}
