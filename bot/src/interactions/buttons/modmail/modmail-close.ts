// bot/src/interactions/buttons/modmail/modmail-close.ts
import {
    ButtonInteraction,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
} from 'discord.js';
import {
    createClosedTicketEmbed,
} from '../../../lib/modmail/modmail.js';
import {
    closeModmailTicket,
    getModmailTicket,
} from '../../../lib/utilities/http.js';

/**
 * Handle the "Close Ticket" button on modmail messages
 */
export async function handleModmailClose(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
        // Extract ticket ID from button customId (format: modmail:close:MM-XXXXXX)
        const ticketId = interaction.customId.split(':')[2];

        if (!ticketId) {
            await interaction.editReply('❌ Invalid ticket ID.');
            return;
        }

        // Get ticket from database
        let ticket;
        try {
            ticket = await getModmailTicket(ticketId);
        } catch (error) {
            await interaction.editReply(`❌ Could not find modmail ticket with ID: ${ticketId}`);
            return;
        }

        // Check if already closed
        if (ticket.status === 'closed') {
            await interaction.editReply('⚠️ This ticket is already closed.');
            return;
        }

        // Close the ticket in the database
        await closeModmailTicket(ticketId, {
            closed_by: interaction.user.id,
        });

        // Update the original message to remove the button
        if (interaction.message) {
            try {
                // Remove all buttons from the message
                await interaction.message.edit({
                    components: [],
                });
            } catch (error) {
                console.error('[ModmailClose] Failed to edit message:', error);
            }
        }

        // Archive the thread if it exists
        if (ticket.thread_id) {
            try {
                const thread = await interaction.client.channels.fetch(ticket.thread_id);
                if (thread?.isThread()) {
                    await thread.setArchived(true);
                    await thread.setLocked(true);
                }
            } catch (error) {
                console.error('[ModmailClose] Failed to archive thread:', error);
            }
        }

        // DM the user to notify them
        try {
            const user = await interaction.client.users.fetch(ticket.user_id);
            const closedEmbed = createClosedTicketEmbed(ticketId, interaction.user);

            await user.send({
                embeds: [closedEmbed],
            });

            await interaction.editReply(
                `✅ **Ticket Closed**\n\n` +
                `**Ticket ID:** ${ticketId}\n` +
                `**User:** <@${ticket.user_id}>\n` +
                `**Closed by:** ${interaction.user.tag}\n\n` +
                `The user has been notified that their ticket was closed.`
            );
        } catch (error) {
            // DM failed
            await interaction.editReply(
                `✅ **Ticket Closed**\n\n` +
                `**Ticket ID:** ${ticketId}\n` +
                `**User:** <@${ticket.user_id}>\n` +
                `**Closed by:** ${interaction.user.tag}\n\n` +
                `⚠️ Could not DM the user (they may have DMs disabled or blocked the bot).`
            );
        }

    } catch (error) {
        console.error('[ModmailClose] Error:', error);
        
        const errorMessage = '❌ An error occurred while closing the ticket. Please try again.';
        
        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
    }
}
