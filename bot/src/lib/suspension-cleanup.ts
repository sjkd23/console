// bot/src/lib/suspension-cleanup.ts
import { Client, EmbedBuilder, type TextChannel } from 'discord.js';
import { getJSON, postJSON } from './http.js';

interface ExpiredSuspension {
    guild_id: string;
    user_id: string;
    id: string;
    moderator_id: string;
    reason: string;
    expires_at: string;
}

/**
 * Check all guilds for expired suspensions and remove the suspended role
 * This runs periodically to ensure users don't keep the role after expiration
 */
async function checkExpiredSuspensions(client: Client): Promise<void> {
    try {
        // Get list of expired suspensions that still need role removal
        const response = await getJSON<{ expired: ExpiredSuspension[] }>('/punishments/expired');
        const { expired } = response;

        if (expired.length === 0) {
            return; // Nothing to do
        }

        console.log(`[SuspensionCleanup] Found ${expired.length} expired suspensions to process`);

        // Process each expired suspension
        for (const suspension of expired) {
            try {
                // Get the guild
                const guild = client.guilds.cache.get(suspension.guild_id);
                if (!guild) {
                    console.warn(`[SuspensionCleanup] Guild ${suspension.guild_id} not found`);
                    continue;
                }

                // Get guild roles
                const rolesResponse = await getJSON<{ roles: Record<string, string | null> }>(
                    `/guilds/${suspension.guild_id}/roles`
                );
                const suspendedRoleId = rolesResponse.roles.suspended;

                if (!suspendedRoleId) {
                    console.warn(`[SuspensionCleanup] No suspended role configured for guild ${suspension.guild_id}`);
                    continue;
                }

                // Get the member
                const member = await guild.members.fetch(suspension.user_id).catch(() => null);
                if (!member) {
                    console.warn(`[SuspensionCleanup] Member ${suspension.user_id} not found in guild ${suspension.guild_id}`);
                    // Still mark as processed even if member left
                    await postJSON(`/punishments/${suspension.id}/expire`, {
                        processed_by: client.user!.id
                    });
                    continue;
                }

                // Check if they have the suspended role
                let roleRemoved = false;
                if (member.roles.cache.has(suspendedRoleId)) {
                    await member.roles.remove(suspendedRoleId, `Suspension expired - ${suspension.id}`);
                    console.log(`[SuspensionCleanup] Removed suspended role from ${member.user.tag} in ${guild.name}`);
                    roleRemoved = true;
                } else {
                    console.log(`[SuspensionCleanup] Member ${member.user.tag} already doesn't have suspended role in ${guild.name}`);
                }

                // Mark the suspension as expired/processed in the backend
                await postJSON(`/punishments/${suspension.id}/expire`, {
                    processed_by: client.user!.id
                });

                // Log to punishment_log channel if configured
                try {
                    const channelsResponse = await getJSON<{ channels: Record<string, string | null> }>(
                        `/guilds/${suspension.guild_id}/channels`
                    );
                    const punishmentLogChannelId = channelsResponse.channels.punishment_log;

                    if (punishmentLogChannelId) {
                        const logChannel = await guild.channels.fetch(punishmentLogChannelId).catch(() => null);

                        if (logChannel && logChannel.isTextBased()) {
                            const expiresAt = new Date(suspension.expires_at);
                            
                            const logEmbed = new EmbedBuilder()
                                .setTitle('⏰ Suspension Expired')
                                .setColor(0x00FF00) // Green
                                .addFields(
                                    { name: 'User', value: `<@${suspension.user_id}>`, inline: true },
                                    { name: 'Punishment ID', value: suspension.id, inline: true },
                                    { name: 'Original Moderator', value: `<@${suspension.moderator_id}>`, inline: true },
                                    { name: 'Original Reason', value: suspension.reason, inline: false },
                                    { name: 'Expired At', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: false },
                                    { name: 'Role Removed', value: roleRemoved ? 'Yes' : 'Already removed or member left', inline: false }
                                )
                                .setTimestamp();

                            await (logChannel as TextChannel).send({ embeds: [logEmbed] });
                            console.log(`[SuspensionCleanup] Logged expiration to punishment_log channel for guild ${guild.name}`);
                        }
                    }
                } catch (logErr) {
                    console.warn(`[SuspensionCleanup] Failed to log expiration to punishment_log channel:`, logErr);
                }
            } catch (err) {
                console.error(`[SuspensionCleanup] Failed to process suspension ${suspension.id}:`, err);
            }
        }
    } catch (err) {
        console.error('[SuspensionCleanup] Failed to check expired suspensions:', err);
    }
}

/**
 * Start the automatic suspension cleanup task
 * Runs every 2 minutes to check for and process expired suspensions
 */
export function startSuspensionCleanup(client: Client): () => void {
    console.log('[SuspensionCleanup] Starting automatic suspension cleanup task');

    // Run immediately on startup
    checkExpiredSuspensions(client);

    // Then run every 2 minutes
    const intervalId = setInterval(() => {
        checkExpiredSuspensions(client);
    }, 2 * 60 * 1000); // 2 minutes

    // Return cleanup function
    return () => {
        console.log('[SuspensionCleanup] Stopping automatic suspension cleanup task');
        clearInterval(intervalId);
    };
}
