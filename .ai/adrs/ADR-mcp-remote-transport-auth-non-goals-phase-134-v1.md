# ADR: MCP Remote Transport and Auth Non-Goals for Phase 134

**Status:** Accepted  
**Date:** 2026-06-22  
**Task:** T100732  
**Phase:** 134  
**Supersedes:** N/A  
**Related:** `.ai/adrs/ADR-mcp-adapter-boundary-v1.md`

## Context

Phase 134 introduces a Model Context Protocol (MCP) layer for Workflow Cannon. The adapter boundary ADR (`ADR-mcp-adapter-boundary-v1.md`) establishes that MCP is a read-only-first adapter alongside the CLI — not a CLI replacement. That ADR defers transport and auth architecture questions to a future phase. This ADR makes those deferrals explicit as named non-goals so agents, contributors, and future reviewers cannot accidentally treat them as in-scope.

MCP supports multiple transport mechanisms. The two most relevant are:

- **stdio transport** — process-level, local only, no network exposure. Supported and required for Phase 134.
- **Streamable HTTP / SSE transport** — network-capable, requires auth, TLS, and server-side infrastructure. Out of scope for Phase 134.

Remote or networked MCP transports require:

- a running HTTP server (or managed host)
- authentication (OAuth 2.0, API keys, or similar)
- TLS and connection lifecycle management
- trust and workspace-binding logic for multi-user or multi-host scenarios
- audit-log coverage of who connected and what was exposed

None of these are designed or implemented in Phase 134. Adding any of them without deliberate security design would create an unauthenticated or minimally-protected remote access surface over Workflow Cannon task state, package metadata, memory, CAE guidance, and policy artifacts.

## Decision

Remote MCP transport and authentication are explicitly out of scope for Phase 134.

The Phase 134 MCP implementation is **local-only via stdio transport**. This means:

- The MCP server runs as a child process launched by the agent host (e.g., Cursor).
- Communication is via stdin/stdout only — no socket, no HTTP listener, no bound port.
- No auth layer is implemented or required at the MCP adapter level; process-level trust is inherited from the agent host.
- No TLS, no OAuth, no API-key management, no session tokens.

## Explicit Non-Goals for Phase 134

The following are **named non-goals**. They may be considered in a future phase after deliberate security, infrastructure, and trust design — but they are not permitted to land in Phase 134 without a new ADR and explicit maintainer approval.

| Non-goal | Why deferred |
| --- | --- |
| Streamable HTTP or SSE MCP transport | Requires auth, TLS, and server infrastructure not designed this phase |
| OAuth 2.0 or any bearer-token auth for MCP | No identity provider, token issuer, or revocation infrastructure |
| API-key issuance or management for MCP access | No secret management layer or rotation policy exists yet |
| Hosted or cloud-exposed MCP endpoint | No multi-tenant isolation, workspace-binding proof, or rate-limiting |
| MCP over WebSocket | Same network exposure risks as HTTP; no protocol hardening done |
| Multi-user or multi-host workspace sharing via MCP | No access control model; workspace trust is single-operator today |
| Remote mutation over MCP | Mutation non-goal per adapter boundary ADR plus transport non-goal here |

## Transport Scope (Phase 134)

Phase 134 supports exactly one MCP transport:

```
stdio (local, process-level, no network)
```

The server MUST:

- accept connections only via stdio (stdin/stdout)
- not bind to any network interface, port, or socket
- not implement or accept any auth handshake
- not attempt to contact external identity providers
- reject or ignore any transport-level capability negotiation that implies network/auth extension

Any configuration surface (environment variables, config files, server options) MUST NOT expose a flag, option, or undocumented path that enables a non-stdio transport without failing visibly and explicitly.

## Safeguards Against Accidental Enablement

The following implementation guardrails prevent accidentally enabling remote or unauthenticated transport during Phase 134:

1. **No HTTP server startup code.** The MCP adapter must not import, instantiate, or configure an HTTP server in the Phase 134 implementation. If an HTTP dependency is pulled transitively, it must not be initialized in the MCP server path.
2. **No port-binding or socket-listen calls.** Any call to `listen()`, `bind()`, or equivalent must be absent from MCP server startup.
3. **Capabilities declaration must not advertise transport extensions.** The server capabilities response must not list SSE, HTTP, WebSocket, or auth negotiation as supported.
4. **Startup failure on unknown transport config.** If a transport option other than stdio is passed, the server must fail fast with a clear error and reference this ADR.
5. **No credential handling.** The MCP server must not read, store, or forward API keys, bearer tokens, OAuth codes, or session identifiers.
6. **Documentation must state local-only scope.** MCP setup docs and README sections must explicitly state that only stdio transport is supported in Phase 134 and that remote transport requires a future security design.

## Agent Instruction Alignment

Agent-facing MCP context (cursor rules, generated prompts, `.ai/MCP-SETUP.md`) must not imply or suggest remote MCP connectivity as a configuration option for Phase 134. Instructions must say:

```
Workflow Cannon MCP runs via stdio transport (local, process-level).
Remote transport is not supported in Phase 134.
No auth configuration is required or available.
```

If an agent host expects a remote endpoint or auth configuration, the setup doc must instruct the operator to use stdio transport configuration instead, not to attempt to point the host at a network address.

## Consequences

- Phase 134 MCP ships with no network exposure surface.
- Operators cannot accidentally configure a remotely accessible Workflow Cannon MCP endpoint using Phase 134 artifacts.
- Future remote transport work requires a new ADR covering security design, auth architecture, TLS, workspace-binding proof, multi-user trust, audit coverage, and rate-limiting before any transport other than stdio can be enabled.
- This restriction is intentionally conservative: it is easier to add transport scope later than to retract an exposed, minimally-secured remote endpoint.

## Acceptance Mapping

| Acceptance criterion | ADR coverage |
| --- | --- |
| Transport scope is explicit. | Transport Scope section; Decision |
| Remote/network transports cannot be accidentally enabled without security design. | Safeguards Against Accidental Enablement; Explicit Non-Goals |
| Docs match supported transports. | Agent Instruction Alignment; Consequences |
