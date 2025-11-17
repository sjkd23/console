// src/commands/headcount.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    ComponentType
} from 'discord.js';
import type { SlashCommand } from '../_types.js';
import { ensureGuildContext } from '../../lib/utilities/interaction-helpers.js';
import { formatErrorMessage } from '../../lib/errors/error-handler.js';
import { dungeonByCode, getCategorizedDungeons } from '../../constants/dungeons/dungeon-helpers.js';
import type { DungeonInfo } from '../../constants/dungeons/dungeon-types.js';
import { getDungeonKeyEmojiIdentifier } from '../../lib/utilities/key-emoji-helpers.js';
import { logRaidCreation } from '../../lib/logging/raid-logger.js';
import { getDungeonRolePings } from '../../lib/utilities/http.js';
import { registerHeadcount } from '../../lib/state/active-headcount-tracker.js';
import { createLogger } from '../../lib/logging/logger.js';
import {
    checkOrganizerActiveActivities,
    buildActiveRunErrorForHeadcount,
    buildActiveHeadcountErrorForHeadcount
} from '../../lib/utilities/organizer-activity-checker.js';
import { fetchConfiguredRaidChannel } from '../../lib/utilities/channel-helpers.js';
import { buildRunMessageContent } from '../../lib/utilities/run-message-helpers.js';

const logger = createLogger('Headcount');

export const headcount: SlashCommand = {
    requiredRole: 'organizer',
    data: new SlashCommandBuilder()
        .setName('headcount')
        .setDescription('Create a lightweight headcount panel to gauge interest for upcoming runs'),

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        const guild = await ensureGuildContext(interaction);
        if (!guild) return;

        // Show ephemeral dungeon selection dropdowns
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Check if organizer has any active runs or headcounts
        // Use specialized error messages for headcount creation context
        const activityCheck = await checkOrganizerActiveActivities(interaction, guild.id, interaction.user.id);
        
        if (activityCheck.hasActiveRun) {
            // Use headcount-specific error message for active runs
            // Note: We need to fetch the run details again to get the proper format
            // This is a bit redundant but maintains the specific wording
            await interaction.editReply(activityCheck.errorMessage!);
            return;
        }
        
        if (activityCheck.hasActiveHeadcount) {
            // Use headcount-specific error message for active headcount
            await interaction.editReply(activityCheck.errorMessage!);
            return;
        }

        // Get categorized dungeons
        const { exalt, misc1, misc2 } = getCategorizedDungeons();

        // Limit each dropdown to 25 options (Discord limit)
        const exaltOptions = exalt.slice(0, 25);
        const misc1Options = misc1.slice(0, 25);
        const misc2Options = misc2.slice(0, 25);

        // Create three select menus
        const selectMenu1 = new StringSelectMenuBuilder()
            .setCustomId('headcount:select_exalt')
            .setPlaceholder('Select Exaltation dungeons')
            .setMinValues(0)
            .setMaxValues(Math.min(5, exaltOptions.length))
            .addOptions(
                exaltOptions.map(d => ({
                    label: d.dungeonName,
                    value: d.codeName,
                    description: d.dungeonCategory || undefined
                }))
            );

        const selectMenu2 = new StringSelectMenuBuilder()
            .setCustomId('headcount:select_misc1')
            .setPlaceholder('Select other dungeons (part 1)')
            .setMinValues(0)
            .setMaxValues(Math.min(5, misc1Options.length))
            .addOptions(
                misc1Options.map(d => ({
                    label: d.dungeonName,
                    value: d.codeName,
                    description: d.dungeonCategory || undefined
                }))
            );

        const selectMenu3 = new StringSelectMenuBuilder()
            .setCustomId('headcount:select_misc2')
            .setPlaceholder('Select other dungeons (part 2)')
            .setMinValues(0)
            .setMaxValues(Math.min(5, misc2Options.length))
            .addOptions(
                misc2Options.map(d => ({
                    label: d.dungeonName,
                    value: d.codeName,
                    description: d.dungeonCategory || undefined
                }))
            );

        const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu1);
        const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu2);
        const row3 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu3);

        // Add a confirm button
        const confirmButton = new ButtonBuilder()
            .setCustomId('headcount:confirm')
            .setLabel('Create Headcount')
            .setStyle(ButtonStyle.Primary);

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton);

        await interaction.editReply({
            content: '**Select dungeons for the headcount**\n\nChoose up to 5 dungeons total from any category, then click "Create Headcount":',
            components: [row1, row2, row3, buttonRow]
        });

        // Track selected dungeons across all dropdowns
        const selectedDungeonCodes = new Set<string>();

        // Create a collector for both select menus and the confirm button
        const collector = interaction.channel!.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('headcount:'),
            time: 120_000 // 2 minute timeout
        });

        collector.on('collect', async (i) => {
            if (i.isStringSelectMenu()) {
                await i.deferUpdate();

                // Update the selected dungeons set
                if (i.customId === 'headcount:select_exalt') {
                    // Remove any previous exalt selections
                    exaltOptions.forEach(d => selectedDungeonCodes.delete(d.codeName));
                    // Add new selections
                    i.values.forEach(v => selectedDungeonCodes.add(v));
                } else if (i.customId === 'headcount:select_misc1') {
                    // Remove any previous misc1 selections
                    misc1Options.forEach(d => selectedDungeonCodes.delete(d.codeName));
                    // Add new selections
                    i.values.forEach(v => selectedDungeonCodes.add(v));
                } else if (i.customId === 'headcount:select_misc2') {
                    // Remove any previous misc2 selections
                    misc2Options.forEach(d => selectedDungeonCodes.delete(d.codeName));
                    // Add new selections
                    i.values.forEach(v => selectedDungeonCodes.add(v));
                }

                // Update the message to show current selection count
                const count = selectedDungeonCodes.size;
                const selectedList = Array.from(selectedDungeonCodes)
                    .map(code => dungeonByCode[code]?.dungeonName || code)
                    .join(', ');

                await interaction.editReply({
                    content: 
                        `**Select dungeons for the headcount**\n\n` +
                        `Choose up to 5 dungeons total from any category, then click "Create Headcount":\n\n` +
                        `**Selected (${count}/5):** ${selectedList || 'None'}`,
                    components: [row1, row2, row3, buttonRow]
                });

            } else if (i.isButton() && i.customId === 'headcount:confirm') {
                await i.deferUpdate();
                collector.stop('confirmed');
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'confirmed') {
                // Validate selection
                if (selectedDungeonCodes.size === 0) {
                    await interaction.editReply({
                        content: '❌ No dungeons selected. Please try again.',
                        components: []
                    });
                    return;
                }

                if (selectedDungeonCodes.size > 5) {
                    await interaction.editReply({
                        content: '❌ Too many dungeons selected (maximum 5). Please try again.',
                        components: []
                    });
                    return;
                }

                const selectedDungeons = Array.from(selectedDungeonCodes)
                    .map(code => dungeonByCode[code])
                    .filter(d => d) as DungeonInfo[];

                await createHeadcountPanel(interaction, guild, selectedDungeons);
            } else {
                // Timeout or other reason
                await interaction.editReply({
                    content: '⏱️ Selection timed out. Please run `/headcount` again.',
                    components: []
                });
            }
        });
    }
};

