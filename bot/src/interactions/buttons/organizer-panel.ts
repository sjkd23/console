import {
    ButtonInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} from 'discord.js';
import { extractFirstUserMentionId, isOrganizer } from '../../lib/permissions.js';

export async function handleOrganizerPanel(btn: ButtonInteraction, runId: string) {
    // Figure out who the organizer is from the public embed (your layout puts it in description)
    const firstEmbed = btn.message.embeds?.[0];
    const organizerFromEmbed = extractFirstUserMentionId(firstEmbed?.description ?? undefined);

    // fetch guild member
    const member = btn.guild
        ? (btn.guild.members.cache.get(btn.user.id) ?? await btn.guild.members.fetch(btn.user.id).catch(() => null))
        : null;

    if (!isOrganizer(member, organizerFromEmbed)) {
        await btn.reply({ content: 'Organizer only.', flags: 1 << 6 });
        return;
    }

    const dungeonTitle = firstEmbed?.title ?? 'Raid';

    const panelEmbed = new EmbedBuilder()
        .setTitle(`Organizer Panel — ${dungeonTitle}`)
        .setDescription('Use the controls below to manage the raid.')
        .setTimestamp(new Date());

    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`run:start:${runId}`).setLabel('Start').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`run:end:${runId}`).setLabel('End').setStyle(ButtonStyle.Danger)
    );

    if (btn.deferred || btn.replied) {
        await btn.followUp({ embeds: [panelEmbed], components: [controls], flags: 1 << 6 });
    } else {
        await btn.reply({ embeds: [panelEmbed], components: [controls], flags: 1 << 6 });
    }
}
