meta|doc=rules|truth=canonical|schema=base.v2|status=active|profile=core

project|name=workflow-cannon|type=project_readme|scope=onboarding

ref|id=human_readme|target=README.md|type=file|status=active
ref|id=maintainer_readme|target=docs/maintainers/README.md|type=file|status=active

rule|id=R001|level=must|scope=onboarding|directive=read_repository_root_readme_first_for_cli_quick_start_and_policy_links|risk=low|approval=none|override=auto|status=active|refs=README.md|why=rationale_for_R001

check|id=K001|scope=readme|assertion=chat_feature_marker_replaced_when_readme_generated|onFail=warn|status=active

decision|id=D001|topic=readme_shape|choice=pair_cli_quickstart_with_chat_feature_guides|why=Maintainers_drive_kit_via_editors_without_memorizing_shell_JSON|status=active

example|id=E001|for=R001|kind=good|text=Read_root_readme_then_open_agents_md_for_depth|status=active

term|name=chat_feature|definition=Keyed_record_in_dot_ai_readme_rendered_into_human_readme_marker|status=active

command|id=C001|name=generate-document|use=documentation_module|scope=documentation|expectation=Emits_paired_ai_and_human_files_per_document_type|status=active

workflow|id=W001|name=readme_refresh|when=chat_guides_change|steps=edit_dot_ai_readme_chat_feature_lines_or_templates_readme,run_documentation_module_for_README_md|done=dot_ai_readme_docs_maintainers_readme_and_repo_root_readme_pick_up_new_copy|status=active

chat_feature|id=CF001|title=Bootstrap a focused agent session|summary=Agree on workspace health and the real task queue before implementation so nobody trusts stale chat context.|steps=Open a thread at the repository root>Say you want a cold-start pass that reconciles doctor-style signals with task-engine evidence>Ask for a short summary of the next sensible work item and any blockers

chat_feature|id=CF002|title=Deliver one maintainer task through the phase branch|summary=Sequence branch, PR, review, merge, and task lifecycle the way maintainers expect, with chat steering and the task store as evidence.|steps=Name the T### you own>Attach `.ai/playbooks/task-to-phase-branch.md` with `@` or enable `.cursor/rules/playbook-task-to-phase-branch.mdc`>Tell the agent to follow the playbook order for branch hygiene, PR targets into `release/phase-N`, and tier-A transitions with JSON policy approval per `.ai/AGENT-CLI-MAP.md`

chat_feature|id=CF003|title=Research friction and log improvement work|summary=Turn messy observations into bounded improvement tasks using the discovery playbook instead of free-form chat notes.|steps=Describe where friction showed up such as sessions, docs, CLI UX, policy, or release ops>Attach `.ai/playbooks/improvement-task-discovery.md` or `.cursor/rules/playbook-improvement-task-discovery.mdc`>Ask the agent to follow the playbook checkpoints and persist only through the tier-B commands it names when work should land in the queue

chat_feature|id=CF004|title=Triage improvement backlog into ready work|summary=Pick at most three proposed improvements with explicit rubric and evidence before promoting to ready.|steps=Ask for a list of improvement-task candidates that are still proposed>Attach `.ai/playbooks/improvement-triage-top-three.md` or `.cursor/rules/playbook-improvement-triage-top-three.mdc`>Have the agent document rationale for each pick and use accept-style transitions only after the rubric is satisfied

chat_feature|id=CF005|title=Move wishlist ideas toward execution tasks|summary=Rank ideation, narrow scope, and hand off to execution tasks without losing planning tokens.|steps=Paste or describe ranked wishlist items and constraints>Attach `.ai/playbooks/wishlist-intake-to-execution.md` or `.cursor/rules/playbook-wishlist-intake-to-execution.mdc`>Tell the agent to follow intake questions then conversion steps the playbook specifies

chat_feature|id=CF006|title=Run structured onboarding in chat|summary=Capture role and temperament as numbered answers you can reuse across sessions.|steps=Open Cursor chat where rules can attach>Attach `.ai/playbooks/workspace-kit-chat-onboarding.md` or `.cursor/rules/playbook-workspace-kit-chat-onboarding.mdc`>Work through each numbered step and save answers when the playbook says to stop and persist

chat_feature|id=CF007|title=Run the behavior interview|summary=Fill the scribe-style questionnaire so collaboration defaults are explicit.|steps=Attach `.ai/playbooks/workspace-kit-chat-behavior-interview.md` or `.cursor/rules/playbook-workspace-kit-chat-behavior-interview.mdc`>Answer each question in order and save per-step outputs>Ask the agent to summarize effective profile hints without overriding policy or approval gates

chat_feature|id=CF008|title=Refresh generated maintainer documentation|summary=After changing keyed `.ai` sources or templates under the documentation module, regenerate paired human files deterministically.|steps=Point the agent at `src/modules/documentation/RULES.md` for precedence>Say which document types you touched and that you want the documentation module batch or single-document generation>Have the agent report paths written and validation or evidence lines from the module output

chat_feature|id=CF009|title=Recover from a long or compacted chat|summary=Replay governance order and queue facts from files and kit output instead of trusting thread memory.|steps=Attach `.cursor/rules/cursor-long-session-hygiene.mdc` if you want a short checklist>Ask the agent to re-walk `.ai/agent-source-of-truth-order.md`>Direct it to restate task status from the configured task store only after fresh read-only inspection
