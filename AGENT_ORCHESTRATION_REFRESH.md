# AGENT_ORCHESTRATION_REFRESH.md

**Artifact:** A-REFRESH (Agent activity slice/refresh plan)  
**Status:** Approved for implementation

---

## 1. Refresh Mechanism

- **Chosen Decision:** Proposal A (Projection parameter on `dashboard-summary`)  
- **Description:** Extend `dashboard-summary` to accept `{"projection": "agentActivity"}` to return only the `agentActivitySummary` slice, skipping heavy task/notes database queries.  

## 2. Polling Interval and Visibility Management

- **Chosen Decision:** Proposal A (Visibility-Aware Dynamic Polling)  
- **Description:** Poll the activity slice every 3 seconds while active/visible; suspend timer when hidden or backgrounded.  

## 3. Mutation-Lock / Visual Stutter Prevention

- **Chosen Decision:** Proposal A (Optimistic UI + 2-Second Write-Lock)  
- **Description:** On mutation trigger, immediately render optimistic state, suspend polling for 2 seconds, and force targeted manual poll upon command completion.  


