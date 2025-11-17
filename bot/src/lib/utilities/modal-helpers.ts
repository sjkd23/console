/**
 * Utilities for creating and handling modals consistently
 * Reduces duplication in button handlers that use modals
 */

import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction
} from 'discord.js';
import { getMemberRoleIds } from '../permissions/permissions.js';

export interface ModalField {
    customId: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
    minLength?: number;
    style?: TextInputStyle;
    value?: string;
}

/**
 * Creates a simple modal with text input fields
 * @param customId - Custom ID for the modal
 * @param title - Modal title
 * @param fields - Array of field configurations
 * @returns Configured ModalBuilder
 */
export function createSimpleModal(
    customId: string,
    title: string,
    fields: ModalField[]
): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title);

    const rows = fields.map(field => {
        const input = new TextInputBuilder()
            .setCustomId(field.customId)
            .setLabel(field.label)
            .setStyle(field.style ?? TextInputStyle.Short)
            .setRequired(field.required ?? false);

        if (field.placeholder) input.setPlaceholder(field.placeholder);
        if (field.maxLength) input.setMaxLength(field.maxLength);
        if (field.minLength) input.setMinLength(field.minLength);
        if (field.value) input.setValue(field.value);

        return new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input);
    });

    modal.addComponents(...rows);
    return modal;
}

/**
 * Shows a modal and waits for submission
 * @param interaction - The button interaction
 * @param modal - The modal to show
 * @param timeoutMs - Timeout in milliseconds (default: 120000 = 2 minutes)
 * @returns The modal submit interaction, or null if timeout/error
 */
export async function awaitModalSubmission(
    interaction: ButtonInteraction,
    modal: ModalBuilder,
    timeoutMs: number = 120_000
): Promise<ModalSubmitInteraction | null> {
    try {
        await interaction.showModal(modal);
        
        const submitted = await interaction.awaitModalSubmit({
            time: timeoutMs,
            filter: i => i.customId === modal.data.custom_id && i.user.id === interaction.user.id
        });

        return submitted;
    } catch (err) {
        // Modal timeout or other error - user was notified by Discord
        return null;
    }
}

/**
 * Ensures guild context exists for button interaction
 * @param interaction - The button interaction
 * @returns Guild if exists, sends error and returns null otherwise
 */
export async function ensureGuildButtonContext(
    interaction: ButtonInteraction | ModalSubmitInteraction
): Promise<{ guildId: string; guild: NonNullable<typeof interaction.guild> } | null> {
    if (!interaction.guild || !interaction.guildId) {
        await interaction.followUp({
            content: 'This command can only be used in a server.',
            ephemeral: true
        });
        return null;
    }
    
    return {
        guildId: interaction.guildId,
        guild: interaction.guild
    };
}

/**
 * Fetches guild member with role IDs
 * @param interaction - The button or modal interaction
 * @returns Member and role IDs, or null if member couldn't be fetched
 */
export async function fetchMemberWithRoles(
    interaction: ButtonInteraction | ModalSubmitInteraction
) {
    if (!interaction.guild) return null;
    
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return null;
    
    return {
        member,
        roleIds: getMemberRoleIds(member)
    };
}

/**
 * Gets field values from a modal submission
 * @param submitted - The modal submit interaction
 * @param fieldIds - Array of field custom IDs to extract
 * @returns Object mapping field IDs to their trimmed values
 */
export function getModalFieldValues(
    submitted: ModalSubmitInteraction,
    fieldIds: string[]
): Record<string, string> {
    const values: Record<string, string> = {};
    
    for (const fieldId of fieldIds) {
        values[fieldId] = submitted.fields.getTextInputValue(fieldId).trim();
    }
    
    return values;
}
