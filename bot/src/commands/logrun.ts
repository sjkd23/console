// bot/src/commands/logrun.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js';
import type { SlashCommand } from './_types.js';
import { getMemberRoleIds } from '../lib/permissions.js';
import { postJSON, BackendError, getJSON } from '../lib/http.js';
import { dungeonByCode, searchDungeons } from '../constants/dungeon-helpers.js';
import { addRecentDungeon, getRecentDungeons } from '../lib/dungeon-cache.js';
import { updateQuotaPanelsForUser } from '../lib/quota-panel.js';

/**
 * /logrun - Manually log run completion quota for organizers.
 * Organizer-only command.
 * Supports logging multiple runs at once if an organizer completed multiple dungeons.
 * Idempotent: will not double-count the same run_id.
 */
export const logrun: SlashCommand = {
    requiredRole: 'organizer',
    data: new SlashCommandBuilder()
        .setName('logrun')
        .setDescription('Manually log run completion quota (Organizer only)')
        .addStringOption(option =>
            option
                .setName('dungeon')
                .setDescription('Choose a dungeon to log')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Number of runs to add/remove (negative to remove, default: 1)')
                .setRequired(false)
        ),

    async run(interaction: ChatInputCommandInteraction) {
        // Must be in a guild
        if (!interaction.guild || !interaction.guildId) {
            await interaction.reply({
                content: 'This command can only be used in a server.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Fetch invoker member (permission check done by middleware)
        const invokerMember = await interaction.guild.members.fetch(interaction.user.id);

        // Get options
        const dungeonCode = interaction.options.getString('dungeon', true);
        const amount = interaction.options.getInteger('amount') ?? 1;

        // Validate dungeon
        const dungeon = dungeonByCode[dungeonCode];
        if (!dungeon) {
            await interaction.reply({
                content: '❌ Invalid dungeon selected. Please try again.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Defer reply (backend call may take a moment)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Track this dungeon as recently used for this guild
            addRecentDungeon(interaction.guildId, dungeonCode);

            // Get actor's role IDs for authorization
            const actorRoles = getMemberRoleIds(invokerMember);
            
            // Call backend to log run quota (pass dungeonKey to find most recent run)
            const result = await postJSON<{
                logged: number;
                already_logged: boolean;
                total_points: number;
                organizer_id: string;
            }>('/quota/log-run', {
                actorId: interaction.user.id,
                actorRoles,
                guildId: interaction.guildId,
                dungeonKey: dungeonCode, // Backend will find most recent run
                amount,
            });

            // Build success embed
            if (result.already_logged) {
                // Run was already logged (shouldn't happen anymore, but keep for safety)
                await interaction.editReply({
                    content: `⚠️ **Already Logged**\n\nYour most recent **${dungeon.dungeonName}** run has already been logged for quota.\n\nNo points were added to prevent double-counting.`,
                });
                return;
            }

            const isRemoving = amount < 0;
            const actionText = isRemoving ? 'Removed' : 'Logged';
            const embedTitle = isRemoving ? '➖ Run Quota Removed' : '✅ Run Quota Logged';
            const embedColor = isRemoving ? 0xff9900 : 0x00ff00;

            const embed = new EmbedBuilder()
                .setTitle(embedTitle)
                .setColor(embedColor)
                .addFields(
                    { name: 'Dungeon', value: dungeon.dungeonName, inline: true },
                    { name: `Runs ${actionText}`, value: `${Math.abs(amount)}`, inline: true },
                    { name: 'Points Changed', value: `${result.total_points > 0 ? '+' : ''}${result.total_points}`, inline: true },
                    { name: 'Organizer', value: `<@${result.organizer_id}>`, inline: true },
                    { name: `${actionText} By`, value: `<@${interaction.user.id}>`, inline: true },
                )
                .setTimestamp();

            if (Math.abs(amount) > 1) {
                embed.setFooter({ text: `${actionText} ${result.logged} run completion(s)` });
            }

            await interaction.editReply({
                embeds: [embed],
            });

            // Auto-update quota panels for this user's roles
            // Run asynchronously to not block the response
            console.log(`[Logrun] Triggering auto-update for user ${result.organizer_id} in guild ${interaction.guildId}`);
            updateQuotaPanelsForUser(
                interaction.client,
                interaction.guildId,
                result.organizer_id
            ).then(() => {
                console.log(`[Logrun] Successfully triggered quota panel auto-update`);
            }).catch(err => {
                console.error('[Logrun] Failed to auto-update quota panels:', err);
            });
        } catch (err) {
            // Map backend errors to user-friendly messages
            let errorMessage = '❌ **Failed to log run quota**\n\n';
            
            if (err instanceof BackendError) {
                switch (err.code) {
                    case 'NOT_AUTHORIZED':
                    case 'NOT_ORGANIZER':
                        errorMessage += '**Issue:** You don\'t have the Organizer role configured for this server.\n\n';
                        errorMessage += '**What to do:**\n';
                        errorMessage += '• Ask a server admin to use `/setroles` to set up the Organizer role\n';
                        errorMessage += '• Make sure you have the Discord role that\'s mapped to Organizer';
                        break;
                    case 'RUN_NOT_FOUND':
                        errorMessage += `**Issue:** The selected **${dungeon.dungeonName}** run was not found.\n\n`;
                        errorMessage += '**What to do:**\n';
                        errorMessage += '• Try selecting a different dungeon\n';
                        errorMessage += '• Create a new run with `/run` first';
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
                console.error('Logrun command error:', err);
                errorMessage += 'An unexpected error occurred. Please try again later.';
            }

            await interaction.editReply(errorMessage);
        }
    },

    // Autocomplete handler (same as /run)
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
