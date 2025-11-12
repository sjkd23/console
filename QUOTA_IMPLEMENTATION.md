# Quota Logging System - Phase 1 Implementation (Enhanced)

## Summary

Implemented a minimal, future-proof quota logging system to track organizer run completions and security verifications. This system provides append-only quota event logging with idempotency guarantees, **per-dungeon tracking**, and **statistics viewing**. The system follows existing architectural patterns and enables future per-dungeon point customization.

## What Changed

### Database Layer
- **Migration 014_quota_events.sql**
  - New `quota_event` table for append-only quota logging
  - Columns: `id`, `guild_id`, `actor_user_id`, `action_type`, `subject_id`, `dungeon_key`, `points`, `created_at`
  - **NEW**: `dungeon_key` column for tracking specific dungeons (e.g., 'fungal', 'osanc')
  - Unique constraint on `(guild_id, subject_id)` for `run_completed` actions (prevents double-counting)
  - Indexes for efficient querying by guild, actor, action type, **dungeon**, and timestamp

### Backend Service Layer

- **backend/src/lib/quota.ts** (new)
  - `logQuotaEvent()`: Core function for logging quota events with idempotency and **dungeon tracking**
  - `getDefaultPoints()`: Returns default point values (run_completed=1, verify_member=1)
  - `isRunAlreadyLogged()`: Check if a run has already been logged (used by manual logging)
  - **NEW**: `getUserQuotaStats()`: Query user's total points, run counts, and per-dungeon breakdown
  - Handles duplicate detection via database constraint (returns null for no-ops)

### Backend Integration Points

#### 1. Run Completion Quota (backend/src/routes/runs.ts)

- **PATCH /runs/:id** endpoint updated
- When a run transitions to `status='ended'` (manual or auto-end):
  - Calls `logQuotaEvent()` for the run's organizer
  - **NEW**: Passes `dungeon_key` to track which dungeon was completed
  - Uses `subject_id = 'run:{runId}'` for idempotency
  - Awards 1 point (default)
  - Logs error but doesn't fail request if quota logging fails

#### 2. Verification Quota (backend/src/routes/raiders.ts)

- **POST /raiders/verify** endpoint updated
- After successful verification:
  - Calls `logQuotaEvent()` for the acting security member
  - Uses `subject_id = 'verify:{userId}'` for tracking
  - Awards 1 point (default)
  - Logs error but doesn't fail request if quota logging fails

#### 3. Manual Run Logging Endpoint (backend/src/routes/quota.ts - new)

- **POST /v1/quota/log-run** endpoint
- Body: `{ actorId, actorRoles, guildId, runId, amount? }`
- Authorization: Requires organizer role or higher
- Validates run exists and belongs to the guild
- **NEW**: Fetches `dungeon_key` from run and includes it in quota events
- Checks idempotency (prevents double-logging via `isRunAlreadyLogged()`)
- Supports logging multiple runs at once (1-10, default=1)
- First run uses `subject_id` for idempotency; additional runs logged without subject_id
- Returns: `{ logged, already_logged, total_points, organizer_id }`

#### 4. Statistics Endpoint (backend/src/routes/quota.ts - new)

- **GET /v1/quota/stats/:guild_id/:user_id** endpoint
- Returns comprehensive quota statistics:
  - `total_points`: Total points earned
  - `total_runs_organized`: Count of run completions
  - `total_verifications`: Count of verifications performed
  - `dungeons`: Array of per-dungeon stats `[{ dungeon_key, count, points }]`
- Sorted by total points descending, then count descending
- Public endpoint (no special authorization required)

### Bot Command Layer

#### /logrun Command (bot/src/commands/logrun.ts - new)

- **Purpose**: Manually log run completion quota if automatic logging was missed
- **Permission**: Requires organizer role
- **Options**:
  - `run_id` (required): The ID of the run to log
  - `amount` (optional): Number of runs to log (1-10, default=1)
- **Behavior**:
  - Validates user has organizer role via middleware
  - Calls backend `/quota/log-run` endpoint (which includes dungeon tracking)
  - Shows success embed with run ID, runs logged, points earned, and organizer
  - Shows clear error messages for common cases (already logged, not found, no permission)
- **Idempotency**: Will not double-count the same run_id

#### /stats Command (bot/src/commands/stats.ts - new)

- **Purpose**: View quota statistics for yourself or another member
- **Permission**: Public (anyone can view stats)
- **Options**:
  - `member` (optional): Member to view stats for (defaults to command invoker)
- **Behavior**:
  - Fetches stats from backend `/quota/stats/:guild_id/:user_id` endpoint
  - Displays embed with:
    - Total points, runs organized, verifications performed
    - Top 15 dungeons with completion counts and points
    - User's avatar as thumbnail
  - Maps dungeon keys to friendly names using bot's dungeon data
  - Handles legacy data (runs without dungeon tracking)
- **Display**: Shows clear, organized statistics with emojis and formatting

### Registration

- Added quota routes to backend server (backend/src/server.ts)
- Added logrun command to bot commands export (bot/src/commands/index.ts)
- **NEW**: Added stats command to bot commands export

## Technical Design

### Idempotency Strategy
- **Run Completion**: Database unique constraint on `(guild_id, subject_id)` where `action_type = 'run_completed'`
  - First log attempt succeeds, subsequent attempts return null (no-op)
  - Manual `/logrun` checks `isRunAlreadyLogged()` before attempting to log
- **Verifications**: No uniqueness constraint (each verification is unique)

### Point Values
- Hardcoded defaults in `getDefaultPoints()`:
  - `run_completed`: 1 point
  - `verify_member`: 1 point
