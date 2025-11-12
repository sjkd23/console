import {
    Client,
    EmbedBuilder,
    TextChannel,
    Message,
} from 'discord.js';
import { getQuotaLeaderboard, getGuildChannels, updateQuotaRoleConfig, getJSON } from './http.js';

/**
 * Update or create a quota leaderboard panel for a specific role
 */
export async function updateQuotaPanel(
    client: Client,
    guildId: string,
    roleId: string,
    config: {
        guild_id: string;
        discord_role_id: string;
        required_points: number;
        reset_at: string;
        panel_message_id: string | null;
    }
): Promise<void> {
    try {
        // Get quota channel
        const channels = await getGuildChannels(guildId);
        const quotaChannelId = channels.channels['quota'];
        
        if (!quotaChannelId) {
            console.log(`[Quota Panel] No quota channel configured for guild ${guildId}`);
            return;
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.log(`[Quota Panel] Guild ${guildId} not found in cache`);
            return;
        }

        const quotaChannel = await guild.channels.fetch(quotaChannelId);
        if (!quotaChannel || !quotaChannel.isTextBased()) {
            console.log(`[Quota Panel] Quota channel ${quotaChannelId} not found or not text-based`);
            return;
        }

        // Get role and its members
        const role = guild.roles.cache.get(roleId);
        if (!role) {
            console.log(`[Quota Panel] Role ${roleId} not found in guild ${guildId}`);
            return;
        }

        // Fetch members with this specific role (more efficient than fetching all guild members)
        // If the role members aren't cached, fetch all members as a fallback
        let memberIds: string[];
        if (role.members.size > 0) {
            // Role members are already cached
            memberIds = role.members.map(m => m.id);
        } else {
            // Need to fetch members to populate the role.members cache
            console.log(`[Quota Panel] Fetching all guild members to populate role cache`);
            await guild.members.fetch();
            memberIds = role.members.map(m => m.id);
        }
        
        console.log(`[Quota Panel] Fetching leaderboard for ${memberIds.length} members`);
        
        // Get leaderboard data
        const result = await getQuotaLeaderboard(guildId, roleId, memberIds);
        console.log(`[Quota Panel] Got leaderboard with ${result.leaderboard.length} entries`);
        
        // Build embed
        const embed = buildLeaderboardEmbed(
            role.name,
            result.config.required_points,
            result.period_start,
            result.period_end,
            result.leaderboard,
            guild
        );
        console.log(`[Quota Panel] Built embed for role ${role.name}`);

        // Update or create message
        let message: Message | null = null;
        
        if (config.panel_message_id) {
            console.log(`[Quota Panel] Attempting to fetch and update message ${config.panel_message_id}`);
        } else {
            console.log(`[Quota Panel] No panel_message_id, will create new panel`);
        }
        
        if (config.panel_message_id) {
            try {
                message = await (quotaChannel as TextChannel).messages.fetch(config.panel_message_id);
                await message.edit({ embeds: [embed] });
                console.log(`[Quota Panel] Updated panel for role ${role.name} in guild ${guildId}`);
            } catch (err) {
                console.log(`[Quota Panel] Failed to fetch message ${config.panel_message_id}, creating new one`);
                message = null;
            }
        }

        if (!message) {
            // Create new panel
            message = await (quotaChannel as TextChannel).send({ embeds: [embed] });
            
            // Update config with new message ID
            await updateQuotaRoleConfig(guildId, roleId, {
                actor_user_id: client.user!.id,
                actor_has_admin_permission: true,
                panel_message_id: message.id,
            });
            
            console.log(`[Quota Panel] Created new panel for role ${role.name} in guild ${guildId}`);
        }

    } catch (err) {
        console.error(`[Quota Panel] Failed to update panel for role ${roleId} in guild ${guildId}:`, err);
    }
}

/**
 * Build the leaderboard embed
 */
