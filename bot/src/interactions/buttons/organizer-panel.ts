import {
    ButtonInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { getJSON } from '../../lib/http.js';
import { checkOrganizerAccess } from '../../lib/interaction-permissions.js';

export async function handleOrganizerPanel(btn: ButtonInteraction, runId: string) {
    // Fetch run status from backend to determine which buttons to show
    const run = await getJSON<{ status: string; dungeonLabel: string; organizerId: string }>(
        `/runs/${runId}`
    ).catch(() => null);

    if (!run) {
        await btn.reply({
            content: 'Could not fetch run details.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Authorization check using centralized helper
    const accessCheck = await checkOrganizerAccess(btn, run.organizerId);
    if (!accessCheck.allowed) {
        await btn.reply({
            content: accessCheck.errorMessage,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const firstEmbed = btn.message.embeds?.[0];
    const dungeonTitle = firstEmbed?.title ?? run.dungeonLabel ?? 'Raid';

    const panelEmbed = new EmbedBuilder()
        .setTitle(`Organizer Panel — ${dungeonTitle}`)
        .setDescription('Use the controls below to manage the raid.')
        .setTimestamp(new Date());

    let controls: ActionRowBuilder<ButtonBuilder>[];

    if (run.status === 'open') {
        // Starting phase: Start, Cancel (row 1) + Set Party, Set Location (row 2)
        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`run:start:${runId}`)
                .setLabel('Start')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`run:cancel:${runId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        );
        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`run:setparty:${runId}`)
                .setLabel('Set Party')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`run:setlocation:${runId}`)
                .setLabel('Set Location')
                .setStyle(ButtonStyle.Secondary)
        );
        controls = [row1, row2];
    } else if (run.status === 'live') {
        // Live phase: End, Ping Raiders, Update Note, Key popped (row 1) + Set Party, Set Location (row 2)
        const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`run:end:${runId}`)
                .setLabel('End Run')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`run:ping:${runId}`)
                .setLabel('Ping Raiders')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true), // Placeholder for future implementation
            new ButtonBuilder()
                .setCustomId(`run:note:${runId}`)
                .setLabel('Update Note')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true), // Placeholder for future implementation
            new ButtonBuilder()
                .setCustomId(`run:keypop:${runId}`)
                .setLabel('Key popped')
                .setStyle(ButtonStyle.Success)
        );
        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`run:setparty:${runId}`)
                .setLabel('Set Party')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`run:setlocation:${runId}`)
                .setLabel('Set Location')
                .setStyle(ButtonStyle.Secondary)
        );
        controls = [row1, row2];
    } else {
        // Ended phase: no controls
        await btn.reply({
            content: 'This run has ended.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (btn.deferred || btn.replied) {
        await btn.followUp({ embeds: [panelEmbed], components: controls, flags: MessageFlags.Ephemeral });
    } else {
        await btn.reply({ embeds: [panelEmbed], components: controls, flags: MessageFlags.Ephemeral });
    }
}
