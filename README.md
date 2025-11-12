# ROTMG Raid Bot - Complete Documentation

A comprehensive Discord bot system for organizing and managing Realm of the Mad God (ROTMG) dungeon raids. Built with Discord.js (bot) and Fastify (backend API), backed by PostgreSQL, featuring role-based permissions, punishment tracking, raider verification, and automated run management.

---

## 📂 Complete File Tree

```
rotmg-raid-bot/
├── README.md                          # Original README (this file should be replaced)
├── MIGRATION_GUIDE.md                 # Guide for punishment ID migration
├── docker-compose.yml                 # Docker orchestration (db, backend, bot)
│
├── backend/                           # Fastify REST API
│   ├── Dockerfile.dev                 # Development Docker image
│   ├── package.json                   # Backend dependencies
│   ├── tsconfig.json                  # TypeScript configuration
│   └── src/
│       ├── server.ts                  # ✅ Main Fastify server entrypoint
│       │
│       ├── db/
│       │   ├── pool.ts                # ✅ PostgreSQL connection pool
│       │   └── migrations/            # Database schema migrations
│       │       ├── 001_init.sql       # Initial schema (guilds, members, raiders, runs, reactions, audit)
│       │       ├── 002_contract_safety.sql  # Data integrity constraints & indexes
│       │       ├── 003_remove_cap.sql       # Remove raider cap
│       │       ├── 004_add_party_location.sql # Add party/location fields
│       │       ├── 005_key_window.sql       # Add key window timing
│       │       ├── 006_update_status_constraint.sql # Add 'live' status
│       │       ├── 007_add_raider_ign.sql   # Add IGN field to raiders
│       │       ├── 008_guild_roles.sql      # Guild role mappings
│       │       ├── 009_guild_channels.sql   # Guild channel mappings
│       │       ├── 010_punishments.sql      # Punishment system (warns/suspensions)
│       │       ├── 011_migrate_punishment_ids.sql # Migrate old punishment IDs to hex
│       │       └── 012_auto_end_duration.sql # Add auto-end timing for runs
│       │
│       ├── lib/
│       │   ├── authorization.ts       # ✅ Role-based authorization checks
│       │   ├── constants.ts           # ✅ Shared types & Zod schemas (RunStatus, ReactionState, Snowflake)
│       │   └── errors.ts              # ✅ Unified error response helpers
│       │
│       ├── plugins/
│       │   └── auth.ts                # ✅ API key authentication middleware
│       │
│       ├── routes/
│       │   ├── health.ts              # ✅ Public health check endpoint
│       │   ├── runs.ts                # ✅ CRUD for runs & reactions (create, join, class, status, delete)
│       │   ├── guilds.ts              # ✅ Guild role/channel configuration
│       │   ├── punishments.ts         # ✅ Warning & suspension management
│       │   └── raiders.ts             # ✅ Raider verification & IGN management
│       │
│       └── scripts/
│           └── migrate.ts             # ✅ Database migration runner
│
└── bot/                               # Discord.js Bot
    ├── Dockerfile.dev                 # Development Docker image
    ├── package.json                   # Bot dependencies
    ├── tsconfig.json                  # TypeScript configuration
    └── src/
        ├── index.ts                   # ✅ Bot client initialization & event handlers
        ├── register-commands.ts       # ✅ Registers slash commands to Discord API
        │
        ├── commands/                  # Slash commands
        │   ├── _types.ts              # TypeScript types for slash commands
        │   ├── index.ts               # Command registry & registration helper
        │   ├── ping.ts                # ✅ Simple latency test command
        │   ├── info.ts                # ✅ Display guild/user/channel context
        │   ├── run.ts                 # ✅ Create raid with dungeon autocomplete
        │   ├── verify.ts              # ✅ Manually verify members (Security role)
        │   ├── unverify.ts            # ✅ Remove verification from members
        │   ├── editname.ts            # ✅ Update verified member's IGN
        │   ├── warn.ts                # ✅ Issue warnings (Moderator role)
        │   ├── suspend.ts             # ✅ Suspend members with duration (Moderator role)
        │   ├── unsuspend.ts           # ✅ Remove suspensions early (Moderator role)
        │   ├── removepunishment.ts    # ✅ Remove any punishment by ID (Moderator role)
        │   ├── checkpunishments.ts    # ✅ View all punishments for a user (Moderator role)
        │   ├── setroles.ts            # ✅ Configure guild role mappings (Admin only)
        │   └── setchannels.ts         # ✅ Configure guild channel mappings (Admin only)
        │
        ├── constants/                 # Dungeon data & game constants
        │   ├── classes.ts             # ✅ ROTMG character classes
        │   ├── dungeon-types.ts       # ✅ TypeScript interfaces for dungeon data
        │   ├── dungeon-helpers.ts     # ✅ Search & lookup utilities for dungeons
        │   └── DungeonData.ts         # ✅ 50+ ROTMG dungeon definitions (portals, emojis, colors)
        │
        ├── interactions/              # Button & select menu handlers
        │   └── buttons/
        │       ├── join.ts            # ✅ Handle "Join" button → post reaction to backend
        │       ├── class-selection.ts # ✅ Handle class selection UI & backend update
        │       ├── key-window.ts      # ✅ Handle "Pop Keys" button during live runs
        │       ├── organizer-panel.ts # ✅ Show organizer-only controls (Start/End/Pop Keys)
        │       └── run-status.ts      # ✅ Handle Start/End buttons → update backend & UI
        │
        └── lib/                       # Shared utilities
            ├── http.ts                # ✅ Backend HTTP client with unified error handling
            ├── permissions.ts         # ✅ Role hierarchy & permission checks
            ├── pagination.ts          # ✅ Paginated embed builder for long lists
            ├── dungeon-cache.ts       # ✅ Track recently used dungeons per guild
            ├── run-auto-end.ts        # ✅ Automatic run expiration task (5-min intervals)
            └── suspension-cleanup.ts  # ✅ Automatic suspension expiration task (1-min intervals)
```

