import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import type { SlashCommand } from './_types.js';

export const ping: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with pong and latency.'),
    async run(interaction: ChatInputCommandInteraction) {
        const sent = Date.now();
        await interaction.reply({ content: 'Pong!', flags: MessageFlags.Ephemeral });
        const latency = Date.now() - sent;
        await interaction.followUp({ content: `Latency: ~${latency} ms`, flags: MessageFlags.Ephemeral });
    }
};
