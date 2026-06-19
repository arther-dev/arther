# Analytics scale prep (H.3)

Phase-4 task **H.3** — the **monthly partitioning plan** for `analytics_events`
and the **warehouse lift-out seam**. This is a *plan*, not a migration: per
[architecture §13](arther-architecture.md) the v1 stance is "analytics start in
Postgres… do it on signal (slow queries), not speculatively." This document is
the migration we keep ready so that, when the signal fires, partitioning is a
mechanical change rather than a redesign.

## 1. Current shape (migration 0011)

`public.analytics_events` is the single append-only event table behind every
analytics surface (epic A):

- Columns: `id uuid pk`, `workspace_id`, `event_type`, `actor_user_id`,
  `session_id`, `magic_link_id`, `document_id`, `payload jsonb`,
  **`occurred_at timestamptz not null default now()`**.
- Append-only: `prevent_mutation()` BEFORE UPDATE/DELETE triggers; no
  authenticated INSERT policy (service-role writes only); member-read RLS
  (`analytics_read` = `private.is_workspace_member(workspace_id)`).
- Indexes: `(workspace_id, event_type, occurred_at desc)` and
  `(document_id, occurred_at desc)` — both lead with a dimension and end in time.
- Read path: SECURITY-INVOKER metric RPCs (0024–0027) that **window by
  `occurred_at`** (e.g. last-N-days consumption, review-cycle pairing). Nothing in
  the schema references `analytics_events.id` — it is a **leaf table** (no inbound
  FKs), which is what makes the partitioning PK change below safe.

These properties — append-only, monotonic `occurred_at`, time-windowed reads, a
leaf table — are the textbook case for native **range partitioning by time**.

## 2. The plan: monthly RANGE partitions on `occurred_at`

Convert `analytics_events` to a `PARTITION BY RANGE (occurred_at)` table with one
partition per calendar month (`analytics_events_YYYY_MM`), plus a `DEFAULT`
partition as a safety net for out-of-range rows.

**Why monthly:** metric windows are days-to-weeks, so a query touches 1–2
partitions and Postgres prunes the rest. Monthly (not daily) keeps the partition
count small (≈12–25 live) — fewer planning-time partitions, simpler retention.

**The one structural cost — the primary key.** Declarative partitioning requires
the partition key to be part of every UNIQUE/PRIMARY KEY. Today the PK is `id`
alone; it must become a **composite `(id, occurred_at)`**. Because no table FKs to
`analytics_events.id`, this is invisible to the rest of the schema. `id` stays
globally unique in practice (a `gen_random_uuid()`), and lookups by `id` still use
the PK index.

**What carries over for free (Postgres ≥13):**
- **Indexes** declared on the partitioned parent propagate to every partition; the
  two existing indexes are recreated per-partition and prune by `occurred_at`.
- **RLS** is enforced on the partitioned parent — the `analytics_read` policy moves
  to the parent and applies to all reads through it (the app/RPCs always query the
  parent, never a child directly).
- **Row triggers** (`prevent_mutation`) defined on the parent cascade to all
  partitions, so append-only is preserved.

**Retention becomes DDL, not DELETE.** Dropping data past the retention window
(proposed **25 months**, enough for year-over-year) is `DROP TABLE
analytics_events_YYYY_MM` (or `DETACH` then export — see §4). This is instant
metadata work that **bypasses the append-only `prevent_mutation` DELETE trigger**
(it is DDL, not a row delete) — the elegant payoff of partitioning an immutable
log.

## 3. Conversion migration (sketch — runs on signal, not at v1)

`analytics_events` cannot be altered into a partitioned table in place. The
low-risk recipe (the table is service-role-write, so writes are easy to quiesce):

1. `create table analytics_events_part (like analytics_events including defaults)
   partition by range (occurred_at);` with PK `(id, occurred_at)`, the two
   indexes, the `analytics_read` policy + RLS enabled, and the two
   `prevent_mutation` triggers.
2. Pre-create the month partitions spanning existing data + a `DEFAULT`.
3. Backfill `insert into analytics_events_part select * from analytics_events;`
   (or `ATTACH` the old table as one partition if the volume makes a copy
   expensive).
4. In one transaction: `alter table analytics_events rename to
   analytics_events_old; alter table analytics_events_part rename to
   analytics_events;`. The RPCs and the recorder reference the name, so they pick
   up the partitioned table with no code change.
5. Drop `analytics_events_old` once verified.

At v1 volumes this is a sub-second copy; the migration ships to both
`supabase/migrations/` and `Development/Architecture/migrations/` (drift check)
when triggered.

## 4. Partition management

- **Creation ahead of time:** a scheduled job creates next month's partition
  before it is needed. Options, cheapest first: **pg_cron** in Supabase (a monthly
  `create table … partition of …`), or `pg_partman` (declarative retention +
  pre-make), or the existing **Vercel cron** path (`/api/cron/*`) calling a
  `create_next_analytics_partition()` definer function. The `DEFAULT` partition
  guarantees no insert ever fails even if the job is late.
- **Retention:** monthly, `DETACH` partitions older than 25 months; **export the
  detached partition to the warehouse** (§5), then `DROP`.

## 5. Warehouse lift-out seam

Per §13, "the seam to pipe events into ClickHouse/BigQuery/PostHog later is the
**envelope itself**." The envelope is the stable `analytics_events` column set +
the typed `payload jsonb`; it does not change when analytics moves out of
Postgres. The seam has two halves:

- **Export (write path).** Monthly partitions make batch export trivial: a
  completed month is an immutable, self-contained table — `COPY`/CDC it to the
  warehouse, then detach/drop. (A future dual-write at the recorder
  — `recordAnalyticsEvent` — is the lower-latency option if real-time warehouse
  analytics is ever needed; the single recorder call site is the only thing that
  changes.)
- **Read (query path).** The metric **RPCs are the read interface** (A.x surfaces
  call `getWorkspace*`/`getDocument*`, never raw SQL). Repointing a metric at the
  warehouse is changing one RPC/DB function body, not the app. This is the same
  "interfaces are the seams" discipline §387 applies to search.

Candidate targets unchanged from architecture: **ClickHouse** (columnar, cheap
event analytics), **BigQuery** (serverless, if already in a GCP estate), or
**PostHog** (product analytics + funnels out of the box).

## 6. When to pull the trigger (signal, not calendar)

Do **not** partition at launch. Execute §3 when any holds:

- `analytics_events` row count **> ~50M**, or on-disk size **> ~10 GB**;
- a metric RPC's p95 latency **> ~500 ms**, or autovacuum/bloat on the table
  becomes a maintenance burden;
- a need for **retention/erasure** at scale (GDPR §11) where row-by-row delete on
  one giant table is too slow — partition `DROP` solves this directly.

Until then the single table + the two time-leading indexes are correct and
cheapest. This plan is the ready-to-run answer the moment a signal appears.

## 7. Invariants preserved

The envelope, the RPC contracts, the member-read RLS semantics, and the
append-only guarantee are all unchanged by partitioning — it is a storage-layer
change beneath stable interfaces. That is precisely why it can wait for signal:
nothing above the table has to know.