---

## 🎯 What We Currently Have

### Backend API (Fastify)

#### **Database Schema**
- ✅ **guild**: Guild metadata (id, name)
- ✅ **member**: User metadata (id, username)
- ✅ **raider**: Verified raiders with IGN and status (pending/approved/rejected/banned)
- ✅ **run**: Active raids with organizer, dungeon, status (open/live/ended), timestamps, auto-end duration
- ✅ **reaction**: User participation (join/bench/leave) with optional class selection
- ✅ **audit**: Comprehensive audit log for all actions (guild config, verifications, punishments)
- ✅ **guild_role**: Maps internal role keys (organizer, security, moderator, etc.) to Discord role IDs
- ✅ **guild_channel**: Maps internal channel keys (raid, veri_log, punishment_log, etc.) to Discord channel IDs
- ✅ **punishment**: Warning & suspension tracking with expiration, removal tracking, and status

#### **API Endpoints**

**Health & Info**
- `GET /v1/health` - Public health check

**Runs**
- `POST /v1/runs` - Create new run (organizer role required)
- `GET /v1/runs/:id` - Get run details
- `PATCH /v1/runs/:id` - Update run status (open→live→ended)
- `DELETE /v1/runs/:id` - Cancel/delete run (organizer only)
- `POST /v1/runs/:id/message` - Link Discord message ID to run
- `POST /v1/runs/:id/reactions` - Add/update/remove reaction (join/bench/leave)
- `PATCH /v1/runs/:id/reactions` - Update class selection
- `GET /v1/runs/:id/classes` - Get class distribution for run
- `PATCH /v1/runs/:id/key-window` - Open key window with countdown
- `GET /v1/runs/expired` - Get runs that need auto-ending

**Raiders (Verification)**
- `GET /v1/raiders/:guild_id/:user_id` - Get raider info
- `POST /v1/raiders/verify` - Verify member with IGN (security role required)
- `PATCH /v1/raiders/:user_id/ign` - Update verified member's IGN (security role required)
- `PATCH /v1/raiders/:user_id/status` - Update raider status (security role required)

