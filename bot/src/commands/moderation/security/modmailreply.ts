// bot/src/commands/moderation/modmailreply.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js';
import type { SlashCommand } from '../../_types.js';
import {
    createStaffReplyEmbed,
} from '../../../lib/modmail/modmail.js';
import {
    addModmailMessage,
    getModmailTicket,
    awardModerationPointsWithUpdate,
} from '../../../lib/utilities/http.js';
import { logCommandExecution } from '../../../lib/logging/bot-logger.js';
import { getMemberRoleIds } from '../../../lib/permissions/permissions.js';

export const modmailreply: SlashCommand = {
    requiredRole: 'security',
    data: new SlashCommandBuilder()
        .setName('modmailreply')
        .setDescription('Reply to a modmail ticket (Security+ only, must be used in modmail thread)')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('The message to send to the user')
                .setRequired(true)
        )
        .setDMPermission(false),

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Ensure this is used in a guild
            if (!interaction.inGuild() || !interaction.guild) {
                await interaction.editReply('❌ This command can only be used in a server.');
                await logCommandExecution(interaction.client, interaction, { 
                    success: false, 
                    errorMessage: 'Not in guild' 
                });
                return;
            }

            // Ensure this is used in a thread
            if (!interaction.channel?.isThread()) {
                await interaction.editReply('❌ This command can only be used in a modmail thread.');
                await logCommandExecution(interaction.client, interaction, { 
                    success: false, 
                    errorMessage: 'Not in thread' 
                });
                return;
            }

            const thread = interaction.channel;
            
            // Extract ticket ID from thread name (format: "MM-XXXXXX - username")
            const threadName = thread.name;
            const ticketIdMatch = threadName.match(/^(MM-[A-Z0-9]{6})/);
            
            if (!ticketIdMatch) {
                await interaction.editReply('❌ This does not appear to be a valid modmail thread.');
                await logCommandExecution(interaction.client, interaction, { 
                    success: false, 
                    errorMessage: 'Invalid thread name' 
                });
                return;
            }

            const ticketId = ticketIdMatch[1];
            const message = interaction.options.getString('message', true);

            // Validate message length
            if (message.length > 2000) {
                await interaction.editReply('❌ Message must be 2000 characters or less.');
                await logCommandExecution(interaction.client, interaction, { 
                    success: false, 
                    errorMessage: 'Message too long' 
                });
                return;
            }

            // Get ticket from database
            let ticket;
            try {
                ticket = await getModmailTicket(ticketId);
            } catch (error) {
                await interaction.editReply(`❌ Could not find modmail ticket with ID: ${ticketId}`);
                await logCommandExecution(interaction.client, interaction, { 
                    success: false, 
                    errorMessage: 'Ticket not found' 
                });
                return;
            }

            // Check if ticket is closed
            if (ticket.status === 'closed') {
                await interaction.editReply('❌ This modmail ticket is already closed.');
                await logCommandExecution(interaction.client, interaction, { 
                    success: false, 
                    errorMessage: 'Ticket closed' 
                });
                return;
            }

            // Verify ticket belongs to this guild
            if (ticket.guild_id !== interaction.guildId) {
                await interaction.editReply('❌ This ticket does not belong to this server.');
                await logCommandExecution(interaction.client, interaction, { 
                    success: false, 
                    errorMessage: 'Guild mismatch' 
                });
                return;
            }

            // Save message to database
            await addModmailMessage(ticketId, {
                author_id: interaction.user.id,
                content: message,
                attachments: [],
                is_staff_reply: true,
            });

            // Send message in thread
            const staffReplyEmbed = createStaffReplyEmbed(
                interaction.user,
                message,
                ticketId
            );

            await thread.send({
                embeds: [staffReplyEmbed],
            });

            // Try to DM the user
            try {
                const user = await interaction.client.users.fetch(ticket.user_id);
                const dmEmbed = new EmbedBuilder()
                    .setTitle('📨 Staff Reply to Your Modmail')
                    .setDescription(message)
                    .setColor(0x57f287)
                    .addFields(
                        { name: 'Server', value: interaction.guild.name, inline: true },
                        { name: 'Ticket ID', value: ticketId, inline: true }
                    )
                    .setFooter({ text: `Reply from ${interaction.user.tag}` })
                    .setTimestamp();

                await user.send({
                    embeds: [dmEmbed],
                });

                await interaction.editReply(
                    `✅ Reply sent successfully!\n\n` +
                    `**Ticket ID:** ${ticketId}\n` +
                    `**Recipient:** <@${ticket.user_id}>\n\n` +
                    `The user has been notified via DM.`
                );
            } catch (error) {
                // DM failed, but thread message was sent
                await interaction.editReply(
                    `✅ Reply posted in thread, but failed to DM the user.\n\n` +
                    `**Ticket ID:** ${ticketId}\n` +
                    `**Recipient:** <@${ticket.user_id}>\n\n` +
                    `The user may have DMs disabled or blocked the bot.`
                );
            }

            await logCommandExecution(interaction.client, interaction, { success: true });

            // Award moderation points if configured
            try {
                const invokerMember = await interaction.guild.members.fetch(interaction.user.id);
                const moderationPointsResult = await awardModerationPointsWithUpdate(
                    interaction.client,
                    interaction.guildId,
                    interaction.user.id,
                    {
                        actor_user_id: interaction.user.id,
                        actor_roles: getMemberRoleIds(invokerMember),
                        command_type: 'modmail_reply',
                    }
                );
                
                if (moderationPointsResult.points_awarded > 0) {
                    console.log(`[ModmailReply] Awarded ${moderationPointsResult.points_awarded} moderation points to ${interaction.user.id}`);
                }
            } catch (pointsErr) {
                // Non-critical, don't block the command
                console.warn('[ModmailReply] Failed to award moderation points:', pointsErr);
            }

        } catch (error) {
            console.error('[ModmailReply] Error:', error);
            
            const errorMessage = '❌ An error occurred while sending your reply. Please try again.';
            
            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }

            await logCommandExecution(interaction.client, interaction, { 
                success: false, 
                errorMessage: 'Unknown error' 
            });
        }
    },
};
