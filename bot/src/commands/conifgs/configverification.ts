// bot/src/commands/conifgs/configverification.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    GuildMember,
    ChannelType,
    TextChannel,
} from 'discord.js';
import type { SlashCommand } from '../_types.js';
import { getGuildChannels, BackendError, getGuildVerificationConfig, updateGuildVerificationConfig } from '../../lib/http.js';
import { hasInternalRole, getMemberRoleIds } from '../../lib/permissions/permissions.js';
import {
    createVerificationPanelEmbed,
    createVerificationPanelButton,
} from '../../lib/verification.js';

export const configverification: SlashCommand = {
    requiredRole: 'moderator',
    data: new SlashCommandBuilder()
        .setName('configverification')
        .setDescription('Manage RealmEye verification system (Moderator+)')
        .addSubcommand(sub => 
            sub
                .setName('send-panel')
                .setDescription('Send the verification panel to a channel')
                .addChannelOption(o => 
                    o
                        .setName('channel')
                        .setDescription('Channel to send panel to (uses configured get-verified channel if not specified)')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
                .addStringOption(o =>
                    o
                        .setName('custom_message')
                        .setDescription('Optional custom message to include in the panel embed')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('set-panel-message')
                .setDescription('Set custom message for the get-verified panel')
                .addStringOption(o =>
                    o
                        .setName('message')
                        .setDescription('Custom message to display in the panel embed (leave empty to clear)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('set-manual-instructions')
                .setDescription('Set custom instructions for manual verification screenshot')
                .addStringOption(o =>
                    o
                        .setName('instructions')
                        .setDescription('Custom instructions with example picture info (leave empty to clear)')
                        .setRequired(false)
                )
        )
        .setDMPermission(false),

    async run(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            // 1) Guild-only check
            if (!interaction.inGuild() || !interaction.guild) {
                await interaction.reply({
                    content: 'This command can only be used in a server.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // 2) Defer early
            await interaction.deferReply({ ephemeral: true });

            // 3) Fetch member
            let member: GuildMember;
            try {
                member = await interaction.guild.members.fetch(interaction.user.id);
            } catch {
                await interaction.editReply('❌ Could not fetch your member record. Try again in a moment.');
                return;
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'send-panel') {
                await handleSendPanel(interaction, member);
            } else if (subcommand === 'set-panel-message') {
                await handleSetPanelMessage(interaction, member);
            } else if (subcommand === 'set-manual-instructions') {
                await handleSetManualInstructions(interaction, member);
            }
        } catch (unhandled) {
            console.error('[configverification] Unhandled error:', unhandled);
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply('❌ Something went wrong while handling this command.');
                } else {
                    await interaction.reply({ content: '❌ Something went wrong.', ephemeral: true });
                }
            } catch { }
        }
    },
};

async function handleSendPanel(
    interaction: ChatInputCommandInteraction,
    member: GuildMember
): Promise<void> {
    const guild = interaction.guild!;

    // Get custom message option
    const customMessage = interaction.options.getString('custom_message');

    // Get target channel (from option or config)
    let targetChannel: TextChannel | null = null;
    const channelOption = interaction.options.getChannel('channel');

    if (channelOption) {
        // Use specified channel
        if (channelOption.type !== ChannelType.GuildText) {
            await interaction.editReply('❌ The specified channel must be a text channel.');
            return;
        }
        targetChannel = channelOption as TextChannel;
    } else {
        // Use configured get-verified channel
        try {
            const { channels } = await getGuildChannels(guild.id);
            const getverifiedChannelId = channels.getverified;

            if (!getverifiedChannelId) {
                await interaction.editReply(
                    '❌ **Get-Verified channel not configured**\n\n' +
                    'Please configure the get-verified channel first using `/setchannels getverified:#channel`.\n' +
                    'Alternatively, you can specify a channel using the `channel` option.'
                );
                return;
            }

            const channel = await guild.channels.fetch(getverifiedChannelId);
            if (!channel || channel.type !== ChannelType.GuildText) {
                await interaction.editReply(
                    '❌ **Configured get-verified channel not found or invalid**\n\n' +
                    'The configured channel may have been deleted. Please reconfigure it using `/setchannels`.'
                );
                return;
            }

            targetChannel = channel as TextChannel;
        } catch (err) {
            console.error('[configverification] Error fetching channel config:', err);
            await interaction.editReply(
                '❌ Failed to load channel configuration. Please try again later.'
            );
            return;
        }
    }

    // Check bot permissions in target channel
    const botMember = await guild.members.fetchMe();
    const permissions = targetChannel.permissionsFor(botMember);

    if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
        await interaction.editReply(
            `❌ **Missing Permissions**\n\n` +
            `The bot lacks permission to send messages or embed links in ${targetChannel}.\n` +
            `Please grant the bot these permissions and try again.`
        );
        return;
    }

    // Send verification panel
    try {
        // Get saved custom message if not provided
        let finalCustomMessage = customMessage;
        if (!finalCustomMessage) {
            const config = await getGuildVerificationConfig(guild.id);
            finalCustomMessage = config.panel_custom_message;
        }

        const embed = createVerificationPanelEmbed(finalCustomMessage);
        const button = createVerificationPanelButton();

        const message = await targetChannel.send({
            embeds: [embed],
            components: [button],
        });

        // Success response
        await interaction.editReply(
            `✅ **Verification panel sent!**\n\n` +
            `The verification panel has been posted in ${targetChannel}.\n` +
            `Users can now click the "Get Verified" button to start the verification process.\n\n` +
            `[Jump to message](${message.url})`
        );
    } catch (err) {
        console.error('[configverification] Error sending panel:', err);
        await interaction.editReply(
            '❌ Failed to send verification panel. Please check bot permissions and try again.'
        );
    }
}

async function handleSetPanelMessage(
    interaction: ChatInputCommandInteraction,
    member: GuildMember
): Promise<void> {
    const guild = interaction.guild!;
    const message = interaction.options.getString('message') || null;

    try {
        await updateGuildVerificationConfig(guild.id, {
            panel_custom_message: message ?? undefined,
        });

        if (message) {
            await interaction.editReply(
                `✅ **Panel message updated**\n\n` +
                `**New message:**\n${message}\n\n` +
                `This message will be included in future verification panels.\n` +
                `Use \`/configverification send-panel\` to post an updated panel.`
            );
        } else {
            await interaction.editReply(
                `✅ **Panel message cleared**\n\n` +
                `The custom panel message has been removed.\n` +
                `Verification panels will use the default message.`
            );
        }
    } catch (err) {
        console.error('[configverification] Error updating panel message:', err);
        await interaction.editReply(
            '❌ Failed to update panel message. Please try again later.'
        );
    }
}

async function handleSetManualInstructions(
    interaction: ChatInputCommandInteraction,
    member: GuildMember
): Promise<void> {
    const guild = interaction.guild!;
    const instructions = interaction.options.getString('instructions') || null;

    try {
        await updateGuildVerificationConfig(guild.id, {
            manual_verify_instructions: instructions ?? undefined,
        });

        if (instructions) {
            await interaction.editReply(
                `✅ **Manual verification instructions updated**\n\n` +
                `**New instructions:**\n${instructions}\n\n` +
                `These instructions will be shown to users who select "Manual Verify Screenshot".`
            );
        } else {
            await interaction.editReply(
                `✅ **Manual verification instructions cleared**\n\n` +
                `The custom instructions have been removed.\n` +
                `Users will see the default instructions when choosing manual verification.`
            );
        }
    } catch (err) {
        console.error('[configverification] Error updating manual instructions:', err);
        await interaction.editReply(
            '❌ Failed to update manual instructions. Please try again later.'
        );
    }
}
