import {
    ButtonInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} from 'discord.js';

export async function handleOrganizerPanel(btn: ButtonInteraction, runId: string) {
    // No permission check here - backend will verify when buttons are clicked
    // This allows the panel to be opened, but actions will be validated server-side

    const firstEmbed = btn.message.embeds?.[0];
    const dungeonTitle = firstEmbed?.title ?? 'Raid';

    const panelEmbed = new EmbedBuilder()
        .setTitle(`Organizer Panel — ${dungeonTitle}`)
        .setDescription('Use the controls below to manage the raid.')
        .setTimestamp(new Date());

    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`run:start:${runId}`).setLabel('Start').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`run:end:${runId}`).setLabel('End').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`run:cancel:${runId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    if (btn.deferred || btn.replied) {
        await btn.followUp({ embeds: [panelEmbed], components: [controls], flags: 1 << 6 });
    } else {
        await btn.reply({ embeds: [panelEmbed], components: [controls], flags: 1 << 6 });
    }
}