**Punishments**
- `POST /v1/punishments` - Create warning or suspension (moderator role required)
- `GET /v1/punishments/:id` - Get punishment details
- `GET /v1/punishments/user/:guild_id/:user_id` - Get all punishments for user
- `GET /v1/punishments/expired` - Get expired suspensions needing role removal
- `POST /v1/punishments/:id/expire` - Mark suspension as expired (processed by bot)
- `DELETE /v1/punishments/:id` - Remove/deactivate punishment (moderator role required)

**Guild Configuration**
- `GET /v1/guilds/:guild_id/roles` - Get current role mappings
- `PUT /v1/guilds/:guild_id/roles` - Update role mappings (admin role or Discord admin required)
- `GET /v1/guilds/:guild_id/channels` - Get current channel mappings
- `PUT /v1/guilds/:guild_id/channels` - Update channel mappings (admin role or Discord admin required)

#### **Authorization System**
- ✅ Role-based permissions using guild_role mappings
- ✅ Internal roles: administrator, moderator, head_organizer, officer, security, organizer, verified_raider, suspended
- ✅ Hierarchical authorization checks
- ✅ Supports Discord Administrator permission override for guild config

### Bot (Discord.js)

#### **Slash Commands**

**General**
- ✅ `/ping` - Check bot latency
- ✅ `/info` - Display guild/user/channel information

**Raid Management**
- ✅ `/run` - Create new raid with dungeon autocomplete
  - Shows recently used dungeons when no search query
  - Party/location optional parameters
  - Description field for organizer notes
  - Auto-end after 2 hours (configurable in code)

**Verification System** (Security role required)
- ✅ `/verify` - Manually verify member with their ROTMG IGN
  - Checks for IGN conflicts (one IGN per member)
  - Sets member nickname to IGN
  - Assigns verified_raider role
  - Logs to veri_log channel
  - Role hierarchy checks to prevent abuse
- ✅ `/unverify` - Remove verification status from member
- ✅ `/editname` - Update verified member's IGN

**Moderation System** (Moderator role required)
- ✅ `/warn` - Issue warning to member with reason
- ✅ `/suspend` - Suspend member with duration (auto-expires)
  - Duration in days/hours/minutes
  - Assigns suspended role automatically
  - Can extend existing suspensions
  - Automatic role removal on expiration
- ✅ `/unsuspend` - Remove active suspension early
- ✅ `/removepunishment` - Remove any punishment by ID
- ✅ `/checkpunishments` - View all punishments for a user (paginated)

**Configuration** (Administrator role or Discord Admin permission required)
- ✅ `/setroles` - Configure guild role mappings
  - Maps internal roles to Discord roles
  - Required for permission system to work
  - Supports 8 internal roles
- ✅ `/setchannels` - Configure guild channel mappings
  - Maps internal channels to Discord channels
  - Used for logging (veri_log, punishment_log, raid_log)

#### **Interactive UI**

**Run Embeds**
- ✅ Dynamic embed updates based on run status
- ✅ Raider count display
- ✅ Class distribution display (formatted intelligently)
- ✅ Status indicators (Starting/Live/Ended)
- ✅ Dungeon thumbnails and colors

**Button Interactions**
- ✅ "Join" - Join a run (adds reaction, updates embed)
- ✅ "Class" - Select character class via dropdown menu
- ✅ "Organizer Panel" - Opens ephemeral panel with controls
  - "Start" - Transitions run from open → live
  - "Pop Keys" - Opens 30-second key window
  - "End" - Ends run and removes buttons

