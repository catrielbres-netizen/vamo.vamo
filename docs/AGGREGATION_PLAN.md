# VamO Telemetry Aggregation Plan

## 1. Goal
To provide fast, cost-effective dashboards by shifting computation from "query-time" (frontend) to "write-time" or "scheduled" (backend). Dashboards should read aggregated summary documents instead of thousands of raw telemetry events.

## 2. Key Collections
- `city_metrics`: Aggregated daily/monthly stats per city.
- `driver_metrics`: Historical performance stats per driver.
- `passenger_metrics`: Usage patterns per passenger.
- `realtime_metrics`: High-frequency counters (e.g., active rides now).

## 3. Cloud Functions (Implementation Map)

### A. Hourly City Aggregator (Scheduled)
- **Schedule**: Every 1 hour.
- **Source**: `telemetry_events` where `createdAt >= last_run`.
- **Logic**:
  - Count `ride_requested`, `ride_completed`, `ride_cancelled` per `cityKey`.
  - Count unique `userId` for `passenger_activity` and `driver_activity`.
- **Target**: `city_metrics/{cityKey}_daily_{YYYY-MM-DD}` (Update/Increment).

### B. Daily Driver Performance (Scheduled)
- **Schedule**: Daily at 02:00 AM.
- **Source**: `telemetry_events` for the previous day.
- **Logic**:
  - Aggregate `offers_received` vs `offers_accepted`.
  - Calculate "Acceptance Rate" for the day.
- **Target**: `driver_metrics/{driverId}_daily_{YYYY-MM-DD}`.

### C. Real-time Counter (Trigger-based)
- **Trigger**: `onDocumentCreated` for `rides/{rideId}`.
- **Logic**:
  - Increment `active_rides` in `realtime_metrics/{cityKey}`.
- **Target**: `realtime_metrics/{cityKey}`.

## 4. Dashboards Update Strategy
- **Muni Dashboard**: Replace `onSnapshot` of `users` with a read from `city_metrics` or `realtime_metrics`.
- **Admin Analytics**: Use `city_metrics` for charts (Last 30 days) instead of querying the massive `rides` or `telemetry_events` collections.

## 5. Retention & Cleanup
- **Raw Events**: 30 days (managed by Firestore TTL `expiresAt`).
- **Aggregated Metrics**: Permanent (small storage footprint).

## 6. Phase 1: Real-time Summaries (Immediate)
We will focus on updating the Municipal Dashboard to use `realtime_metrics` to avoid querying the entire `users` collection periodically for "Online" status if the user base grows.

---
*Status: Draft / For Implementation*