- Design allows future per-guild overrides without schema changes

### Error Handling
- Quota logging failures are logged but don't fail the parent operation
- User-facing errors provide clear guidance (missing role, already logged, etc.)
- Follows existing error handling patterns (`Errors` helper, `BackendError` class)

### Authorization
- Reuses existing `hasInternalRole()` pattern
- Manual logging requires organizer role or higher
- Automatic logging (run end, verify) uses existing permissions

## Files Added/Modified

### New Files

- `backend/src/db/migrations/014_quota_events.sql`
- `backend/src/lib/quota.ts`
- `backend/src/routes/quota.ts`
- `bot/src/commands/logrun.ts`
- **NEW**: `bot/src/commands/stats.ts`

### Modified Files

- `backend/src/server.ts` - Registered quota routes
- `backend/src/routes/runs.ts` - Added quota logging on run end **with dungeon tracking**
- `backend/src/routes/raiders.ts` - Added quota logging on verification
- `bot/src/commands/index.ts` - Added logrun and **stats** commands
- **NEW**: `bot/src/lib/http.ts` - Added `getQuotaStats()` function

## Testing Checklist

### Automatic Quota Logging

- [ ] Create and end a run manually → Organizer gets 1 quota event **with dungeon_key**
- [ ] Create a run and let it auto-end → Organizer gets 1 quota event **with dungeon_key**
- [ ] End the same run multiple times → Only 1 quota event logged (idempotent)
- [ ] Verify a member → Security member gets 1 quota event
- [ ] Verify multiple different members → Multiple quota events logged
- **NEW**: [ ] Check database → `dungeon_key` column populated for run completions

### Manual Quota Logging (/logrun)

- [ ] Run `/logrun run_id:123` as organizer → Success, 1 run logged **with dungeon from run**
- [ ] Run `/logrun run_id:123` again → Error: "Already logged"
- [ ] Run `/logrun run_id:123 amount:3` → Success, 3 runs logged **all with same dungeon_key**
- [ ] Run `/logrun run_id:999` (non-existent) → Error: "Run not found"
- [ ] Run `/logrun` as non-organizer → Error: "Missing Organizer role"
- [ ] Run `/logrun run_id:456` where run 456 was auto-logged → Error: "Already logged"

### Statistics Viewing (/stats) - NEW

- [ ] Run `/stats` (self) → Shows your own quota statistics with dungeon breakdown
- [ ] Run `/stats member:@User` → Shows specified user's quota statistics
- [ ] User with no quota events → Shows 0 totals and empty dungeon list
- [ ] User with multiple dungeons → Top 15 dungeons shown, sorted by points
- [ ] Dungeon names displayed correctly → Maps dungeon_key to friendly names
- [ ] Legacy runs (no dungeon_key) → Handled gracefully in display

### Database Integrity

- [ ] Run migration 014 → Table and indexes created successfully **including dungeon_key column**
- [ ] Attempt to insert duplicate `(guild_id, subject_id)` for `run_completed` → Constraint prevents duplicate
- [ ] Query quota events by guild → Efficient retrieval with indexes
- **NEW**: [ ] Query quota events by dungeon → Efficient retrieval with dungeon index
- **NEW**: [ ] Per-dungeon statistics query → Returns accurate counts and points

### Edge Cases

- [ ] Run ends with error after DB update → Quota logging error is logged, request still succeeds
- [ ] Verification fails → No quota event logged
- [ ] Manual log with invalid guild/run combination → Validation error
- **NEW**: [ ] Run with NULL dungeon_key → System handles gracefully (shouldn't happen but safe)
- **NEW**: [ ] Stats for user in different guilds → Only shows stats for requested guild

## Future Enhancements (Not Implemented)

The system is designed to support future extensions without schema changes:

1. **Per-Guild Configuration** (`/configquota` command)
   - Override default point values per guild
   - Add new table: `guild_quota_config(guild_id, action_type, points)`

2. **Reporting & Leaderboards**
   - Query `quota_event` table grouped by actor and time period
   - Commands: `/quotastats`, `/leaderboard`

3. **Periodic Resets**
   - Add `quota_period` table to track reset cycles
   - Scheduled job to archive old events and start new periods

4. **Additional Action Types**
   - Easy to add new action types (e.g., `event_assistance`, `training_session`)
   - Just extend the CHECK constraint and add default points

## Compliance with Requirements

✅ **Minimal Changes**: Only touched necessary files; no over-engineering  
✅ **Idempotency**: Database constraints + checks prevent double-counting  
✅ **Existing Patterns**: Follows repo's auth, error handling, and logging styles  
✅ **Append-Only**: `quota_event` table is insert-only (no updates/deletes)  
✅ **Extensible**: Design supports future features without breaking changes  
✅ **Clear Feedback**: Commands provide user-friendly error messages  
✅ **Authorization**: Reuses existing role checks; no duplicate permission logic  
✅ **Non-Blocking**: Quota logging failures don't break parent operations  

## Migration Instructions

1. **Backend**: Run migration 014 to create `quota_event` table
   ```bash
   cd backend
   npm run migrate
   ```

2. **Deploy Backend**: New quota routes will be available at `/v1/quota/*`

3. **Deploy Bot**: Re-register commands to make `/logrun` available
   ```bash
   cd bot
   npm run register-commands
   ```

4. **Test**: Verify automatic logging works by creating and ending a run

## Notes

- Quota events are never deleted (append-only audit trail)
- Default points (1 per action) are hardcoded and can be overridden later
- The system is designed for extensibility without backward-incompatible changes
- No dashboards or reporting yet (by design - keep Phase 1 minimal)
