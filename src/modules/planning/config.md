# Planning Module Config

Planning owns all former Ideas `workspace-kit run` commands (28 total). The deprecated module id `ideas` in `modules.enabled` / `modules.disabled` still aliases to `planning`; `workspace-kit doctor` warns when that alias is in effect — update config to use `planning` instead.

- `planning.defaultQuestionDepth`: interview depth mode (`minimal` | `guided` | `adaptive`; default `adaptive`)
- `planning.hardBlockCriticalUnknowns`: when `true`, `build-plan` finalize fails until critical unknowns are answered
- `planning.adaptiveFinalizePolicy`: adaptive follow-up finalize handling (`off` | `warn` | `block`; default `off`)
- `planning.rulePacks`: optional per-workflow question overrides (`baseQuestions`, `adaptiveQuestions`)
