# Planning Module Config

- `planning.defaultQuestionDepth`: interview depth mode (`minimal` | `guided` | `adaptive`; default `adaptive`)
- `planning.hardBlockCriticalUnknowns`: when `true`, `build-plan` finalize fails until critical unknowns are answered
- `planning.adaptiveFinalizePolicy`: adaptive follow-up finalize handling (`off` | `warn` | `block`; default `off`)
- `planning.rulePacks`: optional per-workflow question overrides (`baseQuestions`, `adaptiveQuestions`)
