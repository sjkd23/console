/**
 * Tracks active headcount organizer panels for auto-refresh when keys are reacted.
 * 
 * REFACTORED: Now stores Message objects instead of Interaction objects.
 * This allows both button-spawned panels and auto-popup panels to be tracked
 * using the same mechanism, without needing to create mock interaction objects.
 */

import { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction, Message } from 'discord.js';

/**
 * Map of headcount message ID to array of active organizer panel Message objects.
 * When a key is reacted on a headcount, all tracked panels for that message ID are refreshed.
 */
const activeHeadcountPanels = new Map<string, Array<Message>>();

/**
 * Register a headcount organizer panel for auto-refresh.
 * When keys are reacted on this headcount, this panel will be updated.
 * 
 * @param publicMessageId The ID of the public headcount message
 * @param message The ephemeral organizer panel message (from interaction.reply or interaction.followUp with fetchReply: true)
 */
export function registerHeadcountPanel(
    publicMessageId: string, 
    message: Message
): void {
    const existing = activeHeadcountPanels.get(publicMessageId) || [];
    existing.push(message);
    activeHeadcountPanels.set(publicMessageId, existing);
}

/**
 * Get all active organizer panel messages for a headcount message.
 * @param publicMessageId The ID of the public headcount message
 * @returns Array of Message objects to refresh
 */
export function getActiveHeadcountPanels(publicMessageId: string): Array<Message> {
    return activeHeadcountPanels.get(publicMessageId) || [];
}

/**
 * Remove all tracked organizer panels for a headcount (e.g., when converted to run or ended).
 * @param publicMessageId The ID of the public headcount message
 */
export function clearHeadcountPanels(publicMessageId: string): void {
    activeHeadcountPanels.delete(publicMessageId);
}

/**
 * Remove a specific panel message (e.g., if it becomes invalid).
 * @param publicMessageId The ID of the public headcount message
 * @param message The message to remove
 */
export function unregisterHeadcountPanel(
    publicMessageId: string, 
    message: Message
): void {
    const existing = activeHeadcountPanels.get(publicMessageId);
    if (!existing) return;
    
    const filtered = existing.filter(m => m.id !== message.id);
    if (filtered.length === 0) {
        activeHeadcountPanels.delete(publicMessageId);
    } else {
        activeHeadcountPanels.set(publicMessageId, filtered);
    }
}
