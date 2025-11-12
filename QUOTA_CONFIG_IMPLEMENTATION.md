# Quota Configuration System - Implementation Summary

## Overview
Implemented a comprehensive quota configuration system that allows guilds to track and manage quota requirements for different roles (e.g., organizers, security). The system supports per-role configuration, custom dungeon point values, and automatic leaderboard panels.

## Features Implemented

### 1. Database Schema (Migrations)
- **016_quota_config.sql**: Created `quota_role_config` table for per-guild, per-role quota settings
  - Stores required points, reset schedule (day, hour, minute)
  - References to Discord role IDs
  - Panel message ID for leaderboard tracking
- **016_quota_config.sql**: Created `quota_dungeon_override` table for custom dungeon point values
  - Per-role, per-dungeon point overrides
  - Defaults to 1 point if no override exists
- **017_add_quota_channel.sql**: Added 'quota' channel to channel catalog

### 2. Backend Implementation

#### Library Functions (backend/src/lib/quota.ts)
- `getQuotaRoleConfig()`: Fetch quota config for a specific role
- `getAllQuotaRoleConfigs()`: Get all configs for a guild
- `upsertQuotaRoleConfig()`: Create or update role quota configuration
- `getDungeonOverrides()`: Get dungeon point overrides for a role
- `setDungeonOverride()`: Set custom point value for a dungeon
- `deleteDungeonOverride()`: Remove override (revert to default)
- `getQuotaPeriodStart()`: Calculate current quota period start time
- `getQuotaPeriodEnd()`: Calculate next reset time
- `getQuotaLeaderboard()`: Fetch leaderboard for a role in current period
- `getQuotaStatsForRole()`: Get stats for all members with a role

#### API Routes (backend/src/routes/quota.ts)
- `GET /quota/config/:guild_id/:role_id`: Get config for a role
- `GET /quota/configs/:guild_id`: Get all configs for a guild
- `PUT /quota/config/:guild_id/:role_id`: Update role configuration
- `PUT /quota/config/:guild_id/:role_id/dungeon/:dungeon_key`: Set dungeon override
- `DELETE /quota/config/:guild_id/:role_id/dungeon/:dungeon_key`: Remove dungeon override
- `POST /quota/leaderboard/:guild_id/:role_id`: Get leaderboard data

### 3. Bot Implementation

#### Commands
- **`/configquota role:<role>`**: Main command to configure quota settings
  - Opens interactive panel showing current configuration
  - Provides buttons to modify settings
  - Restricted to Administrator permission

#### Interactive Panels
**Basic Configuration Modal** (`quota_config_basic` button):
- Set required points per period
- Configure reset day (0=Sunday, 6=Saturday)
- Set reset hour (0-23, UTC)
- Set reset minute (0-59)

**Dungeon Configuration** (`quota_config_dungeons` button):
- Select menu showing all available dungeons
- Shows current point values (with ⭐ for custom overrides)
- Modal to set custom point values per dungeon
- Set to 0 to remove override

**Panel Refresh** (`quota_refresh_panel` button):
- Updates the leaderboard panel in the quota channel
- Shows top 25 members
- Displays who has met quota (✅)
- Shows period timing and stats

#### Leaderboard Panel System (bot/src/lib/quota-panel.ts)
- `updateQuotaPanel()`: Update or create leaderboard panel
- Automatically posts to configured quota channel
- Shows:
  - Required points
  - Reset schedule
  - Current period timeframe
  - Top 25 members with points and run counts
  - Visual indicators for quota completion
  - Stats on how many members met quota

### 4. Channel Configuration
- Extended `/setchannels` command with new `quota` channel option
- Leaderboard panels post to this channel
- Updated backend channel validation to include 'quota'

### 5. HTTP Client Functions (bot/src/lib/http.ts)
- `getQuotaRoleConfig()`: Fetch role config
- `updateQuotaRoleConfig()`: Update configuration
- `setDungeonOverride()`: Set custom dungeon points
- `deleteDungeonOverride()`: Remove custom dungeon points
- `getQuotaLeaderboard()`: Fetch leaderboard data

## Usage Flow

1. **Initial Setup**:
   ```
   /setchannels quota:#quota-channel
   /configquota role:@Organizer
   ```

2. **Configure Basic Settings**:
   - Click "Set Basic Config" button
   - Enter required points (e.g., 10)
   - Set reset day (e.g., 1 for Monday)
   - Set reset time (e.g., 00:00 UTC)

3. **Configure Dungeon Points** (Optional):
   - Click "Configure Dungeons" button
   - Select a dungeon from dropdown
   - Set custom point value (e.g., 2 points for Shatters)
   - Set to 0 to remove override

4. **Update Leaderboard Panel**:
   - Click "Update Panel" button
   - Panel posts/updates in quota channel
   - Shows current standings

5. **Automatic Tracking**:
   - Points are automatically tracked when runs are logged
   - Leaderboard shows current period stats
   - Resets automatically on configured schedule

## Key Design Decisions

1. **Per-Role Configuration**: Each role can have its own quota requirements and dungeon point values
2. **Flexible Reset Schedule**: UTC-based scheduling with day-of-week and time configuration
3. **Default Values**: All dungeons default to 1 point, overrides are optional
4. **Interactive UI**: Modal-based configuration for better UX
5. **Real-time Updates**: Panel refresh system allows manual updates
6. **Top 25 Limit**: Discord embed field limits, shows most relevant data
7. **Period-Based Tracking**: All stats calculated based on current quota period

## Future Enhancements (Not Yet Implemented)

1. **Automatic Panel Updates**: Periodic background task to refresh panels
2. **Notification System**: Alert members approaching/missing quota
3. **Historical Tracking**: View past quota periods
4. **Multi-Page Dungeons**: Support for configuring more than 25 dungeons
5. **Role Hierarchy**: Different point requirements for different rank tiers
6. **Quota Rewards**: Automatic role assignments for meeting quota

## Files Created/Modified

### Created:
- `backend/src/db/migrations/016_quota_config.sql`
- `backend/src/db/migrations/017_add_quota_channel.sql`
- `bot/src/commands/configquota.ts`
- `bot/src/interactions/buttons/quota-config.ts`
- `bot/src/lib/quota-panel.ts`

### Modified:
- `backend/src/lib/quota.ts` - Added config management functions
- `backend/src/routes/quota.ts` - Added config and leaderboard routes
- `backend/src/routes/guilds.ts` - Added 'quota' to CHANNEL_KEYS
- `bot/src/commands/setchannels.ts` - Added quota channel option
- `bot/src/commands/index.ts` - Registered configquota command
- `bot/src/lib/http.ts` - Added quota config HTTP functions
- `bot/src/index.ts` - Added quota interaction handlers

## Testing Checklist

- [ ] Run database migrations (016, 017)
- [ ] Test `/setchannels quota:#channel`
- [ ] Test `/configquota role:@Role` command
- [ ] Test basic configuration modal
- [ ] Test dungeon configuration
- [ ] Test panel refresh
- [ ] Verify leaderboard shows correct data
- [ ] Test with multiple roles
- [ ] Test dungeon overrides
- [ ] Test period calculation
- [ ] Test permission restrictions
