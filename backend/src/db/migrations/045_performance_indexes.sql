-- ================================================================
-- Performance Optimization Indexes
-- ================================================================
-- This migration adds composite indexes to optimize hot-path queries
-- for production deployment at scale (~36k members, peak 1k concurrent users)
--
-- Impact: Significantly reduces query time for:
-- - Active run lookups by guild/status
-- - Join count aggregations
-- - Organizer active run checks
-- - Key reaction counts
-- ================================================================

-- 1. Composite index for guild + status queries (most common pattern)
-- Used by: GET /runs/active, expired runs cleanup, various status filters
-- Query pattern: WHERE guild_id = ? AND status IN (...)
CREATE INDEX IF NOT EXISTS idx_run_guild_status ON run(guild_id, status);

-- 2. Index for reaction join counts (heavily used in UI updates)
-- Used by: All join/leave operations, class selection, embed updates
-- Query pattern: WHERE run_id = ? AND state = 'join'
CREATE INDEX IF NOT EXISTS idx_reaction_run_state ON reaction(run_id, state);

-- 3. Composite index for organizer active run lookups
-- Used by: Active run checks before creating new runs (prevent multiple active)
-- Query pattern: WHERE organizer_id = ? AND guild_id = ? AND status IN ('open', 'live')
CREATE INDEX IF NOT EXISTS idx_run_organizer_guild_status ON run(organizer_id, guild_id, status);

-- 4. Index for key reaction aggregations
-- Used by: Key reaction counts, key pop tracking
-- Query pattern: WHERE run_id = ? GROUP BY key_type
CREATE INDEX IF NOT EXISTS idx_key_reaction_run_type ON key_reaction(run_id, key_type);

-- 5. Index for quota event lookups by guild and user
-- Used by: Quota stats, leaderboards, point calculations
-- Query pattern: WHERE guild_id = ? AND actor_user_id = ?
CREATE INDEX IF NOT EXISTS idx_quota_event_guild_user ON quota_event(guild_id, actor_user_id);

-- 6. Index for key pop snapshot queries
-- Used by: Awarding completions after key pops
-- Query pattern: WHERE run_id = ? AND key_pop_number = ?
CREATE INDEX IF NOT EXISTS idx_key_pop_snapshot_run_keypop ON key_pop_snapshot(run_id, key_pop_number);

-- 7. Partial index for active suspensions/punishments
-- Used by: Expired punishment cleanup, active suspension checks
-- Query pattern: WHERE guild_id = ? AND user_id = ? AND active = true
CREATE INDEX IF NOT EXISTS idx_punishment_active ON punishment(guild_id, user_id, expires_at) 
    WHERE active = true;

-- 8. Index for verification session cleanup
-- Used by: Cleanup expired sessions, prevent duplicate sessions
-- Query pattern: WHERE guild_id = ? AND user_id = ? AND status = ?
CREATE INDEX IF NOT EXISTS idx_verification_session_guild_user_status ON verification_session(guild_id, user_id, status);

-- ================================================================
-- Index Usage Notes for Production
-- ================================================================
-- 
-- Monitor these indexes with:
--   SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
--   FROM pg_stat_user_indexes
--   WHERE indexname LIKE 'idx_%'
--   ORDER BY idx_scan DESC;
--
-- If any index has idx_scan = 0 after a few days in production, consider dropping it.
--
-- Expected impact on query performance:
-- - Active run queries: 50-100x faster (seq scan -> index scan)
-- - Join count queries: 20-50x faster (smaller index scan)
-- - Organizer checks: 100x faster (seq scan -> index-only scan)
-- ================================================================
