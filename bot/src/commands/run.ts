// src/commands/run.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type GuildTextBasedChannel
} from 'discord.js';
import type { SlashCommand } from './_types.js';
import { getMemberRoleIds } from '../lib/permissions.js';
import { postJSON } from '../lib/http.js';
import { dungeonByCode, searchDungeons } from '../constants/dungeon-helpers.js';
import { addRecentDungeon, getRecentDungeons } from '../lib/dungeon-cache.js';

export const runCreate: SlashCommand = {
    requiredRole: 'organizer',
    data: new SlashCommandBuilder()
        .setName('run')
        .setDescription('Create a new run (posts to this channel).')
        .addStringOption(o =>
            o.setName('dungeon')
                .setDescription('Choose a dungeon')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(o =>
            o.setName('party').setDescription('Party name (optional)')
        )
        .addStringOption(o =>
            o.setName('location').setDescription('Location/server (optional)')
        )
        .addStringOption(o =>
            o.setName('description').setDescription('Run description (optional)')
        ),

    // Slash action
    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        // Must be in a guild
        if (!interaction.inGuild() || !interaction.guild) {
            await interaction.reply({
                content: 'This command can only be used in a server.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Fetch member for role IDs (permission check done by middleware)
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member) {
            await interaction.reply({
                content: 'Could not fetch your member information.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const codeName = interaction.options.getString('dungeon', true);
        const d = dungeonByCode[codeName];

        if (!d) {
            await interaction.reply({
                content: 'Unknown dungeon name. Try again.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const desc = interaction.options.getString('description') || undefined;
        const party = interaction.options.getString('party') || undefined;
        const location = interaction.options.getString('location') || undefined;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Track this dungeon as recently used for this guild
        if (interaction.guildId) {
            addRecentDungeon(interaction.guildId, codeName);
        }

        // Create DB run
        try {
            const { runId } = await postJSON<{ runId: number }>('/runs', {
                guildId: interaction.guildId!,
                guildName: interaction.guild?.name ?? 'unknown',
                organizerId: interaction.user.id,
                organizerUsername: interaction.user.username,
                organizerRoles: getMemberRoleIds(member),
                channelId: interaction.channelId!,
                dungeonKey: d.codeName,      // stable key in DB
                dungeonLabel: d.dungeonName, // human label in DB
                description: desc,
                party,
                location,
                autoEndMinutes: 120 // Auto-end runs after 2 hours
            });

            // Build the public embed (Starting/Lobby phase)
            const embed = new EmbedBuilder()
                .setTitle(`⏳ Starting Soon: ${d.dungeonName}`)
                .setDescription(`Organizer: <@${interaction.user.id}>\n\n**Status:** Waiting for organizer to start`)
                .addFields(
                    { name: 'Raiders', value: '0', inline: false }
                )
                .setTimestamp(new Date());

            // Add Organizer Note field if description provided
            if (desc) {
                embed.addFields({
                    name: 'Organizer Note',
                    value: desc,
                    inline: false
                });
            }

            // Color & thumbnail if present
            if (d.dungeonColors?.length) embed.setColor(d.dungeonColors[0]);
            if (d.portalLink?.url) embed.setThumbnail(d.portalLink.url);

            // Public buttons + organizer panel opener
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`run:join:${runId}`)
                    .setLabel('Join')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`run:class:${runId}`)
                    .setLabel('Class')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`run:org:${runId}`)
                    .setLabel('Organizer Panel')
                    .setStyle(ButtonStyle.Secondary)
            );

            // Must be in a guild text channel to send a public message
            if (!interaction.inGuild() || !interaction.channel) {
                await interaction.editReply(
                    'This command can only be used in a server text channel.'
                );
                return;
            }

            const channel = interaction.channel as GuildTextBasedChannel;

            // Build message content with party/location if provided
            let content = '@here';
            if (party && location) {
                content += ` Party: **${party}** | Location: **${location}**`;
            } else if (party) {
                content += ` Party: **${party}**`;
            } else if (location) {
                content += ` Location: **${location}**`;
            }

            const sent = await channel.send({
                content,
                embeds: [embed],
                components: [row]
            });

            // NEW: tell backend the message id we just posted
            try {
                await postJSON(`/runs/${runId}/message`, { postMessageId: sent.id });
            } catch (e) {
                console.error('Failed to store post_message_id:', e);
            }

            await interaction.editReply(
                `Run created${sent ? ` and posted: ${sent.url}` : ''}`
            );
        } catch (err) {
            console.error('Failed to create run:', err);
            
            // Provide helpful error messages based on error type
            let errorMessage = '❌ **Failed to create run**\n\n';
            
            if (err instanceof Error) {
                if (err.message.includes('Organizer role') || err.message.includes('NOT_ORGANIZER')) {
                    errorMessage += '**Issue:** You don\'t have the Organizer role configured for this server.\n\n';
                    errorMessage += '**What to do:**\n';
                    errorMessage += '• Ask a server admin to use `/setroles` to set up the Organizer role\n';
                    errorMessage += '• Make sure you have the Discord role that\'s mapped to Organizer\n';
                    errorMessage += '• Once roles are configured, try creating your run again';
                } else {
                    errorMessage += `**Error:** ${err.message}\n\n`;
                    errorMessage += 'Please try again or contact an administrator if the problem persists.';
                }
            } else {
                errorMessage += 'An unexpected error occurred. Please try again or contact an administrator.';
            }
            
            await interaction.editReply(errorMessage);
        }
    },

    // Autocomplete handler
    async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== 'dungeon') {
            await interaction.respond([]);
            return;
        }

        const query = (focused.value ?? '').trim();

        let results;
        if (!query && interaction.guildId) {
            // Empty query: show recently used dungeons for this guild
            const recentCodes = getRecentDungeons(interaction.guildId, 25);
            results = recentCodes
                .map(code => dungeonByCode[code])
                .filter(d => d) // Filter out any undefined
                .map(d => ({
                    name: d.dungeonName,
                    value: d.codeName
                }));
            
            // If no recent dungeons, fall back to search behavior
            if (results.length === 0) {
                results = searchDungeons('', 25).map(d => ({
                    name: d.dungeonName,
                    value: d.codeName
                }));
            }
        } else {
            // Non-empty query: perform normal search
            results = searchDungeons(query, 25).map(d => ({
                name: d.dungeonName,
                value: d.codeName
            }));
        }

        await interaction.respond(results);
    }
};
