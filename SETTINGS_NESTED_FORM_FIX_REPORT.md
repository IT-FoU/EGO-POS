# Settings Nested Form Fix Report

## Status

PASS

## Root Cause

`SettingsForm` rendered a top-level `<form onSubmit={saveSettings}>`.

After the Staff Login create fix, the Add/Edit Staff Login modal also rendered its own `<form onSubmit={...}>` inside the Settings page. That created invalid HTML:

```html
<form>
  ...
  <form>
    ...
  </form>
</form>
```

React/Next reported the hydration error:

`In HTML, <form> cannot be a descendant of <form>.`

## Files Changed

- `features/settings/components/settings-form.tsx`
- `SETTINGS_NESTED_FORM_FIX_REPORT.md`

## Forms Changed

### SettingsForm Root

Changed:

- From: top-level `<form className="flex flex-col gap-6" onSubmit={saveSettings}>`
- To: top-level `<div className="flex flex-col gap-6">`

`saveSettings` no longer expects a form event.

### Save Settings Button

Changed:

- From: `type="submit"`
- To: `type="button" onClick={saveSettings}`

This keeps Settings save behavior working without creating a parent form.

### Staff Login Modal

Kept as its own valid modal form:

- `<form onSubmit={...}>`
- Submit button remains `type="submit"`
- Cancel button remains `type="button"`

This is now safe because it is no longer nested inside a parent form.

## Button Type Check

Checked Settings buttons for submit/nesting risk.

- Non-submit Settings buttons use `type="button"`.
- Modal submit button exists only inside the Staff Login modal form.

## Verification

- `/settings` build route: PASS
- Add Staff Login modal form structure: PASS
- Save Settings uses explicit click handler: PASS
- QR Bank modal remains button-driven and not nested in a parent form: PASS
- Approval Rules remain non-form controls: PASS
- No form-in-form structure remains in Settings: PASS

## Build Result

- `npm run typecheck`: PASS
- `npm run build`: PASS
