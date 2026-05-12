# VamO Telemetry Cost Analysis & Scalability Report

## 1. Overview
The VamO Telemetry system is designed to provide high-fidelity operational insights while maintaining a low Firestore cost profile. This is achieved through aggressive in-memory throttling, TTL-based cleanup, and planned background aggregations.

## 2. Estimated Daily Writes (Firestore)

### Assumptions:
- **Active Drivers (DAU)**: 100
- **Active Passengers (DAU)**: 500
- **Completed Rides**: 200
- **Peak Hour Factor**: 3x average load

### Event Breakdown per Role:

#### Passenger Events:
- **Presence (Heartbeat)**: 1 write every 60s while app is open.
  - Avg session 10 mins = 10 writes.
  - 500 passengers = **5,000 writes/day**.
- **Ride Lifecycle**: Request, Cancel, Complete.
  - 200 rides * 3 events = **600 writes/day**.

#### Driver Events:
- **Presence (Heartbeat)**: 1 write every 60s while online.
  - Avg online 8 hours = 480 writes.
  - 100 drivers = **48,000 writes/day**.
- **Matching**: Offer Received, Accepted/Ignored.
  - Avg 10 offers per ride = 2,000 events.
  - Throttled at 5s per event type.
  - 200 rides * 10 offers = **2,000 writes/day**.

#### System Events:
- **Errors & Fallbacks**: Throttled and deduplicated.
  - Est. **500 writes/day**.

### Total Daily Writes:
~56,100 writes/day.
- **Monthly Volume**: ~1.7M writes.
- **Estimated Cost (Firestore Writes)**: $1.7M * ($0.18 / 100k) = **~$3.06 USD / month**.

## 3. Storage & TTL Strategy
- **Raw Events**: Deleted automatically after **30 days** via Firestore TTL (`expiresAt` field).
- **Errors**: Retained for **90 days**.
- **Historical Growth**: Storage costs remain flat as deletions match new writes after 30 days.

## 4. Aggregation & Read Optimization
- **Dashboard Reading**: Administrative dashboards (Muni/Admin) DO NOT read raw events.
- **Planned Aggregations**: Scheduled Cloud Functions (Hourly/Daily) will aggregate data into `city_metrics` and `driver_metrics`.
- **Read Cost Reduction**: 
  - Instead of reading 1,000 events to show a chart, the dashboard reads **1 document** from the metrics collection.
  - Reduction factor: **1,000x**.

## 5. Scalability Benchmarks (10x Growth)
- **1,000 Drivers / 5,000 Passengers**:
  - Writes: ~560k / day (~17M / month).
  - Monthly Cost: **~$30 USD**.
  - System impact: Negligible on Firestore performance (Firestore supports 10k+ writes/second).

## 6. Optimization Checklist
1. [x] In-memory Throttling (Presence: 60s, Matching: 5s).
2. [x] Fire-and-forget writes (Non-blocking UI).
3. [x] TTL Field (`expiresAt`) for automatic cleanup.
4. [ ] Background Aggregation Functions (Phase 2).
5. [x] Centralized `TelemetryService` to prevent ad-hoc logging.

---
*Created on: 2026-05-07*
*Version: 2.1.0*
