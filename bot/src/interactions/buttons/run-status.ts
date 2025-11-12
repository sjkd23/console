import { ButtonInteraction, ChannelType } from 'discord.js';
import { getJSON, patchJSON, deleteJSON, BackendError } from '../../lib/http.js';

export async function handleStatus(
    btn: ButtonInteraction,
    runId: string,
    status: 'started' | 'ended' | 'cancelled'
) {
    // For button interactions, use deferUpdate so we can edit the original ephemeral panel later.
    await btn.deferUpdate();

    // 1) Update backend status (PATCH for started/ended, DELETE for cancelled) with actorId
    //    Backend will verify that btn.user.id === run.organizer_id
    try {
        if (status === 'cancelled') {
            await deleteJSON(`/runs/${runId}`, { actorId: btn.user.id });
        } else {
            await patchJSON(`/runs/${runId}`, { actorId: btn.user.id, status });
        }
    } catch (err) {
        if (err instanceof BackendError && err.code === 'NOT_ORGANIZER') {
            await btn.editReply({ content: 'Only the organizer can perform this action.', components: [] });
            return;
        }
        // Other errors
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await btn.editReply({ content: `Error: ${msg}`, components: [] });
        return;
    }

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
    } else if (status === 'ended') {
        // Change PUBLIC MESSAGE content to "Ended" and remove buttons.
        // We don't touch embeds at all.
        await pubMsg.edit({ content: 'Ended', components: [] });

        // "Remove" the organizer panel by clearing its components and changing the text.
        // This updates the very ephemeral message holding the Start/End buttons.
        await btn.editReply({ content: 'Run ended — organizer panel closed.', components: [] });
    } else {
        // status === 'cancelled'
        // Change PUBLIC MESSAGE content to "Cancelled" and remove buttons.
        await pubMsg.edit({ content: 'Cancelled', components: [] });

        // Close the organizer panel
        await btn.editReply({ content: 'Run cancelled — organizer panel closed.', components: [] });
    }
}
