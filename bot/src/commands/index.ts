import { REST, Routes } from 'discord.js';
import type { SlashCommand } from './_types.js';
import { withPermissionCheck } from '../lib/permissions/command-middleware.js';
import { withRateLimit } from '../lib/utilities/rate-limit-middleware.js';
import { runCreate } from './organizer/run.js';
import { taken } from './organizer/taken.js';
import { verify } from './moderation/verify.js';
import { setroles } from './configs/setroles.js';
import { setchannels } from './configs/setchannels.js';
import { sendrolepingembed } from './configs/sendrolepingembed.js';
import { editname } from './moderation/editname.js';
import { unverify } from './moderation/unverify.js';
import { addalt } from './moderation/addalt.js';
import { removealt } from './moderation/removealt.js';
import { warn } from './moderation/warn.js';
import { suspend } from './moderation/suspend.js';
import { unsuspend } from './moderation/unsuspend.js';
import { removepunishment } from './moderation/removepunishment.js';
import { checkpunishments } from './moderation/checkpunishments.js';
import { addnote } from './moderation/addnote.js';
import { logrun } from './organizer/logrun.js';
import { logkey } from './organizer/logkey.js';
import { stats } from './stats.js';
import { syncteam } from './moderation/syncteam.js';
import { configquota } from './configs/configquota.js';
import { configpoints } from './configs/configpoints.js';
import { configverification } from './configs/configverification.js';
import { configrolepings } from './configs/configrolepings.js';
import { help } from './help.js';
import { ping } from './ping.js';
import { addquotapoints } from './moderation/addquotapoints.js';
import { addpoints } from './moderation/addpoints.js';
import { addrole } from './moderation/addrole.js';
import { kick } from './moderation/kick.js';
import { ban } from './moderation/ban.js';
import { unban } from './moderation/unban.js';
import { softban } from './moderation/softban.js';
import { mute } from './moderation/mute.js';
import { unmute } from './moderation/unmute.js';
import { headcount } from './organizer/headcount.js';
import { leaderboard } from './leaderboard.js';
import { purge } from './moderation/purge.js';
import { modmail } from './moderation/modmail.js';
import { modmailreply } from './moderation/modmailreply.js';
import { modmailblacklist } from './moderation/modmailblacklist.js';
import { modmailunblacklist } from './moderation/modmailunblacklist.js';

/**
 * Helper to apply both permission checks and rate limiting to a command.
 * Order matters: permission check first, then rate limit (no point rate limiting unauthorized users).
 */
const withMiddleware = (cmd: SlashCommand) => withRateLimit(withPermissionCheck(cmd));

// Apply permission middleware and rate limiting to all commands
export const commands: SlashCommand[] = [
    withMiddleware(runCreate),
    withMiddleware(taken),
    withMiddleware(headcount),
    withMiddleware(verify),
    withMiddleware(setroles),
    withMiddleware(setchannels),
    withMiddleware(sendrolepingembed),
    withMiddleware(editname),
    withMiddleware(unverify),
    withMiddleware(addalt),
    withMiddleware(removealt),
    withMiddleware(warn),
    withMiddleware(suspend),
    withMiddleware(unsuspend),
    withMiddleware(removepunishment),
    withMiddleware(checkpunishments),
    withMiddleware(addnote),
    withMiddleware(logrun),
    withMiddleware(logkey),
    withMiddleware(stats),
    withMiddleware(syncteam),
    withMiddleware(configquota),
    withMiddleware(configpoints),
    withMiddleware(configverification),
    withMiddleware(configrolepings),
    withMiddleware(help),
    withMiddleware(ping),
    withMiddleware(addquotapoints),
    withMiddleware(addpoints),
    withMiddleware(addrole),
    withMiddleware(kick),
    withMiddleware(ban),
    withMiddleware(unban),
    withMiddleware(softban),
    withMiddleware(mute),
    withMiddleware(unmute),
    withMiddleware(leaderboard),
    withMiddleware(purge),
    withMiddleware(modmail),
    withMiddleware(modmailreply),
    withMiddleware(modmailblacklist),
    withMiddleware(modmailunblacklist),
];

export function toJSON() {
    return commands.map(c => c.data.toJSON());
}


export async function registerAll(rest: REST, appId: string, guildId: string) {
    const body = toJSON();
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body });
    return body.map(c => c.name);
}
