# ROTMG Raid Bot

A Discord bot system for organizing and managing Realm of the Mad God (ROTMG) dungeon raids, built with Discord.js (bot) and Fastify (backend API), backed by PostgreSQL.

## 🏗️ Architecture Overview

This project consists of two main components:

### **Backend** (Fastify REST API)
- Manages persistent raid data in PostgreSQL
- Provides authenticated REST endpoints for the Discord bot
- Handles run lifecycle, reactions (join/bench/leave), and audit logging
- Uses Zod for request validation and enforces Discord Snowflake ID constraints

### **Bot** (Discord.js v14)
- Provides slash commands (`/run`, `/ping`, `/info`)
- Interactive button-based UI for joining raids and organizer controls
- Autocomplete support for dungeon selection (50+ dungeons from ROTMG)
- Communicates with backend via authenticated HTTP requests

---

## 📂 Project Structure

```
rotmg-raid-bot/
│
├── backend/                          # Fastify REST API
│   ├── src/
│   │   ├── server.ts                 # ✅ Main Fastify server entrypoint
│   │   ├── db/
│   │   │   ├── pool.ts               # ✅ PostgreSQL connection pool
│   │   │   └── migrations/
│   │   │       ├── 001_init.sql      # ✅ Initial schema (guilds, members, raiders, runs, reactions, audit)
│   │   │       └── 002_contract_safety.sql # ✅ Data integrity constraints & indexes
│   │   ├── lib/
│   │   │   ├── constants.ts          # ✅ Shared types & Zod schemas (RunStatus, ReactionState, Snowflake validation)
│   │   │   └── errors.ts             # ✅ Unified error response helpers
│   │   ├── plugins/
│   │   │   └── auth.ts               # ✅ API key authentication middleware
│   │   ├── routes/
│   │   │   ├── health.ts             # ✅ Public health check endpoint
│   │   │   └── runs.ts               # ✅ CRUD endpoints for runs & reactions
│   │   └── scripts/
│   │       └── migrate.ts            # ✅ Database migration runner
│   ├── package.json                  # ✅ Dependencies: fastify, pg, zod, dotenv
│   ├── tsconfig.json                 # ✅ TypeScript config (ES2022, ESM)
│   └── .env.example                  # 🟡 Example environment variables
│
└── bot/                              # Discord.js Bot
    ├── src/
    │   ├── index.ts                  # ✅ Bot client initialization & event handlers
    │   ├── register-commands.ts      # ✅ Registers slash commands to Discord API
    │   ├── commands/
    │   │   ├── _types.ts             # ✅ TypeScript types for slash commands
    │   │   ├── index.ts              # ✅ Command registry & registration helper
    │   │   ├── ping.ts               # ✅ Simple latency test command
    │   │   ├── info.ts               # ✅ Display guild/user/channel context
    │   │   └── run.ts                # ✅ Create raid command with dungeon autocomplete
    │   ├── constants/
    │   │   ├── dungeon-types.ts      # ✅ TypeScript interfaces for dungeon data
    │   │   ├── dungeon-helpers.ts    # ✅ Search & lookup utilities for dungeons
    │   │   └── DungeonData.ts        # ✅ 50+ ROTMG dungeon definitions (portals, emojis, colors, categories)
    │   ├── interactions/
    │   │   └── buttons/
    │   │       ├── join.ts           # ✅ Handle "Join" button → post reaction to backend
    │   │       ├── organizer-panel.ts # ✅ Show organizer-only controls (Start/End)
    │   │       └── run-status.ts     # ✅ Handle Start/End buttons → update backend & UI
    │   └── lib/
    │       ├── http.ts               # ✅ Backend HTTP client with unified error handling
    │       └── permissions.ts        # ✅ Organizer permission checks (role or embed mention)
    ├── package.json                  # ✅ Dependencies: discord.js, dotenv
    ├── tsconfig.json                 # ✅ TypeScript config (ES2022, ESM, includes backend constants)
    └── .env.example                  # 🟡 Example environment variables
```

---

## ✅ Implemented Features

### Backend (API)
- [x] **Database Schema**: Comprehensive schema with guilds, members, raiders, runs, reactions, audit logs
- [x] **Data Integrity**: Snowflake ID validation, constraints, indexes, auto-updated timestamps
- [x] **Migration System**: Transaction-safe SQL migration runner with tracking table
- [x] **API Authentication**: Header-based API key validation (`x-api-key`)
- [x] **Health Endpoint**: Public `/v1/health` endpoint
- [x] **Run Creation**: `POST /v1/runs` - Creates run, upserts guild/member
- [x] **Reaction Management**: `POST /v1/runs/:id/reactions` - Join/bench/leave with validation
- [x] **Status Transitions**: `PATCH /v1/runs/:id` - Valid state machine (open→started→ended)
- [x] **Message Linking**: `POST /v1/runs/:id/message` - Store Discord message ID
- [x] **Run Retrieval**: `GET /v1/runs/:id` - Fetch run metadata
- [x] **Error Handling**: Unified error format with error codes

