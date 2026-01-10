// bot/src/commands/configs/createrole.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits,
    GuildMember,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Role,
    TextChannel,
} from 'discord.js';
import type { SlashCommand } from '../_types.js';
import {
    createCustomRoleVerification,
    updateCustomRoleVerificationConfig,
    BackendError,
    type CustomRoleVerificationConfig,
} from '../../lib/utilities/http.js';
import { logCommandExecution, logConfigChange } from '../../lib/logging/bot-logger.js';

export const createrole: SlashCommand = {
    requiredRole: undefined, // Uses Discord Administrator permission
    data: new SlashCommandBuilder()
        .setName('createrole')
        .setDescription('Create a custom role verification panel (Administrator)')
        .addRoleOption(o =>
            o
                .setName('role')
                .setDescription('The role to grant upon successful verification')
                .setRequired(true)
        )
        .addChannelOption(o =>
            o
                .setName('role_channel')
                .setDescription('Channel where the verification panel will be posted')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addChannelOption(o =>
            o
                .setName('verification_channel')
                .setDescription('Channel where verification requests will appear for staff review')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addStringOption(o =>
            o
                .setName('instructions')
                .setDescription('Instructions for what users need to submit (e.g., screenshot requirements)')
                .setRequired(true)
                .setMaxLength(2000)
        )
        .addStringOption(o =>
            o
                .setName('role_description')
                .setDescription('Optional description of the role (shown above instructions in panel)')
                .setRequired(false)
                .setMaxLength(500)
        )
        .addAttachmentOption(o =>
            o
                .setName('example_screenshot')
                .setDescription('An example screenshot to show users what to submit')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

            // 2) Check Discord Administrator permission
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content:
                        '❌ **Access Denied**\n\n' +
                        'You must have Discord **Administrator** permission to create custom role verification panels.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // 3) Defer early
            await interaction.deferReply();

            // 4) Get options
            const role = interaction.options.getRole('role', true) as Role;
            const roleChannelOption = interaction.options.getChannel('role_channel', true);
            const verificationChannelOption = interaction.options.getChannel('verification_channel', true);
            const instructions = interaction.options.getString('instructions', true);
            const roleDescription = interaction.options.getString('role_description');
            const exampleImageAttachment = interaction.options.getAttachment('example_screenshot');
            const exampleImage = exampleImageAttachment?.url;

            // 5) Validate channels are text channels and fetch full channel objects
            if (roleChannelOption.type !== ChannelType.GuildText || verificationChannelOption.type !== ChannelType.GuildText) {
                await interaction.editReply(
                    '❌ Both channels must be text channels.'
                );
                return;
            }

            // Fetch full channel objects from guild
            const roleChannel = await interaction.guild.channels.fetch(roleChannelOption.id);
            const verificationChannel = await interaction.guild.channels.fetch(verificationChannelOption.id);

            if (!roleChannel || !verificationChannel ||
                roleChannel.type !== ChannelType.GuildText ||
                verificationChannel.type !== ChannelType.GuildText) {
                await interaction.editReply(
                    '❌ Failed to fetch channels. Please try again.'
                );
                return;
            }

            // 6) Check bot permissions in role_channel
            const botMember = await interaction.guild.members.fetchMe();
            const roleChannelPerms = roleChannel.permissionsFor(botMember);

            if (!roleChannelPerms || !roleChannelPerms.has(['SendMessages', 'EmbedLinks'])) {
                await interaction.editReply(
                    `❌ **Missing Permissions in ${roleChannel}**\n\n` +
                    'The bot needs **Send Messages** and **Embed Links** permissions in the role channel to post the verification panel.'
                );
                return;
            }

            // 7) Check bot permissions in verification_channel
            const verificationChannelPerms = verificationChannel.permissionsFor(botMember);

            if (!verificationChannelPerms || !verificationChannelPerms.has(['SendMessages', 'EmbedLinks'])) {
                await interaction.editReply(
                    `❌ **Missing Permissions in ${verificationChannel}**\n\n` +
                    'The bot needs **Send Messages** and **Embed Links** permissions in the verification channel to post tickets.'
                );
                return;
            }

            // 8) Check if bot can manage the role
            const botHighestRole = botMember.roles.highest;
            if (botHighestRole.position <= role.position) {
                await interaction.editReply(
                    `❌ **Cannot Manage Role**\n\n` +
                    `The bot's highest role (${botHighestRole.name}) is not higher than ${role.name}.\n` +
                    'Please move the bot\'s role above the target role in Server Settings > Roles.'
                );
                return;
            }

            // 9) Create backend config
            let config: CustomRoleVerificationConfig;
            try {
                config = await createCustomRoleVerification({
                    guild_id: interaction.guildId!,
                    role_id: role.id,
                    role_channel_id: roleChannel.id,
                    verification_channel_id: verificationChannel.id,
                    instructions,
                    role_description: roleDescription || undefined,
                    example_image_url: exampleImage || undefined,
                    created_by_user_id: interaction.user.id,
                });
            } catch (err) {
                console.error('[CreateRole] Error creating config:', err);
                let msg = '❌ Failed to create role verification configuration. Please try again later.';
                if (err instanceof BackendError) {
                    if (err.code === 'VALIDATION_ERROR') {
                        msg = `❌ Validation error: ${err.message}`;
                    }
                }
                await interaction.editReply(msg);
                await logCommandExecution(interaction.client, interaction, {
                    success: false,
                    errorMessage: msg,
                });
                return;
            }

            // 10) Create and send verification panel
            let panelDescription = '';
            
            // Add role description if provided
            if (roleDescription) {
                panelDescription += `${roleDescription}\n\n`;
            }
            
            panelDescription +=
                '**How it works:**\n' +
                '1️⃣ Click "Get Verified" below\n' +
                '2️⃣ Follow the DM instructions\n' +
                `3️⃣ Get the @${role.name} role\n\n` +
                '**Requirements:**\n' +
                `${instructions}` +
                `${exampleImage ? '\n\n**Example:**' : ''}`;
            
            const panelEmbed = new EmbedBuilder()
                .setTitle(`${role.name} Role Verification`)
                .setDescription(panelDescription)
                .setColor(role.color || 0x5865F2)
                .setFooter({ text: 'Click the button below to start' });

            // Add example image if provided
            if (exampleImage) {
                panelEmbed.setImage(exampleImage);
            }

            const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`customrole:get_verified:${config.id}`)
                    .setLabel('✅ Get Verified')
                    .setStyle(ButtonStyle.Success)
            );

            let panelMessage;
            try {
                panelMessage = await roleChannel.send({
                    embeds: [panelEmbed],
                    components: [button],
                });

                // Update config with panel message ID
                await updateCustomRoleVerificationConfig(config.id, {
                    panel_message_id: panelMessage.id,
                });
            } catch (err) {
                console.error('[CreateRole] Error sending panel:', err);
                await interaction.editReply(
                    '❌ Failed to send verification panel. Please check bot permissions and try again.'
                );
                return;
            }

            // 11) Success response
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Role Verification Created')
                .setDescription(
                    `Successfully created verification panel for ${role}!\n\n` +
                    `**Panel Channel:** ${roleChannel}\n` +
                    `**Verification Channel:** ${verificationChannel}\n` +
                    `**Panel Message:** [Jump to panel](${panelMessage.url})`
                )
                .addFields(
                    { name: 'Instructions:', value: instructions }
                )
                .setColor(0x00ff00)
                .setTimestamp();
            
            // Add role description field if provided
            if (roleDescription) {
                successEmbed.addFields(
                    { name: 'Role Description:', value: roleDescription }
                );
            }

            if (exampleImage) {
                successEmbed.addFields({ name: ' ', value: '**Example:**' });
                successEmbed.setImage(exampleImage);
            }


            await interaction.editReply({ embeds: [successEmbed] });

            // 12) Log to bot-log channel
            const logFields: Record<string, { old?: string; new: string }> = {
                Role: { new: `<@&${role.id}>` },
                'Panel Channel': { new: `<#${roleChannel.id}>` },
                'Verification Channel': { new: `<#${verificationChannel.id}>` },
                Instructions: { new: instructions },
            };
            
            if (roleDescription) {
                logFields['Role Description'] = { new: roleDescription };
            }
            
            await logConfigChange(
                interaction.client,
                interaction.guildId!,
                'Custom Role Verification',
                interaction.user.id,
                logFields
            );

            await logCommandExecution(interaction.client, interaction, { success: true });
        } catch (unhandled) {
            console.error('[CreateRole] Unhandled error:', unhandled);
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