function buildLeaderboardEmbed(
    roleName: string,
    requiredPoints: number,
    periodStart: string,
    periodEnd: string,
    leaderboard: Array<{ user_id: string; points: number; runs: number }>,
    guild: any
): EmbedBuilder {
    const periodEndDate = new Date(periodEnd);
    const periodStartDate = new Date(periodStart);
    const startTimestamp = Math.floor(periodStartDate.getTime() / 1000);
    const endTimestamp = Math.floor(periodEndDate.getTime() / 1000);

    const embed = new EmbedBuilder()
        .setTitle(`📊 ${roleName} Quota Leaderboard`)
        .setDescription(
            `**Required Points:** ${requiredPoints}\n` +
            `**Start:** <t:${startTimestamp}:f>\n` +
            `**End:** <t:${endTimestamp}:f> (<t:${endTimestamp}:R>)`
        )
        .setColor(0x5865F2)
        .setTimestamp();

    if (leaderboard.length === 0) {
        embed.addFields({
            name: 'No Activity',
            value: 'No one has earned points this period yet.',
            inline: false,
        });
    } else {
        // Build leaderboard text
        const leaderboardText = leaderboard
            .slice(0, 25) // Top 25
            .map((entry, index) => {
                const position = index + 1;
                const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
                const metQuota = entry.points >= requiredPoints ? '✅' : '';
                return `${emoji} <@${entry.user_id}> - **${entry.points}** pts (${entry.runs} runs) ${metQuota}`;
            })
            .join('\n');

        embed.addFields({
            name: `Top ${Math.min(leaderboard.length, 25)} Members`,
            value: leaderboardText,
            inline: false,
        });

        // Show stats
        const metQuota = leaderboard.filter(e => e.points >= requiredPoints).length;
        const totalMembers = leaderboard.length;
        
        embed.setFooter({
            text: `${metQuota}/${totalMembers} members have met quota | Auto-updates periodically`,
        });
    }

    return embed;
}

/**
 * Update all quota panels for a guild
 */
export async function updateAllQuotaPanels(client: Client, guildId: string): Promise<void> {
    try {
        // Fetch all quota configs for the guild
        const configs = await getJSON<{
            configs: Array<{
                guild_id: string;
                discord_role_id: string;
                required_points: number;
                reset_at: string;
                panel_message_id: string | null;
            }>;
        }>(`/quota/configs/${guildId}`);

        // Update each panel
        for (const config of configs.configs) {
            if (config.panel_message_id) {
                await updateQuotaPanel(client, guildId, config.discord_role_id, config);
            }
        }

        console.log(`[Quota Panel] Updated ${configs.configs.length} panels for guild ${guildId}`);
    } catch (err) {
        console.error(`[Quota Panel] Failed to update all panels for guild ${guildId}:`, err);
    }
}

/**
 * Update quota panels for roles that a specific user has
 */
export async function updateQuotaPanelsForUser(
    client: Client,
    guildId: string,
    userId: string
): Promise<void> {
    try {
        console.log(`[Quota Panel] Starting panel update for user ${userId} in guild ${guildId}`);
        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.log(`[Quota Panel] Guild ${guildId} not found in cache`);
            return;
        }

        const member = await guild.members.fetch(userId);
        if (!member) {
            console.log(`[Quota Panel] Member ${userId} not found in guild ${guildId}`);
            return;
        }

        console.log(`[Quota Panel] Member ${userId} has roles: ${Array.from(member.roles.cache.keys()).join(', ')}`);

        // Fetch all quota configs for the guild
        const configs = await getJSON<{
            configs: Array<{
                guild_id: string;
                discord_role_id: string;
                required_points: number;
                reset_at: string;
                panel_message_id: string | null;
            }>;
        }>(`/quota/configs/${guildId}`);

        console.log(`[Quota Panel] Found ${configs.configs.length} quota configs for guild`);

        // Update panels for roles this user has
        let updatedCount = 0;
        for (const config of configs.configs) {
            console.log(`[Quota Panel] Checking config for role ${config.discord_role_id}, has panel: ${!!config.panel_message_id}, user has role: ${member.roles.cache.has(config.discord_role_id)}`);
            if (member.roles.cache.has(config.discord_role_id)) {
                console.log(`[Quota Panel] Updating panel for role ${config.discord_role_id}`);
                await updateQuotaPanel(client, guildId, config.discord_role_id, config);
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            console.log(`[Quota Panel] Updated ${updatedCount} panels for user ${userId} in guild ${guildId}`);
        } else {
            console.log(`[Quota Panel] No panels updated for user ${userId} in guild ${guildId}`);
        }
    } catch (err) {
        console.error(`[Quota Panel] Failed to update panels for user ${userId} in guild ${guildId}:`, err);
    }
}
