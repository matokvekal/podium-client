## Client Bug Notes

- [x] Add logout to side modal (`DONE`)
- [x] Clear personal rides on logout and repopulate on next login (`DONE`)

Implemented in:

- `src/app/AppDrawer.tsx` (Sign out action in side drawer)
- `src/auth/AuthContext.tsx` (`signOut` calls `useEventsStore.clearMyRides()`)
- `src/store/eventsStore.ts` (`clearMyRides` + normal `loadMyRides` repopulation)