### Bot (Discord)
- [x] **Slash Commands**: `/ping`, `/info`, `/run` registered successfully
- [x] **Dungeon Autocomplete**: Search 50+ dungeons by name with fuzzy matching
- [x] **Run Creation Flow**: Creates DB record → posts embed with buttons → stores message ID
- [x] **Join Button**: Users can join runs, updates raider count in embed
- [x] **Organizer Panel**: Role/mention-based permission check for controls
- [x] **Start/End Buttons**: Transitions run status, updates public message
- [x] **Embed Layout**: Dungeon name, description, raider count, thumbnail, color theming
- [x] **Error Handling**: Graceful fallbacks for failed interactions

---

## 🟡 Partially Implemented / Issues

### Backend
- [ ] **Reaction State Management**: `bench` and `leave` states exist but aren't fully exposed in bot UI (only "join" button)
- [ ] **Audit Logging**: `audit` table exists but no routes currently write to it
- [ ] **Raider Verification**: `raider` table with `status` (pending/approved/rejected/banned) is unused
- [ ] **Class Selection**: `reaction.class` field exists but not implemented in bot

### Bot
- [ ] **Class Button**: "Class" button in run embed is non-functional (no handler)
- [ ] **Bench/Leave UI**: No buttons for "Bench" or "Leave" reactions
- [ ] **Party/Location**: Captured in `/run` command but not stored in backend
- [ ] **Description Field**: Command has `desc` option but uses wrong field name (tries `description` but reads `desc`)
- [ ] **Error Messages**: Some backend errors aren't user-friendly in bot
- [ ] **Organizer Username**: Not displayed in embed (only mention)
- [ ] **Autocomplete Empty Query**: Defaults to Exaltation dungeons only (intentional but may confuse users)

### Cross-Cutting
- [ ] **Environment Variables**: No validation on startup (missing vars cause runtime errors)
- [ ] **Logging**: Basic console.log only, no structured logging
- [ ] **Tests**: No unit or integration tests
- [ ] **Documentation**: No API documentation or setup guide
- [ ] **Docker/Deploy**: No containerization or deployment scripts

---

## ❌ Not Yet Implemented

### High Priority
- [ ] **Edit/Cancel Runs**: No way to cancel or delete a run after creation
- [ ] **Reaction List**: No command to view who joined/benched a run
- [ ] **Afk Check System**: Mentioned in schema comments but not implemented
- [ ] **DM Notifications**: No direct messages when run starts/ends
- [ ] **Run History**: No command to view past runs or stats
- [ ] **Multi-Server Support**: Tested in one guild only, no multi-tenant considerations

### Medium Priority
- [ ] **Role Requirements**: `keyReactions`/`otherReactions` from dungeon data unused (requires key/class)
- [ ] **Emoji Reactions**: Classic Discord emoji reactions not implemented (uses buttons instead)
- [ ] **Raid Controls**: No "pause", "resume", or "extend" functionality
- [ ] **Location/Server Field**: Party/location input not persisted or displayed
- [ ] **Organizer Transfer**: No way to transfer organizer to another user
- [ ] **Timeout Handling**: No automatic run closure after inactivity

### Low Priority
- [ ] **Custom Dungeons**: No admin commands to add/edit dungeon definitions
- [ ] **Statistics**: No analytics on popular dungeons, organizer leaderboards, etc.
- [ ] **Webhook Integration**: No external integrations (e.g., ROTMG bot APIs)
- [ ] **Voice Channel Automation**: No voice channel creation/management
- [ ] **Backup/Export**: No data export or backup utilities

---

## 🔧 Setup Instructions

