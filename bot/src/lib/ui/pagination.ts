// bot/src/lib/pagination.ts
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ButtonInteraction,
    EmbedBuilder,
    ChatInputCommandInteraction,
    InteractionUpdateOptions,
    MessageCreateOptions,
} from 'discord.js';

export interface PaginationOptions {
    embeds: EmbedBuilder[];
    userId: string;
    timeout?: number; // in milliseconds, default 5 minutes
}

/**
 * Create pagination buttons for navigating through embeds
 */
export function createPaginationButtons(currentPage: number, totalPages: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>();

    row.addComponents(
        new ButtonBuilder()
            .setCustomId('pagination_first')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || currentPage === 0),
        new ButtonBuilder()
            .setCustomId('pagination_prev')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentPage === 0),
        new ButtonBuilder()
            .setCustomId('pagination_page')
            .setLabel(`${currentPage + 1} / ${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('pagination_next')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentPage === totalPages - 1),
        new ButtonBuilder()
            .setCustomId('pagination_last')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || currentPage === totalPages - 1)
    );

    return row;
}

/**
 * Handle pagination interactions for a set of embeds
 * Returns a cleanup function that should be called when done
 */
export async function setupPagination(
    interaction: ChatInputCommandInteraction,
    options: PaginationOptions
): Promise<() => void> {
    const { embeds, userId, timeout = 300000 } = options; // 5 minutes default

    if (embeds.length === 0) {
        throw new Error('No embeds provided for pagination');
    }

    let currentPage = 0;
    const totalPages = embeds.length;

    // Send initial message
    const message = await interaction.editReply({
        embeds: [embeds[currentPage]],
        components: totalPages > 1 ? [createPaginationButtons(currentPage, totalPages)] : [],
    });

    if (totalPages === 1) {
        // No pagination needed
        return () => {};
    }

    // Create collector for button interactions
    const collector = message.createMessageComponentCollector({
        filter: (i) => {
            // Only allow the user who invoked the command to use buttons
            if (i.user.id !== userId) {
                i.reply({
                    content: '❌ You cannot use these buttons. Use `/find` to view your own results.',
                    ephemeral: true,
                }).catch(() => {});
                return false;
            }
            return i.customId.startsWith('pagination_');
        },
        time: timeout,
    });

    collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
        // Update page based on button clicked
        switch (buttonInteraction.customId) {
            case 'pagination_first':
                currentPage = 0;
                break;
            case 'pagination_prev':
                currentPage = Math.max(0, currentPage - 1);
                break;
            case 'pagination_next':
                currentPage = Math.min(totalPages - 1, currentPage + 1);
                break;
            case 'pagination_last':
                currentPage = totalPages - 1;
                break;
            default:
                return;
        }

        // Update message with new page
        await buttonInteraction.update({
            embeds: [embeds[currentPage]],
            components: [createPaginationButtons(currentPage, totalPages)],
        });
    });

    collector.on('end', async () => {
        // Disable buttons when collector ends
        try {
            await interaction.editReply({
                components: [createPaginationButtons(currentPage, totalPages, true)],
            });
        } catch (err) {
            // Message might have been deleted
            console.warn('[Pagination] Failed to disable buttons:', err);
        }
    });

    // Return cleanup function
    return () => {
        collector.stop();
    };
}
