# Adapters

Adapters provide external integration boundaries for IO/providers.

Initial adapter categories:

- filesystem
- sqlite
- github
- ai model/provider

Adapters are wired through core services; they should not depend on modules.
