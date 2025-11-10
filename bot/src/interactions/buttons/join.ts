import { ButtonInteraction, EmbedBuilder } from 'discord.js';
import { postJSON } from '../../lib/http.js';

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

export async function handleJoin(btn: ButtonInteraction, runId: string) {
    // Acknowledge the button to prevent "interaction failed"
    await btn.deferUpdate();

    const { count } = await postJSON<{ count: number }>(`/runs/${runId}/reactions`, {
        userId: btn.user.id
    });

    const msg = btn.message;
    const embeds = msg.embeds ?? [];
    if (!embeds.length) return;

    const first = EmbedBuilder.from(embeds[0]);
    const updated = setRaidersField(first, count);

    await msg.edit({ embeds: [updated, ...embeds.slice(1)] });
}