### Prerequisites
- Node.js 18+ (ES2022 modules)
- PostgreSQL 14+
- Discord Bot Application ([Discord Developer Portal](https://discord.com/developers/applications))

### Backend Setup
1. Navigate to `backend/` directory
2. Copy `.env.example` to `.env` and fill in:
   ```bash
   PORT=4000
   BACKEND_API_KEY=your_secret_key_here
   DATABASE_URL=postgresql://user:password@localhost:5432/rotmg_raids
   ```
3. Install dependencies: `npm install`
4. Run migrations: `npm run migrate`
5. Start server: `npm run dev` (development) or `npm run build && npm start` (production)

### Bot Setup
1. Navigate to `bot/` directory
2. Copy `.env.example` to `.env` and fill in:
   ```bash
   APPLICATION_ID=your_discord_app_id
   SECRET_KEY=your_discord_bot_token
   DISCORD_DEV_GUILD_ID=your_test_server_id
   BACKEND_URL=http://localhost:4000/v1
   BACKEND_API_KEY=your_secret_key_here  # must match backend
   ORGANIZER_ROLE_ID=your_organizer_role_id  # optional
   ```
3. Install dependencies: `npm install`
4. Register commands: `npm run register`
5. Start bot: `npm run dev` (development) or `npm run build && npm start` (production)

### Database Schema
Run the migrations automatically with `npm run migrate` in the backend directory. This will:
- Create tables: `guild`, `member`, `raider`, `run`, `reaction`, `audit`
- Add Snowflake ID validation constraints
- Create indexes for performance
- Set up auto-update triggers

---

## 🗺️ Database Schema Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   guild     │         │    member    │         │   raider    │
├─────────────┤         ├──────────────┤         ├─────────────┤
│ id (PK)     │────┐    │ id (PK)      │────┐    │ guild_id    │◄──┐
│ name        │    │    │ username     │    │    │ user_id     │   │
│ created_at  │    │    │ created_at   │    │    │ nickname    │   │
└─────────────┘    │    └──────────────┘    │    │ status      │   │
                   │                        │    │ verified_at │   │
                   │                        │    │ notes       │   │
                   │                        │    │ created_at  │   │
                   │                        │    └─────────────┘   │
                   │                        │            ▲         │
                   │                        │            │         │
                   ▼                        ▼            │         │
┌─────────────────────────────────────────────┐         │         │
│                 run                         │         │         │
├─────────────────────────────────────────────┤         │         │
│ id (PK)                                     │         │         │
│ guild_id (FK) ──────────────────────────────┼─────────┘         │
│ organizer_id (FK) ──────────────────────────┼───────────────────┘
│ dungeon_key                                 │
│ dungeon_label                               │
│ description                                 │
│ status (open/started/ended/cancelled)       │
│ channel_id                                  │
│ post_message_id                             │
│ created_at, started_at, ended_at            │
└─────────────────────────────────────────────┘
                   │
                   │
                   ▼
┌─────────────────────────────────────────────┐
│              reaction                       │
├─────────────────────────────────────────────┤
│ run_id (FK, PK)                             │
│ user_id (FK, PK)                            │
│ state (join/bench/leave)                    │
│ class                                       │
│ updated_at                                  │
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

## 🎮 Usage Example

1. **Create a raid**: `/run dungeon:Shatters` (autocomplete helps)
2. **Users join**: Click "Join" button on the posted embed
3. **Start raid**: Organizer clicks "Organizer Panel" → "Start"
4. **End raid**: Organizer clicks "End" (removes buttons, marks run ended)

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Bot | Discord.js | ^14.16.3 |
| Backend | Fastify | ^4.28.1 |
| Database | PostgreSQL | 14+ |
| Language | TypeScript | ^5.6.3 |
| Runtime | Node.js | 18+ (ES2022) |
| Validation | Zod | ^3.23.8 |
| HTTP Client | node-fetch | (implicit) |

---

## 📝 Known Issues

1. **`node-fetch` Import**: Bot uses `node-fetch` but it's not in `package.json` (relies on Node 18+ built-in fetch)
2. **Description Field Mismatch**: `/run` command options use `desc` but code tries to read `description`
3. **Missing Audit Logs**: Audit table exists but no events are logged
4. **Error Handling**: Some edge cases (e.g., run not found) might not have user-friendly messages
5. **Permission Races**: Organizer panel permission check reads embed instead of DB (organizer could change)

---

## 🚀 Next Steps (Recommendations)

### Critical
1. Fix description field mismatch in `/run` command
2. Add `node-fetch` to bot dependencies or switch to native fetch
3. Add audit logging for all state changes
4. Write basic integration tests

### High Value
5. Implement class selection button
6. Add bench/leave buttons to UI
7. Add `/cancel` command for organizers
8. Implement reaction list viewer command

### Polish
9. Add structured logging (e.g., pino)
10. Environment variable validation on startup
11. Docker Compose setup
12. API documentation (OpenAPI/Swagger)
13. Deployment guide (Railway, Render, etc.)

---

## 📄 License

Not specified. Consider adding a `LICENSE` file.

---

## 👥 Contributing

No contributing guidelines yet. Consider adding `CONTRIBUTING.md`.

---

**Status**: 🟢 **Core functionality working** | 🟡 **Partial features need completion** | 🔴 **No tests or deployment automation**
