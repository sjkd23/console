import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env') });

import { botConfig, getDevGuildIds } from './config.js';
import { REST } from 'discord.js';
import { registerAll } from './commands/index.js';

const rest = new REST({ version: '10' }).setToken(botConfig.SECRET_KEY);

async function main() {
    // Check if --global flag is passed
    const isGlobal = process.argv.includes('--global');
    
    if (isGlobal) {
        // Register commands globally (available to all servers)
        console.log('🌍 Registering commands globally...');
        const names = await registerAll(rest, botConfig.APPLICATION_ID);
        console.log('📝 Commands:', names.join(', '));
        console.log('⏳ Global commands may take up to 1 hour to appear in all servers');
    } else {
        // Register commands to dev guilds (for testing)
        const guildIds = getDevGuildIds();
        console.log(`🔧 Registering commands to ${guildIds.length} dev guild(s)...`);
        
        for (const guildId of guildIds) {
            console.log(`   📍 Registering to guild: ${guildId}`);
            const names = await registerAll(rest, botConfig.APPLICATION_ID, guildId);
            console.log(`   ✅ Registered ${names.length} commands to guild ${guildId}`);
        }
        
        console.log('✅ All dev guild commands registered (instant)');
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