/**
 * Create and post the headcount panel
 */
async function createHeadcountPanel(
    interaction: ChatInputCommandInteraction,
    guild: any,
    selectedDungeons: DungeonInfo[]
): Promise<void> {
    try {
        const isSingleDungeon = selectedDungeons.length === 1;
        const dungeon = selectedDungeons[0]; // First dungeon for single-dungeon mode
        
        // Build the headcount panel embed
        let embed: EmbedBuilder;
        
        if (isSingleDungeon) {
            // Single dungeon: Make it look like a run panel
            embed = new EmbedBuilder()
                .setTitle(`🎯 Headcount: ${dungeon.dungeonName}`)
                .setDescription(`Organizer: <@${interaction.user.id}>`)
                .addFields({ name: 'Interested', value: '0', inline: false })
                .setTimestamp(new Date());
            
            // Add color and thumbnail if available
            if (dungeon.dungeonColors?.length) {
                embed.setColor(dungeon.dungeonColors[0]);
            } else {
                embed.setColor(0x5865F2);
            }
            
            if (dungeon.portalLink?.url) {
                embed.setThumbnail(dungeon.portalLink.url);
            }
            
            // Add Keys field if the dungeon has key reactions
            if (dungeon.keyReactions && dungeon.keyReactions.length > 0) {
                embed.addFields({ name: 'Keys', value: '0', inline: false });
            }
        } else {
            // Multiple dungeons: Cleaner multi-dungeon display
            const dungeonList = selectedDungeons
                .map(d => `🔹 **${d.dungeonName}**`)
                .join('\n');
            
            embed = new EmbedBuilder()
                .setTitle('🎯 Headcount — Multiple Dungeons')
                .setColor(0x5865F2)
                .setDescription(
                    `Organizer: <@${interaction.user.id}>\n\n` +
                    `**Dungeons:**\n${dungeonList}`
                )
                .addFields(
                    { name: 'Interested', value: '0', inline: true },
                    { name: 'Total Keys', value: '0', inline: true }
                )
                .setTimestamp(new Date());
        }

        // Create action buttons
        const joinButton = new ButtonBuilder()
            .setCustomId(`headcount:join:${Date.now()}`)
            .setLabel('Join')
            .setStyle(ButtonStyle.Success);

        const orgButton = new ButtonBuilder()
            .setCustomId(`headcount:org:${Date.now()}`)
            .setLabel('Organizer Panel')
            .setStyle(ButtonStyle.Secondary);

        // Build button rows based on single vs multi-dungeon
        const buttonRows: ActionRowBuilder<ButtonBuilder>[] = [];
        
        if (isSingleDungeon) {
            // Single dungeon: Key button between Join and Organizer Panel
            const mainRow = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton);
            
            // Add key button if dungeon has keys
            if (dungeon.keyReactions && dungeon.keyReactions.length > 0) {
                const keyReaction = dungeon.keyReactions[0];
                const keyEmojiId = getDungeonKeyEmojiIdentifier(dungeon.codeName);
                
                const keyButton = new ButtonBuilder()
                    .setCustomId(`headcount:key:${Date.now()}:${dungeon.codeName}`)
                    .setLabel('Key')
                    .setStyle(ButtonStyle.Secondary);
                
                if (keyEmojiId) {
                    keyButton.setEmoji(keyEmojiId);
                }
                
                mainRow.addComponents(keyButton);
            }
            
            mainRow.addComponents(orgButton);
            buttonRows.push(mainRow);
        } else {
            // Multiple dungeons: Join and Organizer Panel on first row
            const mainRow = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton, orgButton);
            buttonRows.push(mainRow);
            
            // Key buttons on separate rows with custom layout
            const keyButtons: ButtonBuilder[] = [];
            
            for (const selectedDungeon of selectedDungeons) {
                const keyEmojiId = getDungeonKeyEmojiIdentifier(selectedDungeon.codeName);
                
                const keyButton = new ButtonBuilder()
                    .setCustomId(`headcount:key:${Date.now()}:${selectedDungeon.codeName}`)
                    .setLabel(selectedDungeon.dungeonName.length > 15 
                        ? selectedDungeon.dungeonName.substring(0, 13) + '...' 
                        : selectedDungeon.dungeonName)
                    .setStyle(ButtonStyle.Secondary);

                // Add emoji if available
                if (keyEmojiId) {
                    keyButton.setEmoji(keyEmojiId);
                }

                keyButtons.push(keyButton);
            }

            // Smart button layout based on dungeon count
            const numDungeons = keyButtons.length;
            
            if (numDungeons === 4) {
                // 4 dungeons: 2 buttons on row 2, 2 buttons on row 3
                buttonRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(keyButtons[0], keyButtons[1]));
                buttonRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(keyButtons[2], keyButtons[3]));
            } else if (numDungeons === 5) {
                // 5 dungeons: 3 buttons on row 2, 2 buttons on row 3
                buttonRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(keyButtons[0], keyButtons[1], keyButtons[2]));
                buttonRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(keyButtons[3], keyButtons[4]));
            } else {
                // For 2-3 dungeons: all keys on one row
                buttonRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...keyButtons));
            }
        }

        // Get the configured raid channel using helper
        const raidChannel = await fetchConfiguredRaidChannel(guild, interaction);
        if (!raidChannel) {
            // Error already sent by helper
            return;
        }

        // Post headcount panel to raid channel
        // Build content with @here and any configured dungeon role pings
        const rolePings: string[] = [];
        
        // Check if there are configured role pings for any of the selected dungeons
        try {
            const { dungeon_role_pings } = await getDungeonRolePings(guild.id);
            const rolePingSet = new Set<string>();
            
            for (const dungeon of selectedDungeons) {
                const roleId = dungeon_role_pings[dungeon.codeName];
                if (roleId) {
                    rolePingSet.add(roleId);
                }
            }
            
            rolePings.push(...Array.from(rolePingSet));
        } catch (e) {
            console.error('Failed to fetch dungeon role pings:', e);
            // Continue without custom role pings
        }
        
        const content = buildRunMessageContent(undefined, undefined, rolePings);
        
        const sent = await raidChannel.send({
                content,
                embeds: [embed],
                components: buttonRows
            });

            // Register the active headcount
            registerHeadcount(
                guild.id,
                interaction.user.id,
                sent.id,
                sent.channelId,
                selectedDungeons.map(d => d.dungeonName)
            );

            // Log the headcount creation to raid-log channel
            const panelTimestamp = Date.now().toString();
            try {
                await logRaidCreation(
                    interaction.client,
                    {
                        guildId: guild.id,
                        organizerId: interaction.user.id,
                        organizerUsername: interaction.user.username,
                        dungeonName: selectedDungeons.map(d => d.dungeonName).join(', '),
                        type: 'headcount',
                        panelTimestamp: sent.id // Use message ID as unique identifier
                    }
                );
            } catch (e) {
                console.error('Failed to log headcount creation to raid-log:', e);
            }

        // Confirm to organizer
        await interaction.editReply({
            content: `✅ Headcount created: ${sent.url}`,
            components: []
        });

    } catch (err) {
        // Error creating headcount
        const errorMessage = formatErrorMessage({
            error: err,
            baseMessage: 'Failed to create headcount panel',
            errorHandlers: {},
        });
        await interaction.editReply({
            content: errorMessage,
            components: []
        });
    }
}
