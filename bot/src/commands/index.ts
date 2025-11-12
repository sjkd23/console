import { REST, Routes } from 'discord.js';
import type { SlashCommand } from './_types.js';
import { withPermissionCheck } from '../lib/command-middleware.js';
import { ping } from './ping.js';
import { info } from './info.js';
import { runCreate } from './run.js';
import { verify } from './verify.js';
import { setroles } from './setroles.js';
import { setchannels } from './setchannels.js';
import { editname } from './editname.js';
import { unverify } from './unverify.js';
import { warn } from './warn.js';
import { suspend } from './suspend.js';
import { unsuspend } from './unsuspend.js';
import { removepunishment } from './removepunishment.js';
import { checkpunishments } from './checkpunishments.js';
import { logrun } from './logrun.js';
import { stats } from './stats.js';
import { syncteam } from './syncteam.js';
import { configquota } from './configquota.js';

// Apply permission middleware to all commands
export const commands: SlashCommand[] = [
    ping,
    info,
    withPermissionCheck(runCreate),
    withPermissionCheck(verify),
    setroles,
    setchannels,
    editname,
    withPermissionCheck(unverify),
    withPermissionCheck(warn),
    withPermissionCheck(suspend),
    withPermissionCheck(unsuspend),
    withPermissionCheck(removepunishment),
    withPermissionCheck(checkpunishments),
    withPermissionCheck(logrun),
    stats,
    syncteam,
    configquota,
];

export function toJSON() {
    return commands.map(c => c.data.toJSON());
}


export async function registerAll(rest: REST, appId: string, guildId: string) {
    const body = toJSON();
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body });
    return body.map(c => c.name);
}
