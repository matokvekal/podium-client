# Client Offline / Sync Architecture Rule

## Core Principle

**Server is always the authoritative source of truth.**

The client supports offline operation, but local data must never become the permanent authority.

## Client State Model

IndexedDB contains two separate concepts:

```text
1. Server Snapshot
   Last known state received from the server.

2. Pending Actions
   User actions created while offline or not yet confirmed by server.
```

Zustand represents the current UI state.

```text
UI State =
Server Snapshot
+
Pending Local Actions
```

Pending actions may affect the UI optimistically, but must be clearly considered **unconfirmed** until acknowledged by the server.

## Online Flow

```text
User Action
   ↓
API
   ↓
Server validates + persists
   ↓
Server response
   ↓
Update Zustand + IndexedDB
```

Always use the server response as the final state.

## Offline Flow

```text
User Action
   ↓
No connection
   ↓
Store action in IndexedDB pendingActions
   ↓
Allow user to continue
   ↓
Connection restored
   ↓
Replay pending actions
   ↓
Server validates
   ↓
Refetch authoritative state
   ↓
Update Zustand + IndexedDB
   ↓
Remove confirmed pending actions
```

## Pending Action

Each queued action should have a stable unique ID:

```ts
type PendingAction = {
  id: string; // clientActionId / UUID
  userId: string;
  type: string;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  status: "pending" | "syncing" | "failed";
};
```

The server should support **idempotent replay** where relevant.

Retrying the same `clientActionId` must not accidentally perform the operation twice.

Especially important for:

```text
join
leave
approve/reject
GPS/location batches
event mutations
route attachment
```

## Conflict Rule

For V1:

**Server wins on conflict.**

```text
Local pending action
        +
Server changed meanwhile
        ↓
Server accepts/rejects/conflicts
        ↓
Client refetches
        ↓
Server state becomes authoritative
```

Do not silently overwrite newer server data with stale local state.

## GPS / Offline Location

Never replace the original measurement timestamp with synchronization time.

```text
recordedAt = when GPS point was recorded
sentAt     = when it reached the server
```

Offline replay must preserve `recordedAt` and must not create duplicate location points.

## Session Isolation

All local data must be scoped by user.

```text
userId + resource
```

On logout:

* clear/reset Zustand user-specific state;
* stop active synchronization;
* never expose User A cached data to User B;
* pending actions must remain associated only with the user who created them.

## Important Rule

Do **not** treat IndexedDB as another database/source of truth.

```text
Server      = authoritative persisted state
IndexedDB   = last server snapshot + pending unsynced actions
Zustand     = current UI representation
```

After successful synchronization:

**server response always replaces local prediction/state.**

## V1 Goal

Implement:

**Server-authoritative + Offline Action Queue + Idempotent Replay + Refetch after synchronization.**

Do not introduce complex client-side conflict resolution for V1.
