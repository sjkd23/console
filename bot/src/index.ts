// src/index.ts
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env') });

import {
    Client,
    Events,
    GatewayIntentBits,
    MessageFlags,
    Partials,
    Interaction,
    ButtonInteraction
} from 'discord.js';
import { commands } from './commands/index.js';
import { handleOrganizerPanel } from './interactions/buttons/organizer-panel.js';
import { handleJoin } from './interactions/buttons/join.js';
import { handleStatus } from './interactions/buttons/run-status.js';
import { handleClassSelection } from './interactions/buttons/class-selection.js';
import { handleKeyWindow } from './interactions/buttons/key-window.js';
import { handleSetParty, handleSetLocation } from './interactions/buttons/party-location.js';
import { 
    handleQuotaConfigBasic, 
    handleQuotaConfigDungeons, 
    handleQuotaRefreshPanel,
    handleQuotaResetPanel,
    handleQuotaBasicModal,
    handleQuotaDungeonModal,
    handleQuotaSelectDungeon,
} from './interactions/buttons/quota-config.js';
import { startSuspensionCleanup } from './lib/suspension-cleanup.js';
import { startRunAutoEnd } from './lib/run-auto-end.js';
import { syncTeamRoleForMember } from './lib/team-role-manager.js';

const token = process.env.SECRET_KEY!;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Required for guildMemberUpdate event
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.User]
});

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}`);
    
    // Start automatic suspension cleanup task
    startSuspensionCleanup(client);
    
    // Start automatic run auto-end task
    startRunAutoEnd(client);
});

// Listen for role changes on guild members
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
        // Check if roles changed
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;
        
        // If roles are different, sync team role
        if (oldRoles.size !== newRoles.size || 
            !oldRoles.every(role => newRoles.has(role.id))) {
            await syncTeamRoleForMember(newMember);
        }
    } catch (error) {
        console.error('[GuildMemberUpdate] Error syncing team role:', error);
    }
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
            // Handle quota config buttons
            if (interaction.customId.startsWith('quota_config_basic:')) {
                await handleQuotaConfigBasic(interaction);
                return;
            }
            if (interaction.customId.startsWith('quota_config_dungeons:')) {
                await handleQuotaConfigDungeons(interaction);
                return;
            }
            if (interaction.customId.startsWith('quota_refresh_panel:')) {
                await handleQuotaRefreshPanel(interaction);
                return;
            }
            if (interaction.customId.startsWith('quota_reset_panel:')) {
                await handleQuotaResetPanel(interaction);
                return;
            }

            // Handle run management buttons
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
            if (action === 'class') {
                await handleClassSelection(interaction, runId);
                return;
            }
            if (action === 'start') {
                await handleStatus(interaction, runId, 'live');
                return;
            }
            if (action === 'end') {
                await handleStatus(interaction, runId, 'ended');
                return;
            }
            if (action === 'cancel') {
                await handleStatus(interaction, runId, 'cancelled');
                return;
            }
            if (action === 'keypop') {
                await handleKeyWindow(interaction, runId);
                return;
            }
            if (action === 'setparty') {
                await handleSetParty(interaction, runId);
                return;
            }
            if (action === 'setlocation') {
                await handleSetLocation(interaction, runId);
                return;
            }

            // fallback
            await interaction.reply({ content: 'Unknown action.', flags: MessageFlags.Ephemeral });
        }

        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('quota_basic_modal:')) {
                await handleQuotaBasicModal(interaction);
                return;
            }
            if (interaction.customId.startsWith('quota_dungeon_modal:')) {
                await handleQuotaDungeonModal(interaction);
                return;
            }
        }

        // Handle select menu interactions
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('quota_select_dungeon_exalt:') ||
                interaction.customId.startsWith('quota_select_dungeon_misc1:') ||
                interaction.customId.startsWith('quota_select_dungeon_misc2:')) {
                await handleQuotaSelectDungeon(interaction);
                return;
            }
        }
    } catch (e) {
        console.error(e);
        if ('isRepliable' in interaction && interaction.isRepliable()) {
            interaction.deferred || interaction.replied
                ? await interaction.followUp({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral })
                : await interaction.reply({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral });
        }
    }
});


await client.login(token);
