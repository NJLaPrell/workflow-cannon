---
name: cursor-workflow-cannon UI styling gaps
description: Recurring pattern found in this extension's dashboard — CSS classes referenced in markup with no rule defined anywhere, rendering unstyled.
---

When auditing this extension's dashboard against the UX spec, several elements used semantic-looking class names (e.g. `wc-phase-ordering-risk`) that had zero matching CSS rule in any file — they silently rendered as unstyled plain text/paragraphs instead of the intended alert/callout treatment.

**Why:** These bugs don't show up as compile errors or console warnings — they only surface as "this looks plain and doesn't match the spec" during a visual review. Grep for a class name across the whole `src/views` tree (not just the file where it's used) before assuming it's styled.

**How to apply:** When reviewing or adding any dashboard element meant to carry visual weight (danger/warning/attention), grep the full styling surface (`DashboardViewProvider.ts`, `wc-base-css.ts`, `guidance-panel-webview-css.ts`, etc.) for the class name. If no hit, wire it to the shared `.wc-callout` component (`wc-callout--danger/warning/info/success/neutral`) rather than inventing a new bespoke unstyled class.
