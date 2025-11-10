// src/index.ts
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env') });

import {
    Client,
    GatewayIntentBits,
    Partials,
    Interaction,
    ButtonInteraction
} from 'discord.js';
import { commands } from './commands/index.js';
import { handleOrganizerPanel } from './interactions/buttons/organizer-panel.js';
import { handleJoin } from './interactions/buttons/join.js';
import { handleStatus } from './interactions/buttons/run-status.js';

const token = process.env.SECRET_KEY!;
const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel, Partials.GuildMember, Partials.User]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isAutocomplete()) {
            const cmd = commands.find(c => c.data.name === interaction.commandName);
            if (cmd?.autocomplete) await cmd.autocomplete(interaction);
            else await interaction.respond([]);
            return;
        }

        if (interaction.isChatInputCommand()) {
            const cmd = commands.find(c => c.data.name === interaction.commandName);
            if (cmd) await cmd.run(interaction);
            return;
        }

        if (interaction.isButton()) {
            const [ns, action, runId] = interaction.customId.split(':');
            if (ns !== 'run' || !runId) return;

            if (action === 'org' || action === 'panel') {
                await handleOrganizerPanel(interaction, runId);
                return;
            }
            if (action === 'join') {
                await handleJoin(interaction, runId);
                return;
            }
            if (action === 'start') {
                await handleStatus(interaction, runId, 'started');
                return;
            }
            if (action === 'end') {
                await handleStatus(interaction, runId, 'ended');
                return;
            }

            // fallback
            await interaction.reply({ content: 'Unknown action.', flags: 1 << 6 });
        }
    } catch (e) {
        console.error(e);
        if ('isRepliable' in interaction && interaction.isRepliable()) {
            interaction.deferred || interaction.replied
                ? await interaction.followUp({ content: 'Something went wrong.', flags: 1 << 6 })
                : await interaction.reply({ content: 'Something went wrong.', flags: 1 << 6 });
        }
    }
});


await client.login(token);
