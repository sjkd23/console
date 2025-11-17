# Production Deployment Guide

## Overview
This guide provides production deployment notes for running the RotMG raid bot on a single VPS (~2 vCPU / 4GB RAM) serving ~36k Discord members with realistic peak usage of ~1k concurrent active users.

## ⚠️ Critical Fix Applied

**Migration numbering conflict resolved:** The original performance audit accidentally created two migration files both numbered `045`:
- `045_performance_indexes.sql` (performance indexes)
- `045_role_ping_channel.sql` (role ping channel)

This has been corrected by renaming `045_role_ping_channel.sql` → `046_role_ping_channel.sql`. If you have already run migrations, check your migration tracking to ensure both have run correctly.

## Performance Optimizations Applied

### Database Performance
- **Added composite indexes** for common query patterns (guild+status, run+state, organizer+guild+status)
- Expected to significantly reduce query time for active run lookups and join count aggregations
- See migration `045_performance_indexes.sql` for details

### Connection Pool Tuning
- **Max connections: 10** (tuned for 2 vCPU VPS)
- **Idle timeout: 30s** (release connections quickly under variable load)
- **Connection timeout: 5s** (fail fast if pool exhausted)

### HTTP Client Reliability
- **Request timeout: 25s** (before Discord's 30s interaction limit)
- Prevents hung interactions if backend is slow or unresponsive
- Clear error messages for timeout scenarios

### Interaction Response Latency
- **Immediate deferral** on all high-traffic commands (`/run`, join/leave buttons)
- Ensures interactions respond <3s even under load
- Prevents Discord timeout errors during peak usage

### Background Task Safety
- **Batch processing** for expired runs (10 at a time) to avoid CPU spikes
- **Overlap protection** prevents concurrent task executions
- **Graceful degradation** if tasks take longer than interval

### Logging Optimization
- **Conditional query logging** (debug only in development, slow queries always visible)
- Reduces log volume by ~90% in production while maintaining visibility for issues
- HTTP requests logged with correlation IDs for tracing

## Environment Configuration

### Backend (.env)
```bash
# Server Configuration
PORT=4000
NODE_ENV=production

# Database
DATABASE_URL=postgres://user:password@localhost:5432/rotmg_raids

# Security
BACKEND_API_KEY=<generate-strong-random-key-32-chars>

# Optional: SSL for database (uncomment if using managed PostgreSQL)
# DATABASE_SSL_REJECT_UNAUTHORIZED=false
```

### Bot (.env)
```bash
# Discord Configuration
APPLICATION_ID=<your-discord-app-id>
SECRET_KEY=<your-discord-bot-token>
DISCORD_GUILD_IDS=<comma-separated-guild-ids>

# Backend Connection
BACKEND_URL=http://localhost:4000/v1
BACKEND_API_KEY=<same-as-backend-key>

# Environment
NODE_ENV=production
```

## Database Setup

### PostgreSQL Configuration
Recommended settings for 2 vCPU / 4GB RAM VPS:

```sql
-- /etc/postgresql/14/main/postgresql.conf

# Connection Settings
max_connections = 20                    # Allow 20 total (bot uses 10 max)
shared_buffers = 1GB                    # 25% of RAM
effective_cache_size = 3GB              # 75% of RAM
maintenance_work_mem = 256MB
work_mem = 32MB                         # Per-operation memory

# Query Performance
random_page_cost = 1.1                  # SSD storage assumed
effective_io_concurrency = 200          # SSD parallelism

# Write Performance
wal_buffers = 16MB
min_wal_size = 1GB
max_wal_size = 4GB
checkpoint_completion_target = 0.9

# Monitoring
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
log_min_duration_statement = 100        # Log slow queries >100ms
```

Apply settings:
```bash
sudo systemctl restart postgresql
```

### Run Migrations
```bash
cd backend
npm run migrate
```

Verify indexes were created:
```sql
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE indexname LIKE 'idx_%'
ORDER BY idx_scan DESC;
```

## Docker Deployment (Recommended)

### Production docker-compose.yml
```yaml
version: "3.9"

services:
  db:
    image: postgres:14
    container_name: rotmg_db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: rotmg_raids
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    # Only expose on localhost for security
    ports:
      - "127.0.0.1:5432:5432"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: rotmg_backend
    environment:
      DATABASE_URL: postgres://postgres:${DB_PASSWORD}@db:5432/rotmg_raids
      PORT: 4000
      NODE_ENV: production
      BACKEND_API_KEY: ${BACKEND_API_KEY}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    # Only expose on localhost, use reverse proxy for external access
    ports:
      - "127.0.0.1:4000:4000"

  bot:
    build:
      context: ./bot
      dockerfile: Dockerfile
    container_name: rotmg_bot
    environment:
      APPLICATION_ID: ${APPLICATION_ID}
      SECRET_KEY: ${SECRET_KEY}
      DISCORD_GUILD_IDS: ${DISCORD_GUILD_IDS}
      BACKEND_URL: http://backend:4000/v1
      BACKEND_API_KEY: ${BACKEND_API_KEY}
      NODE_ENV: production
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  pgdata:
```

### Start Services
```bash
# Create .env file with production secrets
cp .env.example .env
nano .env

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f bot
docker-compose logs -f backend
```

## Monitoring

### Key Metrics to Watch

#### Database Performance
```sql
-- Slow queries (>100ms)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Application Health
```bash
# Bot container CPU/memory
docker stats rotmg_bot --no-stream

# Backend container CPU/memory
docker stats rotmg_backend --no-stream

# Database container CPU/memory
docker stats rotmg_db --no-stream

# Active connections
docker exec rotmg_db psql -U postgres -d rotmg_raids -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'rotmg_raids';"
```

#### Log Monitoring
```bash
# Watch for slow queries
docker-compose logs backend | grep "Slow query"

# Watch for timeouts
docker-compose logs bot | grep "timed out"

# Watch for task overlap warnings
docker-compose logs bot | grep "still running"

# Watch for consecutive failures
docker-compose logs bot | grep "consecutively"
```

## Scaling Considerations

### When to Scale Up (Vertical)
- Database queries consistently >100ms despite indexes
- Connection pool exhaustion (timeout errors in logs)
- CPU usage consistently >80% during peak hours
- Memory pressure causing swapping

**Recommendation:** Upgrade to 4 vCPU / 8GB RAM VPS
- Increase `max_connections` to 30
- Increase pool max to 15
- Increase `shared_buffers` to 2GB

### When to Scale Out (Horizontal)
- Single VPS cannot handle load even after vertical scaling
- Need high availability / failover
- Multiple geographic regions

**Recommendation:** Consider managed PostgreSQL + multiple bot instances
- Use managed PostgreSQL (AWS RDS, DigitalOcean Managed DB)
- Run 2-3 bot instances with load balancing (if bot sharding needed)
- Add Redis for distributed rate limiting

## Backup Strategy

### Database Backups
```bash
# Automated daily backup script
#!/bin/bash
BACKUP_DIR="/var/backups/rotmg"
DATE=$(date +%Y%m%d)
docker exec rotmg_db pg_dump -U postgres rotmg_raids | gzip > "$BACKUP_DIR/rotmg_raids_$DATE.sql.gz"

# Keep last 7 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
```

Add to crontab:
```bash
0 2 * * * /usr/local/bin/backup-rotmg-db.sh
```

### Restore from Backup
```bash
gunzip -c /var/backups/rotmg/rotmg_raids_20240115.sql.gz | docker exec -i rotmg_db psql -U postgres rotmg_raids
```

## Troubleshooting

### High CPU Usage
1. Check for slow queries: `docker-compose logs backend | grep "Slow query"`
2. Verify indexes are being used (see monitoring section)
3. Check scheduled tasks aren't overlapping: `docker-compose logs bot | grep "still running"`

### Memory Leaks
1. Monitor bot memory over time: `docker stats rotmg_bot`
2. Restart bot if memory grows unbounded: `docker-compose restart bot`
3. Check for unclosed connections in PostgreSQL

### Interaction Timeouts
1. Verify backend is responding: `curl http://localhost:4000/v1/health`
2. Check for slow database queries
3. Verify HTTP timeout is 25s (check bot logs for "timed out" messages)
4. Increase backend resources if consistently slow

### Database Connection Pool Exhausted
1. Check active connections: `SELECT count(*) FROM pg_stat_activity WHERE datname = 'rotmg_raids';`
2. Look for long-running queries: `SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC;`
3. Kill stuck queries if needed: `SELECT pg_terminate_backend(pid);`

## Production Checklist

Before deploying to production:

- [ ] Run migrations: `npm run migrate`
- [ ] Verify indexes created: Check `045_performance_indexes.sql` results
- [ ] Set strong `BACKEND_API_KEY` (32+ random characters)
- [ ] Set `NODE_ENV=production` for both bot and backend
- [ ] Configure PostgreSQL with recommended settings
- [ ] Set up automated database backups (daily)
- [ ] Configure log rotation for Docker containers
- [ ] Set up monitoring/alerting for CPU/memory/disk
- [ ] Test interaction latency: `/run` command should respond <1s
- [ ] Test join button latency: should defer immediately, update <2s
- [ ] Verify scheduled tasks run without overlap
- [ ] Document rollback procedure

## Performance Targets

Expected performance after optimizations:

| Metric | Target | Notes |
|--------|--------|-------|
| `/run` command response | <1s | Defers immediately |
| Join/leave button response | <2s | Defers immediately, backend call <1s |
| Active run query | <50ms | Composite index used |
| Join count query | <20ms | Indexed by run+state |
| Connection pool wait | <100ms | Rarely hits max |
| HTTP request timeout | 25s | Fail before Discord 30s limit |
| Scheduled task interval | 2-15min | No overlap |
| Slow query threshold | 100ms | Logged for investigation |

## Support

For issues or questions:
- Check logs first: `docker-compose logs -f`
- Review this guide's troubleshooting section
- Verify indexes with monitoring queries
- Check Discord.js and Fastify documentation for framework-specific issues
