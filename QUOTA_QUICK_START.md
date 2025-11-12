# Quota System - Quick Start Guide

## Initial Setup

### 1. Set the Quota Channel
First, designate a channel where quota leaderboards will be posted:
```
/setchannels quota:#quota-leaderboards
```

### 2. Configure a Role
Open the configuration panel for a role (e.g., Organizer):
```
/configquota role:@Organizer
```

## Configuration Options

### Basic Settings
Click the **"Set Basic Config"** button to configure:

- **Required Points**: How many points members need to meet quota (e.g., 10)
- **Reset Day**: Day of the week quota resets (0=Sunday, 1=Monday, ..., 6=Saturday)
- **Reset Hour**: Hour of day in UTC (0-23)
- **Reset Minute**: Minute of hour (0-59)

**Example**: Reset every Monday at midnight UTC
- Reset Day: `1`
- Reset Hour: `0`
- Reset Minute: `0`

### Dungeon Point Overrides (Optional)
By default, all dungeons are worth **1 point**. To customize:

1. Click **"Configure Dungeons"** button
2. Select a dungeon from the dropdown menu
3. Enter the custom point value
   - Set to `0` to remove the override and revert to default (1 point)
   - Example: Set Shatters to `3` points

**Common Configurations**:
- High-tier dungeons (Shatters, Void, O3): 2-3 points
- Mid-tier dungeons (Fungal, Nest, Cult): 1-2 points  
- Low-tier dungeons (Sprite, Snake, UDL): 1 point

### Update the Leaderboard Panel
After configuring settings, click **"Update Panel"** to post/refresh the leaderboard in your quota channel.

The panel will show:
- ✅ Members who have met quota
- Current period timeframe
- Top 25 members by points
- Stats on how many members met quota

## Multiple Roles

You can configure different quota requirements for different roles:

```
/configquota role:@Organizer
/configquota role:@Security
/configquota role:@Head Organizer
```

Each role can have:
- Different required points
- Different reset schedules
- Different dungeon point values
- Separate leaderboard panels

## How Points Are Tracked

- Points are **automatically** logged when runs are completed
- Only runs during the current quota period count
- Members must have the configured role to appear on the leaderboard
- Points reset automatically at the configured time

## Example Setup: Organizer Quota

**Goal**: Organizers must complete 10 points worth of runs per week

```
/configquota role:@Organizer
```

Then configure:
- **Required Points**: `10`
- **Reset Day**: `1` (Monday)
- **Reset Hour**: `0` (Midnight UTC)
- **Reset Minute**: `0`

Dungeon overrides:
- Shatters: `2` points
- Void: `3` points  
- Fungal Cavern: `2` points
- Nest: `2` points
- All others: `1` point (default)

With this setup, organizers could meet quota by:
- Running 10 low-tier dungeons (10 × 1pt = 10pts)
- Running 5 mid-tier dungeons (5 × 2pt = 10pts)
- Running 3 Voids + 1 low-tier (3 × 3pt + 1 × 1pt = 10pts)
- Any combination that totals 10+ points

## Tips

1. **Set realistic requirements**: Consider your server's activity level
2. **Use dungeon overrides strategically**: Reward harder/longer dungeons with more points
3. **Communicate clearly**: Post your quota requirements in an info channel
4. **Regular reviews**: Check the leaderboard panel regularly to track progress
5. **Adjust as needed**: You can change settings anytime with `/configquota`

## Troubleshooting

**Panel not showing?**
- Make sure you've set a quota channel with `/setchannels quota:#channel`
- Click "Update Panel" after configuring settings

**Members not appearing?**
- Members must have the configured role
- Only activity during the current quota period counts
- Panel shows top 25 members only

**Wrong reset time?**
- Times are in UTC, convert from your local timezone
- Double-check day of week (0=Sunday, 1=Monday, etc.)

## Admin Permissions

Only users with **Discord Administrator** permission can:
- Run `/configquota`
- Modify quota settings
- Update leaderboard panels
