// bot/src/commands/checkpunishments.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
    time,
    TimestampStyles,
} from 'discord.js';
import type { SlashCommand } from './_types.js';
import { getUserPunishments, BackendError } from '../lib/http.js';
import { setupPagination } from '../lib/pagination.js';

/**
 * /checkpunishments - View punishment history for a user
 * Moderator-only command with paginated embed navigation
 */
export const checkpunishments: SlashCommand = {
    requiredRole: ['moderator', 'administrator'],
    data: new SlashCommandBuilder()
        .setName('checkpunishments')
        .setDescription('View punishment history for a member (Moderator only)')
        .addUserOption(option =>
            option
                .setName('member')
                .setDescription('The member to check punishments for')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName('active_only')
                .setDescription('Show only active punishments (default: all)')
                .setRequired(false)
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
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Get options
            const targetUser = interaction.options.getUser('member', true);
            const activeOnly = interaction.options.getBoolean('active_only') ?? false;

            try {
                // Fetch punishments from backend
                // Only pass activeOnly if it's explicitly true, otherwise get all punishments
                const result = await getUserPunishments(
                    interaction.guildId,
                    targetUser.id,
                    activeOnly ? true : undefined
                );

                const { punishments } = result;

                if (punishments.length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Punishment History')
                        .setDescription(`<@${targetUser.id}> has no ${activeOnly ? 'active ' : ''}punishments on record.`)
                        .setColor(0x00ff00)
                        .setFooter({ text: `Requested by ${interaction.user.tag}` })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                // Create one embed per punishment (newest first)
                const embeds = punishments.map((punishment, index) => {
                    const isWarn = punishment.type === 'warn';
                    const isSuspension = punishment.type === 'suspend';
                    const typeIcon = isWarn ? '⚠️' : '�';
                    const typeName = isWarn ? 'Warning' : 'Suspension';
                    
                    // Determine status for suspensions
                    let statusText = '';
                    let statusIcon = '';
                    let color = 0x3498db; // Default blue
                    
                    // Check if this was an extension (removal reason contains "Extended")
                    const isExtension = !punishment.active && 
                                       punishment.removal_reason && 
                                       punishment.removal_reason.includes('Extended');
                    
                    if (punishment.active) {
                        if (isSuspension && punishment.expires_at) {
                            const expiresAt = new Date(punishment.expires_at);
                            const now = new Date();
                            
                            if (expiresAt > now) {
                                // Still active and not expired
                                statusIcon = '🔴';
                                statusText = '**Currently Suspended**';
                                color = 0xff0000; // Red
                            } else {
                                // Should have been deactivated but wasn't yet
                                statusIcon = '🟠';
                                statusText = '**Expired (Not Yet Processed)**';
                                color = 0xffa500; // Orange
                            }
                        } else if (isWarn) {
                            // Warnings remain active forever
                            statusIcon = '🟡';
                            statusText = '**Active Warning**';
                            color = 0xffa500; // Orange
                        }
                    } else {
                        // Inactive punishment
                        if (isExtension) {
                            // This suspension was extended (not lifted)
                            statusIcon = '⏱️';
                            statusText = '**Extended to New Suspension**';
                            color = 0x3498db; // Blue
                        } else if (punishment.removed_at && punishment.removed_by) {
                            // Manually removed
                            statusIcon = '✅';
                            statusText = isWarn ? '**Warning Removed**' : '**Suspension Lifted**';
                            color = 0x2ecc71; // Green
                        } else if (isSuspension && punishment.expires_at) {
                            // Suspension expired naturally
                            statusIcon = '⏱️';
                            statusText = '**Suspension Expired**';
                            color = 0x95a5a6; // Gray
                        } else {
                            // Other inactive state
                            statusIcon = '⚫';
                            statusText = '**Inactive**';
                            color = 0x95a5a6; // Gray
                        }
                    }

                    const embed = new EmbedBuilder()
                        .setTitle(`${typeIcon} ${typeName}`)
                        .setDescription(`${statusIcon} ${statusText}\n\nPunishment for <@${targetUser.id}>`)
                        .setColor(color)
                        .addFields(
                            { 
                                name: 'Punishment ID', 
                                value: `\`${punishment.id}\``, 
                                inline: true 
                            },
                            { 
                                name: 'Type', 
                                value: typeName, 
                                inline: true 
                            },
                            { 
                                name: '\u200b', 
                                value: '\u200b', 
                                inline: true 
                            },
                            {
                                name: 'Issued By',
                                value: `<@${punishment.moderator_id}>`,
                                inline: true
                            },
                            {
                                name: 'Date Issued',
                                value: time(new Date(punishment.created_at), TimestampStyles.ShortDateTime),
                                inline: true
                            },
                            {
                                name: '\u200b',
                                value: '\u200b',
                                inline: true
                            }
                        );

                    // Add suspension timing information
                    if (isSuspension && punishment.expires_at) {
                        const expiresAt = new Date(punishment.expires_at);
                        const now = new Date();
                        const isExpired = expiresAt <= now;
                        
                        if (punishment.active && !isExpired) {
                            // Active suspension - show time remaining
                            const timeRemaining = expiresAt.getTime() - now.getTime();
                            const hoursRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60));
                            const daysRemaining = Math.floor(hoursRemaining / 24);
                            
                            let remainingText = '';
                            if (daysRemaining > 0) {
                                remainingText = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}, ${hoursRemaining % 24} hour${(hoursRemaining % 24) !== 1 ? 's' : ''}`;
                            } else {
                                remainingText = `${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`;
                            }
                            
                            embed.addFields(
                                {
                                    name: '⏰ Time Remaining',
                                    value: `${remainingText}\n${time(expiresAt, TimestampStyles.RelativeTime)}`,
                                    inline: true
                                },
                                {
                                    name: 'Expires At',
                                    value: time(expiresAt, TimestampStyles.ShortDateTime),
                                    inline: true
                                },
                                {
                                    name: '\u200b',
                                    value: '\u200b',
                                    inline: true
                                }
                            );
                        } else if (isExpired) {
                            // Expired suspension - show when it ended
                            embed.addFields(
                                {
                                    name: '⏱️ Suspension Ended',
                                    value: `${time(expiresAt, TimestampStyles.ShortDateTime)}\n(${time(expiresAt, TimestampStyles.RelativeTime)})`,
                                    inline: true
                                },
                                {
                                    name: '\u200b',
                                    value: '\u200b',
                                    inline: true
                                },
                                {
                                    name: '\u200b',
                                    value: '\u200b',
                                    inline: true
                                }
                            );
                        }
                    }

                    // Add reason (full width)
                    embed.addFields({
                        name: 'Reason',
                        value: punishment.reason || 'No reason provided',
                        inline: false
                    });

                    // Add removal/extension information if manually removed
                    if (!punishment.active && punishment.removed_at && punishment.removed_by) {
                        if (isExtension) {
                            // This was extended, not removed
                            let extensionValue = `**When:** ${time(new Date(punishment.removed_at), TimestampStyles.ShortDateTime)} (${time(new Date(punishment.removed_at), TimestampStyles.RelativeTime)})\n`;
                            extensionValue += `**By:** <@${punishment.removed_by}>`;
                            
                            if (punishment.removal_reason) {
                                extensionValue += `\n**Details:** ${punishment.removal_reason}`;
                            }

                            embed.addFields({
                                name: '⏩ Suspension Extended',
                                value: extensionValue,
                                inline: false
                            });
                        } else {
                            // This was actually removed/lifted
                            const removalType = isWarn ? 'Warning Removed' : 'Suspension Lifted';
                            let removalValue = `**When:** ${time(new Date(punishment.removed_at), TimestampStyles.ShortDateTime)} (${time(new Date(punishment.removed_at), TimestampStyles.RelativeTime)})\n`;
                            removalValue += `**By:** <@${punishment.removed_by}>`;
                            
                            if (punishment.removal_reason) {
                                removalValue += `\n**Reason:** ${punishment.removal_reason}`;
                            }

                            embed.addFields({
                                name: `✅ ${removalType}`,
                                value: removalValue,
                                inline: false
                            });
                        }
                    }

                    // Footer with navigation info
                    const activeCount = punishments.filter(p => p.active).length;
                    const inactiveCount = punishments.length - activeCount;
                    let footerText = `Punishment ${index + 1} of ${punishments.length}`;
                    
                    if (!activeOnly) {
                        footerText += ` • Active: ${activeCount} | Inactive: ${inactiveCount}`;
                    }
                    
                    embed.setFooter({ text: footerText });
                    embed.setTimestamp(new Date(punishment.created_at));

                    return embed;
                });

                // Setup pagination
                await setupPagination(interaction, {
                    embeds,
                    userId: interaction.user.id,
                    timeout: 600000, // 10 minutes
                });

            } catch (err) {
                let errorMessage = '❌ **Failed to retrieve punishments**\n\n';

                if (err instanceof BackendError) {
                    switch (err.code) {
                        case 'NOT_AUTHORIZED':
                            errorMessage += '**Issue:** You don\'t have the Moderator role configured for this server.\n\n';
                            errorMessage += '**What to do:**\n';
                            errorMessage += '• Ask a server admin to use `/setroles` to set up the Moderator role\n';
                            errorMessage += '• Make sure you have the Discord role that\'s mapped to Moderator';
                            break;
                        case 'VALIDATION_ERROR':
                            errorMessage += `**Issue:** ${err.message}\n\n`;
                            errorMessage += 'Please check your input and try again.';
                            break;
                        default:
                            errorMessage += `**Error:** ${err.message}\n\n`;
                            errorMessage += 'Please try again or contact an administrator if the problem persists.';
                    }
                } else {
                    console.error('[CheckPunishments] Unexpected error:', err);
                    errorMessage += 'An unexpected error occurred. Please try again later.';
                }

                await interaction.editReply(errorMessage);
            }
        } catch (unhandled) {
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply('❌ Something went wrong while handling this command.');
                } else {
                    await interaction.reply({ content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral });
                }
            } catch { }
            console.error('[CheckPunishments] Unhandled error:', unhandled);
        }
    },
};
