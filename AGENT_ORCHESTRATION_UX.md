# AGENT_ORCHESTRATION_UX.md

**Artifact:** A-UX (Narrow dashboard UX spec)  
**Status:** Approved for implementation

---

## 1. Compact Layout & Roster Limits

- **Chosen Decision:** Proposal A (Two-Tiered Layout: 1 Main Agent + Collapsible Subagent Roster)  
- **Description:** The top row of the card displays the Main Agent details; active subagents are shown below it, collapsed with a "+ X more active" expander if there are more than 3.  

## 2. Freshness Badges & Stale Leases

- **Chosen Decision:** Proposal A (Three-State Semantic Indicators)  
- **Description:** Show live pulsing green (<30s), stale amber warning (30-90s), or gray inferred (>90s/absent) badges alongside text labels.  

## 3. Needs Attention Prioritization & Action Buttons

- **Chosen Decision:** Proposal A (Attention-First Sorting with Contextual Action Buttons)  
- **Description:** Sort needsAttention rows to the top with a red/coral border and expose contextual buttons (Review Handoff, Approve, Resolve/Assign) to trigger commands directly.  



