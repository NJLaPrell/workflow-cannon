meta|v=1|doc=<manifest|rules|map|workflows|commands|decisions|glossary|observed|planned|checks>|truth=<canonical|observed|planned>|st=<active|deprecated|draft>

syntax|rec=one_per_line|sep=||kv==|list=,|seq=>|all=+|bool=true,false
ids|rule=R[0-9]{3,}|wf=W[0-9]{3,}|cmd=C[0-9]{3,}|decision=D[0-9]{3,}|observed=O[0-9]{3,}|planned=P[0-9]{3,}|check=K[0-9]{3,}
sem|lvl=must,must_not,should,may|risk=low,medium,high,critical|ap=none,prompt,required|act=auto,warn,prompt,stop
author|meta_first_once=true|one_fact_per_record=true|exceptions_inline=true|no_vague_directives=true|observed_ne_rule=true|planned_ne_rule=true|stable_order=true

project|name=<name>|type=<type>|scope=<scope>
stack|<key=value>...
prio|<p1>><p2>><p3>...
truth|order=<t1>><t2>><t3>><t4>
ref|name=<name>|path=<path>

rule|<RID>|<lvl>|<scope>|<directive>|unless=<cond>|also=<list>|risk=<risk>|ap=<ap>|ov=<act>|st=<st>|refs=<list>
path|<path>|role=<role>|has=<list>|xhas=<list>|deps=<list>|xdeps=<list>|check=<list>|st=<st>|refs=<list>
module|<name>|role=<role>|owns=<list>|deps=<list>|xdeps=<list>|entry=<list>|tests=<list>|st=<st>|refs=<list>

wf|<WID>|name=<name>|when=<trigger>|do=<s1>><s2>><s3>|done=<d1>+<d2>|forbid=<list>|ask_if=<cond>|halt_if=<cond>|ap=<ap>|risk=<risk>|st=<st>|refs=<list>
cmd|<CID>|name=<name>|use=<command>|scope=<scope>|expect=<result>|risk=<risk>|st=<st>
decision|<DID>|topic=<topic>|choice=<choice>|why=<reason>|then=<consequence>|st=<st>|refs=<list>
term|<name>|def=<definition>|st=<st>

observed|<OID>|scope=<scope>|fact=<fact>|evidence=<evidence>|risk=<risk>|st=observed|refs=<list>
planned|<PID>|scope=<scope>|target=<target>|why=<reason>|st=planned|refs=<list>
check|<KID>|scope=<scope>|assert=<assertion>|when=<cond>|on_fail=<act>|st=<st>|refs=<list>

order|manifest=meta,project,stack,prio,truth,ref
order|rules=global,risky,scoped,workflow,style
order|map=roots,major,special,legacy
order|workflows=common,risky,edge,clarify

defaults|omit_optional=true|omit_empty=true|lvl_explicit=true|scope_explicit=true|directive_explicit=true
stop|critical_secret_risk=true|destructive_unapproved=true|policy_conflict_unresolved=true
prompt|multi_valid_interpretations=true|required_approval_missing=true
warn|should_violation=true|low_risk_uncertainty=true

directive|good=add_migration,preserve_backward_compatibility,contain_business_logic,commit_secrets,manual_edit
directive|bad=best_practices,clean_code,good_design,keep_it_simple,do_the_right_thing
scope|good=repo,src/api,src/domain,public_api,schema_changes,behavior_change
scope|bad=general,misc,various,important_stuff
