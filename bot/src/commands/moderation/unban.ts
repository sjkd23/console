// bot/src/commands/moderation/officer/unban.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
    time,
    TimestampStyles,
    TextChannel,
} from 'discord.js';
import type { SlashCommand } from '../../_types.js';
import { getMemberRoleIds } from '../../lib/permissions/permissions.js';
import { getGuildChannels } from '../../lib/utilities/http.js';

/**
 * /unban - Remove a ban from a user
 * Officer+ command
 */
export const unban: SlashCommand = {
    requiredRole: 'officer',
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Remove a ban from a user (Officer+)')
        .addStringOption(option =>
            option
                .setName('user_id')
                .setDescription('The Discord User ID of the banned user')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for unbanning')
                .setRequired(true)
                .setMaxLength(500)
        )
        .setDMPermission(false),

    async run(interaction: ChatInputCommandInteraction) {
        try {
            // Guild-only check
            if (!interaction.guild || !interaction.guildId) {
                await interaction.reply({
                    content: 'This command can only be used in a server.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // Defer reply early
            await interaction.deferReply();

            // Fetch invoker member
            const invokerMember = await interaction.guild.members.fetch(interaction.user.id);

            // Get options
            const userId = interaction.options.getString('user_id', true).trim();
            const reason = interaction.options.getString('reason', true).trim();

            // Validate user ID format (Discord snowflake)
            if (!/^\d{17,19}$/.test(userId)) {
                await interaction.editReply('❌ **Invalid User ID**\n\nPlease provide a valid Discord User ID (a 17-19 digit number).\n\nYou can find this by right-clicking a user and selecting "Copy ID" (requires Developer Mode enabled).');
                return;
            }

            // Check if bot has ban permission
            const botMember = await interaction.guild.members.fetchMe();
            if (!botMember.permissions.has('BanMembers')) {
                await interaction.editReply('❌ **Missing Bot Permission**\n\nThe bot lacks the "Ban Members" permission. Ask a server admin to grant this permission.');
                return;
            }

            // Check if the user is actually banned
            let banInfo;
            try {
                banInfo = await interaction.guild.bans.fetch(userId);
            } catch (err: any) {
                if (err?.code === 10026) {
                    // Unknown Ban - user is not banned
                    await interaction.editReply(`❌ **User Not Banned**\n\nUser ID \`${userId}\` is not currently banned in this server.`);
                    return;
                } else {
                    console.error('[Unban] Failed to fetch ban info:', err);
                    await interaction.editReply(`❌ **Failed to Check Ban Status**\n\nError: ${err?.message || 'Unknown error'}`);
                    return;
                }
            }

            // Perform the unban
            try {
                await interaction.guild.members.unban(userId, `${reason} - Unbanned by ${interaction.user.tag}`);
            } catch (unbanErr: any) {
                console.error('[Unban] Failed to unban user:', unbanErr);
                let errorMsg = '❌ **Failed to unban user**\n\n';
                if (unbanErr?.code === 50013) {
                    errorMsg += 'Missing permissions. The bot may not have the "Ban Members" permission.';
                } else if (unbanErr?.code === 10026) {
                    errorMsg += 'User is not currently banned.';
                } else {
                    errorMsg += `Error: ${unbanErr?.message || 'Unknown error'}`;
                }
                await interaction.editReply(errorMsg);
                return;
            }

            // Try to fetch user info for display
            let userTag = 'Unknown User';
            try {
                const user = await interaction.client.users.fetch(userId);
                userTag = user.tag;
            } catch {
                // If we can't fetch the user, use their ID
                userTag = `User ${userId}`;
            }

            // Build success response
            const responseEmbed = new EmbedBuilder()
                .setTitle('✅ User Unbanned')
                .setColor(0x00ff00)
                .addFields(
                    { name: 'User', value: `<@${userId}>`, inline: true },
                    { name: 'User Tag', value: userTag, inline: true },
                    { name: 'User ID', value: userId, inline: true },
                    { name: 'Unbanned By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason }
                );

            if (banInfo.reason) {
                responseEmbed.addFields({ name: 'Original Ban Reason', value: banInfo.reason });
            }

            responseEmbed.setFooter({ text: 'User can now rejoin the server with an invite link' });
            responseEmbed.setTimestamp();

            await interaction.editReply({ embeds: [responseEmbed] });

            // Log to punishment_log channel if configured
            try {
                const { channels } = await getGuildChannels(interaction.guildId);
                const punishmentLogChannelId = channels.punishment_log;

                if (punishmentLogChannelId) {
                    const logChannel = await interaction.guild.channels.fetch(punishmentLogChannelId);

                    if (logChannel && logChannel.isTextBased()) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('✅ User Unbanned')
                            .setColor(0x00ff00)
                            .addFields(
                                { name: 'User', value: `<@${userId}> (${userTag})`, inline: true },
                                { name: 'User ID', value: userId, inline: true },
                                { name: 'Unbanned By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                                { name: 'Reason', value: reason }
                            );

                        if (banInfo.reason) {
                            logEmbed.addFields({ name: 'Original Ban Reason', value: banInfo.reason });
                        }

                        logEmbed.setTimestamp();

                        await (logChannel as TextChannel).send({ embeds: [logEmbed] });
                    }
                }
            } catch (logErr) {
                console.warn(`[Unban] Failed to log to punishment_log channel:`, logErr);
            }
        } catch (unhandled) {
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply('❌ Something went wrong while handling this command.');
                } else {
                    await interaction.reply({ content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral });
                }
            } catch { }
            console.error('[Unban] Unhandled error:', unhandled);
        }
    },
};
