import { ButtonInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { postJSON, getJSON } from '../../lib/http.js';

function setRaidersField(embed: EmbedBuilder, count: number): EmbedBuilder {
    const data = embed.toJSON();
    const fields = [...(data.fields ?? [])];

    const idx = fields.findIndex(f => (f.name ?? '').toLowerCase() === 'raiders');
    if (idx >= 0) {
        fields[idx] = { ...fields[idx], value: String(count) };
    } else {
        fields.push({ name: 'Raiders', value: String(count), inline: false });
    }

    return new EmbedBuilder(data).setFields(fields as any);
}

function updateClassField(embed: EmbedBuilder, classCounts: Record<string, number>): EmbedBuilder {
    const data = embed.toJSON();
    let fields = [...(data.fields ?? [])];

    // Filter out non-zero classes and format
    const entries = Object.entries(classCounts)
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => a.localeCompare(b)); // Sort alphabetically

    let classText: string;
    if (entries.length === 0) {
        classText = 'None selected';
    } else if (entries.length <= 6) {
        // For 6 or fewer classes, show on one line
        classText = entries.map(([cls, count]) => `${cls} (${count})`).join(', ');
    } else {
        // For more than 6 classes, format in columns (3 per line)
        const formatted = entries.map(([cls, count]) => `${cls} (${count})`);
        const lines: string[] = [];
        for (let i = 0; i < formatted.length; i += 3) {
            const chunk = formatted.slice(i, i + 3);
            lines.push(chunk.join(' • '));
        }
        classText = lines.join('\n');
    }

    const idx = fields.findIndex(f => (f.name ?? '').toLowerCase() === 'classes');
    if (idx >= 0) {
        fields[idx] = { ...fields[idx], value: classText };
    } else {
        // Insert after Raiders field
        const raidersIdx = fields.findIndex(f => (f.name ?? '').toLowerCase() === 'raiders');
        if (raidersIdx >= 0) {
            fields.splice(raidersIdx + 1, 0, { name: 'Classes', value: classText, inline: false });
        } else {
            fields.push({ name: 'Classes', value: classText, inline: false });
        }
    }

    return new EmbedBuilder(data).setFields(fields as any);
}

export async function handleJoin(btn: ButtonInteraction, runId: string) {
    // Defer the reply so we can send a follow-up message
    await btn.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await postJSON<{ joinCount: number; benchCount: number }>(`/runs/${runId}/reactions`, {
        userId: btn.user.id,
        state: 'join'
    });

    // Fetch class counts to update the display
    const classRes = await getJSON<{ classCounts: Record<string, number> }>(
        `/runs/${runId}/classes`
    ).catch(() => ({ classCounts: {} }));

    const msg = btn.message;
    const embeds = msg.embeds ?? [];
    if (!embeds.length) return;

    const first = EmbedBuilder.from(embeds[0]);
    const updatedWithCount = setRaidersField(first, result.joinCount);
    const updatedWithClasses = updateClassField(updatedWithCount, classRes.classCounts);

    await msg.edit({ embeds: [updatedWithClasses, ...embeds.slice(1)] });

    // Send ephemeral confirmation message
    await btn.editReply({
        content: '✅ **You have joined the raid!**\n\nCheck above the raid panel for the **Party** and **Location** of the run!'
    });
}
