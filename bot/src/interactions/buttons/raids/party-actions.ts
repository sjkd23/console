import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { removeActiveParty, extendPartyLifetime } from '../../../lib/state/party-state.js';
import { logBotEvent } from '../../../lib/logging/bot-logger.js';
import { logPartyClosure, clearPartyLogThreadCache } from '../../../lib/logging/party-logger.js';
import { hasRequiredRoleOrHigher } from '../../../lib/permissions/permissions.js';

/**
 * Party Actions Handler
 * 
 * Handles button interactions for party finder posts.
 * Currently supports:
 * - Close: Allows party owner or moderators to close and delete their party post
 * - Extend: Allows party owner to extend party lifetime by 1 hour
 */

/**
 * Handle party close button interaction
 * 
 * Validates that the user clicking the button is the party owner or a moderator,
 * then deletes the message (which also deletes the thread), and removes the party
 * from active tracking.
 * 
 * @param interaction - The button interaction from Discord
 * @param creatorId - The Discord user ID of the party creator (from button custom ID)
 */
export async function handlePartyClose(interaction: ButtonInteraction, creatorId: string) {
    const isCreator = interaction.user.id === creatorId;
    
    // Check if user is Moderator+ (can close any party)
    const member = interaction.guild ? await interaction.guild.members.fetch(interaction.user.id) : null;
    const { hasRole: isModerator } = await hasRequiredRoleOrHigher(member, 'moderator');
    
    // Only party leader or Moderator+ can close
    if (!isCreator && !isModerator) {
        await interaction.reply({ 
            content: '❌ Only the party leader or Moderators can close this party.', 
            ephemeral: true 
        });
        return;
    }

    const message = interaction.message;

    try {
        // Extract party name from the message content (format: "**Party:** {name}")
        const messageContent = message.content || '';
        const partyNameMatch = messageContent.match(/\*\*Party:\*\*\s*([^\|]+)/);
        const partyName = partyNameMatch ? partyNameMatch[1].trim() : 'Unknown Party';

        // Delete the message (this also deletes the thread)
        await message.delete();
        
        // Remove from active parties tracking
        removeActiveParty(creatorId);

        // Log party closure to raid-log channel thread
        if (interaction.guildId) {
            try {
                await logPartyClosure(
                    interaction.client,
                    {
                        guildId: interaction.guildId,
                        ownerId: creatorId,
                        ownerUsername: interaction.user.username,
                        partyName: partyName,
                        messageId: message.id
                    },
                    interaction.user.id
                );
                
                // Clear the thread cache after party closes
                clearPartyLogThreadCache({
                    guildId: interaction.guildId,
                    ownerId: creatorId,
                    ownerUsername: interaction.user.username,
                    partyName: partyName,
                    messageId: message.id
                });
            } catch (err) {
                console.error('[Party] Failed to log party closure to raid-log:', err);
                // Non-critical error - don't fail the operation
            }
        }

        // Log to bot-log channel (brief notification)
        if (interaction.guildId) {
            await logBotEvent(
                interaction.client,
                interaction.guildId,
                '🚪 Party Closed',
                `Party closed by <@${interaction.user.id}>`,
                {
                    color: 0xED4245,
                    fields: [
                        { name: 'Party Name', value: partyName, inline: true },
                        { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
                        { name: 'Message', value: `[View](${message.url})`, inline: true }
                    ]
                }
            ).catch(err => {
                console.error('[Party] Failed to log party closure to bot-log:', err);
                // Non-critical error - don't fail the operation
            });
        }

        await interaction.reply({ content: '✅ Party closed and deleted successfully.', ephemeral: true });
        
    } catch (err) {
        console.error('[Party] Error closing party:', err);
        
        // Try to respond with error
        const errorMsg = '❌ An error occurred while closing the party. Please try again.';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMsg, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMsg, ephemeral: true });
        }
    }
}

/**
 * Handle party extend button interaction
 * 
 * Validates that the user clicking the button is the party owner,
 * then extends the party lifetime by 1 hour.
 * 
 * @param interaction - The button interaction from Discord
 * @param creatorId - The Discord user ID of the party creator (from button custom ID)
 */
export async function handlePartyExtend(interaction: ButtonInteraction, creatorId: string) {
    const isCreator = interaction.user.id === creatorId;
    
    // Only party owner can extend
    if (!isCreator) {
        await interaction.reply({ 
            content: '❌ Only the party owner can extend this party.', 
            ephemeral: true 
        });
        return;
    }

    try {
        // Extend the party lifetime
        const extended = extendPartyLifetime(creatorId);
        
        if (!extended) {
            await interaction.reply({
                content: '❌ Could not extend party. It may have already been closed.',
                ephemeral: true
            });
            return;
        }

        // Extract party name for logging
        const messageContent = interaction.message.content || '';
        const partyNameMatch = messageContent.match(/\*\*Party:\*\*\s*([^\|]+)/);
        const partyName = partyNameMatch ? partyNameMatch[1].trim() : 'Unknown Party';

        // Log to bot-log channel (brief notification)
        if (interaction.guildId) {
            await logBotEvent(
                interaction.client,
                interaction.guildId,
                '⏰ Party Extended',
                `Party extended by <@${interaction.user.id}>`,
                {
                    color: 0x57F287, // Green
                    fields: [
                        { name: 'Party Name', value: partyName, inline: true },
                        { name: 'Extension', value: '+1 hour', inline: true },
                        { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true }
                    ]
                }
            ).catch(err => {
                console.error('[Party] Failed to log party extension to bot-log:', err);
                // Non-critical error - don't fail the operation
            });
        }

        await interaction.reply({ 
            content: '✅ Party lifetime extended by **1 hour**.', 
            ephemeral: true 
        });
        
    } catch (err) {
        console.error('[Party] Error extending party:', err);
        
        // Try to respond with error
        const errorMsg = '❌ An error occurred while extending the party. Please try again.';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMsg, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMsg, ephemeral: true });
        }
    }
}
