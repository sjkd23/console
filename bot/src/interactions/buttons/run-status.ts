import { ButtonInteraction, ChannelType } from 'discord.js';
import { getJSON, patchJSON } from '../../lib/http.js';
import { extractFirstUserMentionId, isOrganizer } from '../../lib/permissions.js';

export async function handleStatus(
    btn: ButtonInteraction,
    runId: string,
    status: 'started' | 'ended'
) {
    // Gate: organizer only (we read Organizer mention from your embed description)
    const firstEmbed = btn.message.embeds?.[0];
    const organizerFromEmbed = extractFirstUserMentionId(firstEmbed?.description ?? undefined);

    const member = btn.guild
        ? (btn.guild.members.cache.get(btn.user.id) ??
            (await btn.guild.members.fetch(btn.user.id).catch(() => null)))
        : null;

    if (!isOrganizer(member, organizerFromEmbed)) {
        // ephemeral – use flags to avoid deprecation warning
        await btn.reply({ content: 'Organizer only.', flags: 1 << 6 });
        return;
    }

    // For button interactions, use deferUpdate so we can edit the original ephemeral panel later.
    await btn.deferUpdate();

    // 1) Update backend status (PATCH)
    await patchJSON(`/runs/${runId}`, { status });

    // 2) Find the public run message (channelId + postMessageId from backend)
    const run = await getJSON<{ channelId: string | null; postMessageId: string | null }>(`/runs/${runId}`);
    if (!run.channelId || !run.postMessageId) {
        await btn.editReply({ content: 'Run record missing channel/message id.', components: [] });
        return;
    }

    const ch = await btn.client.channels.fetch(run.channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) {
        await btn.editReply({ content: 'Could not locate run channel.', components: [] });
        return;
    }

    const pubMsg = await ch.messages.fetch(run.postMessageId).catch(() => null);
    if (!pubMsg) {
        await btn.editReply({ content: 'Public run message no longer exists.', components: [] });
        return;
    }

    // 3) Apply UI changes
    if (status === 'started') {
        // Keep embed & components as-is; optionally you could add a small content note.
        // Here we do nothing to the public message content/components.
        await btn.editReply({ content: 'Run started ✔️' });
    } else {
        // status === 'ended'
        // Change PUBLIC MESSAGE content to "Ended" and remove buttons.
        // We don't touch embeds at all.
        await pubMsg.edit({ content: 'Ended', components: [] });

        // "Remove" the organizer panel by clearing its components and changing the text.
        // This updates the very ephemeral message holding the Start/End buttons.
        await btn.editReply({ content: 'Run ended — organizer panel closed.', components: [] });
    }
}
