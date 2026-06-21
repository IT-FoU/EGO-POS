# Phase A.1 POS UI Action Fix Report

## Status

PASS - POS UI action buttons are wired to permission handlers.

This fix does not rely on the policy script as the implementation. The actual POS screen now includes demo-only visible action buttons that call the same permission guard and mutate POS state only when allowed.

## Files Changed

- `app/(dashboard)/pos/page.tsx`
- `features/pos/components/pos-page-client.tsx`
- `features/pos/permissions.ts`
- `PHASE_A1_POS_UI_ACTION_FIX_REPORT.md`

## Buttons Connected

Demo-only POS Permission Debug Panel now exposes visible test buttons for:

- Refund Bill
- Void Bill
- Manual Price Override
- Delete Item From Bill
- Apply Discount
- Cash In
- Cash Out
- Reprint Receipt
- Split Payment
- Multi Currency Payment

Existing real POS controls also continue to use permission guards:

- Complete Sale
- Hold Bill
- Resume Bill
- Delete Held Bill / Void-style action
- Delete cart item
- Start Work / Cash In
- End Work / Cash Out
- Mixed payment / Split Payment
- QR / Bank / Card / Mixed payment mode
- Receipt print / Reprint Receipt

## Handlers Fixed

All demo panel action buttons now call:

- `enforcePosAction(action, context)`

If allowed:

- Performs a real POS state change.
- Creates audit log entry.

If blocked:

- Shows `You do not have permission to perform this action.`
- Does not change state.
- Creates blocked audit entry.

If approval is required:

- Creates Pending Approval request.
- Shows approval request message.
- Does not apply the action immediately.
- Creates approval-requested audit entry.

## Actual UI State Changes Connected

| Action | Allowed UI Behavior |
| --- | --- |
| Refund Bill | Shows refund processed message |
| Void Bill | Clears current sale/cart/payment state |
| Manual Price Override | Changes first cart item price and adds pricing note |
| Delete Item From Bill | Removes first cart item from current bill |
| Apply Discount | Applies discount percent within allowed role behavior |
| Cash In | Sets staff status to Working and records start work state |
| Cash Out | Sets staff status to Closed and shows closing summary |
| Reprint Receipt | Opens receipt preview |
| Split Payment | Opens mixed payment modal |
| Multi Currency Payment | Selects transfer payment mode |

## Permission Enforcement

### Owner

- Full access.
- Can approve/reject pending requests.

### Manager

- Refund Bill: Pending Approval
- Void Bill: Pending Approval
- Manual Price Override: Pending Approval
- Apply Discount above limit: Pending Approval
- Cash In/Out: Allowed
- Split/Multi Currency: Allowed

### Cashier

- Refund Bill: Blocked
- Void Bill: Blocked
- Manual Price Override: Blocked
- Cash Out: Blocked
- Apply Discount: Blocked unless explicitly granted later
- Delete Item: Allowed by default
- Reprint Receipt: Allowed by default

## Pending Approval Flow

When Manager creates approval request:

- Request is saved in `ego.pos.pendingApprovals`.
- Request appears in POS Pending Approval Center.
- Non-owner users see `Owner approval required`.
- Owner sees Approve/Reject buttons.

Approval behavior:

- Approve: updates request status, creates audit entry, applies the pending POS action.
- Reject: updates request status, creates audit entry, does not apply the action.

## Audit Log

Audit entries are saved in:

- `ego.pos.auditLog`

Audit records include:

- User
- Role
- Action
- Result
- Approval status
- Details
- Timestamp

Recorded results:

- allowed
- blocked
- approval_requested
- approved
- rejected

## Manual Test Steps

### Owner

1. Login as Owner.
2. Open `/pos`.
3. Confirm Debug Panel shows Owner role, branch, terminal, allowed actions, discount limit.
4. Click each demo action button.
5. Expected: all actions allowed and audit entries created.
6. Create pending request as Manager, then login as Owner.
7. Approve request.
8. Expected: action applies.
9. Reject request.
10. Expected: action does not apply.

### Manager

1. Login as Manager or created staff `gitar`.
2. Open `/pos`.
3. Confirm Debug Panel shows Manager role.
4. Click Refund Bill.
5. Expected: Pending Approval request.
6. Click Void Bill.
7. Expected: Pending Approval request.
8. Click Manual Price Override.
9. Expected: Pending Approval request.
10. Click Apply Discount above 10%.
11. Expected: Pending Approval request.
12. Confirm audit entries are created.

### Cashier

1. Login as Cashier.
2. Open `/pos`.
3. Confirm Debug Panel shows Cashier role.
4. Click Refund Bill.
5. Expected: permission denied message.
6. Click Void Bill.
7. Expected: permission denied message.
8. Click Manual Price Override.
9. Expected: permission denied message.
10. Click Cash Out.
11. Expected: permission denied message.
12. Click Delete Item after adding item.
13. Expected: follows permission and records audit.

## Remaining Limitations

- Pending approvals and audit entries are demo-mode local storage, not database records yet.
- Refund and manual price override are demo UI actions until full sale/refund/product-price workflows are connected.
- Cross-user Owner approval uses the same browser/local storage session. Database-backed approval sharing belongs to the later real persistence phase.
- The local browser runtime remains unstable in this Windows/OneDrive Thai-path workspace, so final visual browser automation was not completed in this run. The actual POS UI code paths are wired and build verified.

## Verification

- `npm run typecheck`: PASS
- `npm run build`: PASS

Note: the first build hit the recurring Windows/OneDrive `.next` file lock (`EBUSY`). Clearing `.next` and rerunning build passed.
