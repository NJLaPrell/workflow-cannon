# Documentation schema (machine records)

Agent-facing **record grammar** lives in the pipe-syntax block below. Do not treat this file as a long-form tutorial.

- **JSON Schema (canonical shapes for data files):** `src/modules/documentation/schemas/feature-taxonomy.schema.json`, `roadmap-data.schema.json`
- **Example instances:** `src/modules/documentation/data/feature-taxonomy.json`, `data/roadmap-data.json`
- **View contracts (section bindings):** `src/modules/documentation/views/*.view.yaml` — each `sections[]` entry maps a **source** key to a **renderer** id (typed document assembly vs huge template holes).
- **Governance / workflow prose:** `src/modules/documentation/RULES.md`

---

meta|schema=base.v2|doc=<manifest|rules|runbook|workbook|map|workflows|commands|decisions|glossary|observed|planned|checks>|truth=<canonical|observed|planned>|status=<active|deprecated|draft>|profile=<core|runbook|workbook>

syntax|record=one_per_line|separator=||assignment==|list=,|sequence=>|conjunction=+|bool=true,false
ids|rule=R[0-9]{3,}|workflow=W[0-9]{3,}|command=C[0-9]{3,}|decision=D[0-9]{3,}|observed=O[0-9]{3,}|planned=P[0-9]{3,}|check=K[0-9]{3,}|example=E[0-9]{3,}|guardrail=G[0-9]{3,}
semantics|level=<must|must_not|should|may>|risk=<low|medium|high|critical>|approval=<none|prompt|required>|override=<auto|warn|prompt|stop>|refType=<adr|file|code|doc|issue|pr|test|external>
authoring|metaFirstOnce=true|oneFactPerRecord=true|exceptionsInline=true|noVagueDirectives=true|stableOrder=true

record|type=meta|required=schema,doc,truth,status|optional=profile,title,owner,tags,refs
record|type=ref|required=id,type,target|optional=label,note,status
record|type=rule|required=id,level,scope,directive,why|optional=unless,also,risk,approval,override,status,refs
record|type=check|required=id,scope,assertion|optional=when,onFail,status,refs
record|type=decision|required=id,topic,choice,why|optional=consequence,status,refs
record|type=example|required=id,for,kind,text|optional=status,refs
record|type=term|required=name,definition|optional=status,refs
record|type=command|required=id,name,use,scope,expectation|optional=risk,sensitivity,status,refs
record|type=workflow|required=id,name,when,steps,done|optional=forbid,askIf,haltIf,approval,risk,status,refs

record|type=runbook|required=name,scope,owner|optional=status,refs
record|type=workbook|required=name,phase,state|optional=status,refs
record|type=chain|required=step,command,expectExit|optional=status,refs
record|type=state|required=name,distTag,intent|optional=status,refs
record|type=transition|required=from,to,requires|optional=status,refs
record|type=promotion|required=from,to,requires|optional=status,refs
record|type=rollback|required=strategy,note|optional=status,refs
record|type=artifact|required=path,schema|optional=status,refs
record|type=config|required=key,default|optional=status,refs
record|type=cadence|required=rule|optional=status,refs
record|type=guardrail|required=id,level,directive,why|optional=status,refs
record|type=chat_feature|required=id,title,summary|optional=steps,status,refs

profile|name=core|requiredRecords=meta,ref,rule,check,decision,example,term,command,workflow
profile|name=runbook|requiredRecords=meta,ref,rule,check,decision,example,term,command,workflow,runbook,chain,artifact,state,transition,promotion,rollback,config,cadence,guardrail
profile|name=workbook|requiredRecords=meta,ref,rule,check,decision,example,term,command,workflow,workbook,state,transition,artifact,guardrail

defaults|omitOptional=true|omitEmpty=true|requiredFieldsExplicit=true
stop|criticalSecretRisk=true|destructiveUnapproved=true|policyConflictUnresolved=true
prompt|multiValidInterpretations=true|requiredApprovalMissing=true
warn|shouldViolation=true|lowRiskUncertainty=true
