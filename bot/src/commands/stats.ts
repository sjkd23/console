// bot/src/commands/stats.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
} from 'discord.js';
import type { SlashCommand } from './_types.js';
import { getQuotaStats, BackendError } from '../lib/http.js';
import { dungeonByCode } from '../constants/dungeon-helpers.js';
import { DUNGEON_DATA } from '../constants/DungeonData.js';

/**
 * /stats - View quota statistics for yourself or another member.
 * Shows total points, runs organized, verifications, and per-dungeon breakdown.
 * Public command - anyone can view stats.
 */
export const stats: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View quota statistics')
        .addUserOption(option =>
            option
                .setName('member')
                .setDescription('Member to view stats for (defaults to yourself)')
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

        // Get target user (defaults to command invoker)
        const targetUser = interaction.options.getUser('member') ?? interaction.user;

        // Defer reply (backend call may take a moment)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Fetch stats from backend
            const stats = await getQuotaStats(interaction.guildId, targetUser.id);

            // Build embed
            const embed = new EmbedBuilder()
                .setTitle(`📊 Quota Statistics`)
                .setDescription(`Statistics for <@${targetUser.id}>`)
                .setColor(0x3498db)
                .addFields(
                    { name: '🎯 Total Points', value: `${stats.total_points}`, inline: true },
                    { name: '🗺️ Runs Organized', value: `${stats.total_runs_organized}`, inline: true },
                    { name: '✅ Verifications', value: `${stats.total_verifications}`, inline: true }
                )
                .setTimestamp();

            // Create a map of dungeon stats from the backend response
            const dungeonStatsMap = new Map(
                stats.dungeons.map(d => [d.dungeon_key, { count: Number(d.count), points: Number(d.points) }])
            );

            // Build a list of dungeons with activity (filter out 0/0)
            const dungeonLines: string[] = [];
            
            for (const dungeonInfo of DUNGEON_DATA) {
                const dungeonKey = dungeonInfo.codeName;
                const statsForDungeon = dungeonStatsMap.get(dungeonKey);
                
                // Only show dungeons with activity (non-zero completes or organized)
                if (statsForDungeon && statsForDungeon.count > 0) {
                    dungeonLines.push(
                        `**${dungeonInfo.dungeonName}**: Completes: ${statsForDungeon.count} | Organized: ${statsForDungeon.count}`
                    );
                }
            }

            // Add dungeon statistics if there's any activity
            if (dungeonLines.length > 0) {
                // Split into multiple fields if needed (Discord has a 1024 character limit per field)
                const chunkSize = 20; // Show 20 dungeons per field
                for (let i = 0; i < dungeonLines.length; i += chunkSize) {
                    const chunk = dungeonLines.slice(i, i + chunkSize);
                    const fieldName = i === 0 ? '🏆 Dungeon Statistics' : '🏆 Dungeon Statistics (continued)';
                    
                    embed.addFields({
                        name: fieldName,
                        value: chunk.join('\n'),
                        inline: false
                    });
                }
            } else {
                embed.addFields({
                    name: '🏆 Dungeon Statistics',
                    value: 'No dungeons organized yet',
                    inline: false
                });
            }

            // Set thumbnail to user avatar
            embed.setThumbnail(targetUser.displayAvatarURL());

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            // Map backend errors to user-friendly messages
            let errorMessage = '❌ **Failed to retrieve statistics**\n\n';
            
            if (err instanceof BackendError) {
                switch (err.code) {
                    case 'VALIDATION_ERROR':
                        errorMessage += '**Issue:** Invalid request parameters.\n\n';
                        errorMessage += 'Please try again.';
                        break;
                    default:
                        errorMessage += `**Error:** ${err.message}\n\n`;
                        errorMessage += 'Please try again or contact an administrator if the problem persists.';
                }
            } else {
                console.error('Stats command error:', err);
                errorMessage += 'An unexpected error occurred. Please try again later.';
            }

            await interaction.editReply(errorMessage);
        }
    },
};