**Permission Checks**
- ✅ Organizer panel restricted to run organizer or users with organizer role
- ✅ Role hierarchy enforcement (can't target someone with equal/higher role)
- ✅ Bot role position checks (can't manage users above bot's role)

#### **Automated Tasks**

**Run Auto-End** (runs every 5 minutes)
- ✅ Checks for runs exceeding auto_end_minutes
- ✅ Automatically ends expired runs
- ✅ Updates Discord embeds to show auto-ended status
- ✅ Removes interaction buttons

**Suspension Cleanup** (runs every 1 minute)
- ✅ Checks for expired suspensions
- ✅ Removes suspended role automatically
- ✅ Logs expiration to punishment_log channel
- ✅ Marks suspensions as processed in database

#### **Advanced Features**

**Dungeon Autocomplete**
- ✅ Fuzzy search across 50+ ROTMG dungeons
- ✅ Shows recently used dungeons for the guild when search is empty
- ✅ Intelligent caching per guild

**Audit Logging**
- ✅ All actions logged to database with actor, action, subject, and metadata
- ✅ Discord channel logging for verifications and punishments
- ✅ Tracks before/after state for config changes

**Error Handling**
- ✅ User-friendly error messages with actionable guidance
- ✅ Explains missing role configurations
- ✅ Handles IGN conflicts gracefully
- ✅ Graceful degradation when optional features fail

---

## ⚙️ Technical Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Bot | Discord.js | ^14.16.3 | Discord bot framework |
| Backend | Fastify | ^4.28.1 | REST API server |
| Database | PostgreSQL | 14+ | Data persistence |
| Language | TypeScript | ^5.6.3 | Type-safe development |
| Runtime | Node.js | 18+ (ES2022) | Execution environment |
| Validation | Zod | ^3.23.8 | Schema validation |
| Containerization | Docker Compose | 3.9 | Development environment |

---

## 🚀 Setup & Deployment

### Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd rotmg-raid-bot
   ```

2. **Configure environment variables**
   
   Create `backend/.env`:
   ```env
   PORT=4000
   BACKEND_API_KEY=your_secret_key_here
   DATABASE_URL=postgres://postgres:postgres@db:5432/rotmg_raids
   ```

   Create `bot/.env`:
   ```env
   APPLICATION_ID=your_discord_app_id
   SECRET_KEY=your_discord_bot_token
   DISCORD_DEV_GUILD_ID=your_test_server_id
   BACKEND_URL=http://backend:4000/v1
   BACKEND_API_KEY=your_secret_key_here  # must match backend
   ```

3. **Start all services**
   ```bash
   docker-compose up -d
   ```

   This will:
   - Start PostgreSQL database on port 5469
   - Run migrations automatically
   - Start backend API on port 4000
   - Start bot and register commands

4. **Verify everything is running**
   ```bash
   docker-compose ps
   docker-compose logs -f bot
   ```

### Manual Setup (Without Docker)

#### Backend

1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment** (create `backend/.env`)
   ```env
   PORT=4000
   BACKEND_API_KEY=your_secret_key_here
   DATABASE_URL=postgresql://user:password@localhost:5432/rotmg_raids
   ```

3. **Run migrations**
   ```bash
   npm run migrate
   ```

4. **Start server**
   ```bash
   npm run dev    # Development with hot reload
   npm run build && npm start  # Production
   ```

#### Bot

1. **Install dependencies**
   ```bash
   cd bot
   npm install
   ```

2. **Configure environment** (create `bot/.env`)
   ```env
   APPLICATION_ID=your_discord_app_id
   SECRET_KEY=your_discord_bot_token
   DISCORD_DEV_GUILD_ID=your_test_server_id
   BACKEND_URL=http://localhost:4000/v1
   BACKEND_API_KEY=your_secret_key_here
   ```

3. **Register slash commands**
   ```bash
   npm run register
   ```

4. **Start bot**
   ```bash
   npm run dev    # Development with hot reload
   npm run build && npm start  # Production
   ```

---

## 📋 Initial Configuration in Discord

After deploying the bot, follow these steps in your Discord server:

### 1. Configure Roles (Required)

Run `/setroles` to map your Discord roles to internal bot roles:

```
/setroles
  administrator: @Admin         # Can configure bot settings
  moderator: @Moderator         # Can issue punishments
  security: @Security           # Can verify raiders
  organizer: @Raid Leader       # Can create and manage runs
  verified_raider: @Verified    # Auto-assigned on verification
  suspended: @Suspended         # Auto-assigned on suspension
```

**Important:** At minimum, configure `organizer`, `security`, and `verified_raider` for core functionality.

### 2. Configure Channels (Optional but Recommended)

Run `/setchannels` to set up logging channels:

```
/setchannels
  veri_log: #verification-log         # Logs all verifications
  punishment_log: #moderation-log     # Logs all punishments
  raid: #raids                        # Where runs are posted
```

### 3. Verify Setup

1. Test creating a run: `/run dungeon:Shatters`
2. Test verification: `/verify member:@User ign:PlayerName`
3. Check that logs appear in configured channels

---

## 🎮 Usage Examples

### Creating a Raid

```
/run dungeon:Shatters party:Nexus2 location:USEast
```

The bot will:
1. Create a database record
2. Post an embed with Join/Class/Organizer Panel buttons
3. Track reactions and class selections
4. Allow organizer to Start → End the run
5. Auto-end after 2 hours if not manually ended

### Verifying a Raider

```
/verify member:@NewPlayer ign:ProPlayer123
```

The bot will:
1. Check your Security role
2. Check for IGN conflicts
3. Update database with IGN and verified status
4. Set member's nickname to IGN
5. Assign verified_raider role
6. Log to veri_log channel

### Issuing a Suspension

```
/suspend member:@BadPlayer duration_days:3 reason:Repeated rule violations
```

The bot will:
1. Check your Moderator role
2. Create punishment record
3. Assign suspended role
4. Log to punishment_log channel
5. Automatically remove role after 3 days

### Checking Punishments

```
/checkpunishments member:@Player
```

Shows paginated list of all punishments for the user (active and removed).

---

## 🐛 Known Issues & Limitations

### Current Limitations

1. **No Bench/Leave Buttons**: UI only shows "Join" button. Backend supports bench/leave states, but not exposed in UI.

2. **No Reaction List Command**: Can't view who joined a run except by counting.

3. **No Run History**: Past runs aren't queryable via commands.

4. **Single-Guild Testing**: Primarily tested in one server; multi-guild scenarios may have edge cases.

5. **No Voice Integration**: No automated voice channel creation or management.

6. **Fixed Auto-End Duration**: 2-hour auto-end is hardcoded in `/run` command, not configurable per-guild.

### Known Bugs

1. **Punishment ID Migration Required**: Old numeric punishment IDs need migration (see MIGRATION_GUIDE.md).

2. **Class Button Label**: Button says "Class" but opens dropdown - could be clearer.

3. **No Validation on Startup**: Missing environment variables cause runtime errors instead of failing fast.

---

## 🔧 Issues to Fix

### High Priority Fixes

1. **Environment Variable Validation**
   - **Problem**: Bot/backend crash at runtime if env vars are missing
   - **Solution**: Add startup validation using Zod schemas
   - **Files**: `backend/src/server.ts`, `bot/src/index.ts`

2. **Logging System**
   - **Problem**: Using basic `console.log`, hard to debug production issues
   - **Solution**: Implement structured logging (pino or winston)
   - **Benefit**: Better debugging, log levels, formatting

3. **Error Recovery in Tasks**
   - **Problem**: Auto-end and suspension cleanup tasks may crash on errors
   - **Solution**: Add comprehensive try-catch with error logging
   - **Files**: `bot/src/lib/run-auto-end.ts`, `bot/src/lib/suspension-cleanup.ts`

4. **Race Conditions in Run Status**
   - **Problem**: Multiple organizers could click Start/End simultaneously
   - **Solution**: Add optimistic locking or transaction-level checks
   - **Files**: `backend/src/routes/runs.ts`

### Medium Priority Fixes

5. **Bot Role Position Checks**
   - **Problem**: Bot tries to manage users above its role, causes 403s
   - **Solution**: Add role hierarchy check before all role operations
   - **Files**: All command files that modify roles

6. **Orphaned Runs**
   - **Problem**: If channel/guild is deleted, runs remain in database
   - **Solution**: Add cleanup task to detect and archive orphaned runs

7. **Duplicate IGN Check Case Sensitivity**
   - **Problem**: "PlayerName" and "playername" are treated as different
   - **Solution**: Already using LOWER() in queries - verify consistency
   - **Files**: `backend/src/routes/raiders.ts`

8. **No Retry Logic for Backend Calls**
   - **Problem**: Temporary network issues cause command failures
   - **Solution**: Add retry logic with exponential backoff
   - **Files**: `bot/src/lib/http.ts`

### Low Priority Fixes

9. **No Rate Limiting**
   - **Problem**: No protection against API abuse
   - **Solution**: Add Fastify rate limiting plugin
   - **Files**: `backend/src/server.ts`

10. **No Database Connection Pooling Limits**
    - **Problem**: Could exhaust connections under heavy load
    - **Solution**: Configure proper pool sizes in pool.ts
    - **Files**: `backend/src/db/pool.ts`

---

## ⚡ Optimization Opportunities

### Performance

1. **Database Indexes**
   - **Current**: Basic indexes on foreign keys
   - **Optimize**: Add composite indexes for common queries
   - **Example**: `(guild_id, status)` on `run` table
   - **Impact**: Faster run queries for active raids

2. **Caching Layer**
   - **Current**: No caching
   - **Optimize**: Add Redis for guild role/channel mappings
   - **Impact**: Reduce DB queries for every permission check
   - **Files**: New `backend/src/lib/cache.ts`

3. **Batch Operations**
   - **Current**: Auto-end processes runs one-by-one
   - **Optimize**: Batch status updates in single transaction
   - **Impact**: Faster cleanup tasks, reduced DB load

4. **Webhook Logging**
   - **Current**: Bot fetches channels and sends messages
   - **Optimize**: Use webhooks for audit logs
   - **Impact**: Faster, no rate limit concerns

### Code Quality

5. **Reduce Code Duplication**
   - **Problem**: Permission checks duplicated in every command
   - **Solution**: Create command middleware/decorators
   - **Files**: Create `bot/src/lib/command-decorators.ts`

6. **Extract Common Embed Builders**
   - **Problem**: Embed building logic scattered across files
   - **Solution**: Create reusable embed builder utilities
   - **Files**: Create `bot/src/lib/embed-builders.ts`

7. **Consolidate HTTP Client**
   - **Problem**: Some error handling inconsistent
   - **Solution**: Centralize all backend calls through http.ts
   - **Impact**: Consistent error handling across all commands

8. **Type Safety Improvements**
   - **Current**: Some `any` types in error handling
   - **Solution**: Create proper error type hierarchy
   - **Files**: `bot/src/lib/http.ts`, `backend/src/lib/errors.ts`

### Database

9. **Audit Table Pruning**
   - **Problem**: Audit table will grow indefinitely
   - **Solution**: Add archival strategy (move old logs to cold storage)
   - **Impact**: Faster queries, manageable storage

10. **Soft Deletes for Runs**
    - **Current**: Runs stay in DB forever
    - **Optimize**: Add `deleted_at` column, filter in queries
    - **Impact**: Cleaner data, better analytics

---

## 🚦 Next Steps for Feature Development

### Phase 1: Complete Core Features (Essential)

1. **Add Bench/Leave Buttons**
   - Add buttons to run embeds
   - Update handlers to call backend with state='bench' or state='leave'
   - Update embed to show "Bench: X" count
   - **Files**: `bot/src/commands/run.ts`, `bot/src/interactions/buttons/join.ts`

2. **Reaction List Command**
   - **Command**: `/viewrun runid:123`
   - Show who joined, who's benched, class distribution
   - Paginated embed for large runs
   - **Files**: New `bot/src/commands/viewrun.ts`, `backend/src/routes/runs.ts` (add GET /runs/:id/reactions)

3. **Run Cancellation UI**
   - Add "Cancel" button to organizer panel
   - Update embed to show "Cancelled" status
   - Prevent further reactions
   - **Files**: `bot/src/interactions/buttons/organizer-panel.ts`, already implemented in backend

4. **Environment Validation**
   - Validate all env vars on startup
   - Fail fast with clear error messages
   - List missing/invalid variables
   - **Files**: `backend/src/server.ts`, `bot/src/index.ts`

### Phase 2: Enhanced User Experience (High Value)

5. **Run History Command**
   - **Command**: `/runhistory [member] [dungeon] [days]`
   - Show past runs, success rate, most organized dungeons
   - Analytics for guilds
   - **Backend**: Add GET /runs endpoint with filters
   - **Files**: New `bot/src/commands/runhistory.ts`

6. **Leaderboards**
   - **Command**: `/leaderboard type:[organizers|raiders|dungeons]`
   - Show top organizers by run count
   - Show most active raiders
   - Show most popular dungeons
   - **Backend**: Add analytics queries
   - **Files**: New `bot/src/commands/leaderboard.ts`

7. **Direct Message Notifications**
   - DM users when run starts
   - DM users when run ends
   - Allow users to opt-in/opt-out
   - **Backend**: Add user preferences table
   - **Files**: `bot/src/interactions/buttons/run-status.ts`

8. **Enhanced Class System**
   - Validate class selection against dungeon requirements
   - Show "needed classes" in embed
   - Alert organizer when all required classes filled
   - **Files**: Use existing `keyReactions`/`otherReactions` in `bot/src/constants/DungeonData.ts`

### Phase 3: Advanced Features (Nice to Have)

9. **Afk Check System**
   - **Command**: `/afkcheck`
   - React-to-join system
   - Move non-reactors to bench
   - Configurable timeout
   - **Backend**: Add afk_check table
   - **Files**: New `bot/src/commands/afkcheck.ts`

10. **Multi-Run Support**
    - Allow organizer to create run chains (Fungal → Crystal → Nest)
    - Auto-progress to next run on completion
    - **Backend**: Add run_chain table
    - **Files**: Extend `bot/src/commands/run.ts`

11. **Voice Channel Integration**
    - Auto-create voice channel on run start
    - Auto-delete on run end
    - Move joined users to voice channel
    - **Files**: `bot/src/interactions/buttons/run-status.ts`

12. **Custom Dungeon Management**
    - **Commands**: `/adddungeon`, `/editdungeon`, `/removedungeon`
    - Guild-specific custom dungeons
    - **Backend**: Add custom_dungeon table
    - **Files**: New `bot/src/commands/dungeon-*.ts`

### Phase 4: Administration & Analytics (Power Features)

13. **Enhanced Audit Viewer**
    - **Command**: `/audit [action] [user] [days]`
    - Search audit logs from Discord
    - Export to CSV
    - **Backend**: Add search endpoint for audit table
    - **Files**: New `bot/src/commands/audit.ts`

14. **Backup/Export System**
    - Export all guild data to JSON
    - Import from backup
    - Scheduled auto-backups
    - **Backend**: Add export endpoints
    - **Files**: New `backend/src/routes/export.ts`

15. **Dashboard Web UI**
    - Web interface for guild stats
    - Visual charts for run history
    - User management interface
    - **Tech**: Next.js + same backend API
    - **Files**: New `dashboard/` directory

16. **Integration with ROTMG APIs**
    - Verify IGNs against RealmEye
    - Import character stats
    - Track in-game achievements
    - **Backend**: Add external API client
    - **Files**: New `backend/src/lib/realmeye.ts`

---

## 📊 Database Schema Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   guild     │         │    member    │         │   raider    │
├─────────────┤         ├──────────────┤         ├─────────────┤
│ id (PK)     │────┐    │ id (PK)      │────┐    │ guild_id    │◄──┐
│ name        │    │    │ username     │    │    │ user_id     │   │
│ created_at  │    │    │ created_at   │    │    │ ign         │   │
└─────────────┘    │    └──────────────┘    │    │ status      │   │
                   │                        │    │ verified_at │   │
┌─────────────┐    │    ┌──────────────┐    │    │ created_at  │   │
│ guild_role  │    │    │guild_channel │    │    └─────────────┘   │
├─────────────┤    │    ├──────────────┤    │            ▲         │
│ guild_id    │◄───┘    │ guild_id     │◄───┘            │         │
│ role_key    │         │ channel_key  │                 │         │
│discord_role │         │discord_chan  │                 │         │
└─────────────┘         └──────────────┘                 │         │
                                                         │         │
                   ┌─────────────────────────────────────┘         │
                   │                                               │
                   ▼                                               │
┌─────────────────────────────────────────────┐                   │
│                 run                         │                   │
├─────────────────────────────────────────────┤                   │
│ id (PK)                                     │                   │
│ guild_id (FK) ──────────────────────────────┼───────────────────┘
│ organizer_id (FK) ──────────────────────────┼───────────────────┐
│ dungeon_key                                 │                   │
│ dungeon_label                               │                   │
│ description, party, location                │                   │
│ status (open/live/ended)                    │                   │
│ channel_id, post_message_id                 │                   │
│ auto_end_minutes                            │                   │
│ key_window_ends_at                          │                   │
│ created_at, started_at, ended_at            │                   │
└─────────────────────────────────────────────┘                   │
                   │                                               │
                   │                                               │
                   ▼                                               │
┌─────────────────────────────────────────────┐                   │
│              reaction                       │                   │
├─────────────────────────────────────────────┤                   │
│ run_id (FK, PK)                             │                   │
│ user_id (FK, PK)                            │                   │
│ state (join/bench/leave)                    │                   │
│ class (optional)                            │                   │
│ updated_at                                  │                   │
└─────────────────────────────────────────────┘                   │
                                                                  │
┌─────────────────────────────────────────────┐                   │
│              punishment                     │                   │
├─────────────────────────────────────────────┤                   │
│ id (PK, 24-char hex)                        │                   │
│ guild_id (FK)                               │                   │
│ user_id (FK)                                │                   │
│ moderator_id (FK) ──────────────────────────┼───────────────────┘
│ type (warn/suspend)                         │
│ reason                                      │
│ expires_at (nullable)                       │
│ active                                      │
│ removed_at, removed_by, removal_reason      │
│ created_at                                  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│                audit                        │
├─────────────────────────────────────────────┤
│ id (PK)                                     │
│ guild_id (FK, nullable)                     │
│ actor_id (FK, nullable)                     │
│ action                                      │
│ subject                                     │
│ meta (JSONB)                                │
│ created_at                                  │
└─────────────────────────────────────────────┘
```

---

## 🧪 Testing Strategy (Not Yet Implemented)

### Recommended Testing Approach

1. **Unit Tests**
   - Test Zod schemas validation
   - Test authorization helpers
   - Test dungeon search/filter logic
   - **Tool**: Vitest or Jest

2. **Integration Tests**
   - Test backend API endpoints
   - Test database migrations
   - Test permission checks end-to-end
   - **Tool**: Supertest + test database

3. **E2E Tests**
   - Test Discord command flows
   - Test button interactions
   - Test punishment lifecycle
   - **Tool**: Discord.js test utilities

4. **Load Testing**
   - Test concurrent run creation
   - Test mass user reactions
   - Test auto-end task under load
   - **Tool**: k6 or Artillery

---

## 📝 Contributing Guidelines (Template)

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Run linting (`npm run lint`)
6. Commit with clear messages
7. Push and create a Pull Request

---

## 📄 License

Not specified. Consider adding a LICENSE file (MIT, Apache 2.0, GPL, etc.).

---

## 🙏 Acknowledgments

- Built for Realm of the Mad God community
- Uses Discord.js library
- Fastify for high-performance backend
- PostgreSQL for reliable data storage

---

## 📞 Support & Contact

For issues or questions:
1. Check existing GitHub issues
2. Create a new issue with details
3. Join the Discord server (if applicable)

---

**Status Summary:**

- 🟢 **Core Functionality**: Fully working (runs, verification, moderation, configuration)
- 🟡 **Advanced Features**: Partially implemented (class selection working, but no bench/leave UI)
- 🔴 **Testing & Deployment**: No automated tests, manual deployment only
- ⚡ **Performance**: Not optimized for scale, but functional for small-medium servers

**Last Updated**: November 12, 2025
