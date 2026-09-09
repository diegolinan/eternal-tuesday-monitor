# Surface-specific behavioral reproduction protocols v1

## Purpose

These protocols turn a reviewed public lead into a controlled behavioral reproduction plan. A public report remains a lead. It cannot create a PASS or FAIL, and a reproduction result cannot be transferred to another model, product, surface, version or authentication mode.

This phase defines and validates the protocols. It does not run the four pending cases, accept evidence or enable automatic execution.

## The exact test coordinate

Every accepted result must name all six coordinates:

1. vendor;
2. exact model;
3. product;
4. product surface;
5. product or client version;
6. authentication mode.

If one coordinate is unknown, the result is not ready for execution or promotion. A newer model with a similar name is not a substitute. In particular, Fable 5.1 cannot stand in for a report that names Fable 5.

## Where a protocol may run

| Protocol                                         | Execution location                                                               | Boundary                                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Provider API                                     | Hosted server                                                                    | Valid only for the named API endpoint and returned model. It says nothing about a consumer, terminal, editor or desktop product. |
| Headless terminal agent                          | Hosted server, if the exact product binary and authentication mode are available | Must execute the actual terminal product. Calling the underlying model API is not equivalent.                                    |
| IDE extension                                    | Controlled interactive host                                                      | Must use the named editor integration and retain visible UI/session evidence. A headless terminal run is not equivalent.         |
| Desktop application                              | Controlled interactive host                                                      | Must use the signed-in desktop application and retain continuous UI/session evidence. A terminal or API run is not equivalent.   |
| Authenticated product UI or vendor cloud session | Vendor cloud or controlled interactive host                                      | Must preserve the exact conversation, memory, project or resumed-session semantics named by the claim.                           |

Claude Code officially supports headless terminal execution with `claude -p`, structured output and CI usage. Its VS Code integration is a distinct graphical surface, while Desktop is an interactive application; the Desktop documentation does not expose an equivalent scripting interface. Those product boundaries are why the protocols do not transfer results between surfaces.

Official references:

- [Claude Code headless mode](https://code.claude.com/docs/en/headless)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)
- [Claude Code IDE integrations](https://code.claude.com/docs/en/ide-integrations)
- [Claude Code on desktop](https://code.claude.com/docs/en/desktop)
- [Claude Code platforms](https://code.claude.com/docs/en/platforms)
- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)

## Minimum evidence package

Every trial retains:

- the exact executable, application, editor and extension versions that apply;
- the visible or returned exact model identity;
- the authentication mode, without retaining a credential;
- the operating system, architecture and relevant time-zone state;
- the complete prompt, supplied state and input-file hashes;
- the complete structured transcript or continuous screen capture;
- output-file hashes, timestamps, session identifiers and exit state;
- the deterministic oracle output for each named probe.

Terminal, editor, desktop and authenticated-product claims require three independent sessions from clean or deliberately specified resumed state. The provider API protocol retains its existing deterministic single-run minimum. Operational failures remain `NOT_EVALUABLE`; they are never converted into behavioral FAIL.

## Current reviewed leads

The machine-readable plan is [`data/evidence-discovery/reproduction-targets.json`](../data/evidence-discovery/reproduction-targets.json).

| Lead                                      | Exact target                               | Route                                         | Current blocker                                                                |
| ----------------------------------------- | ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Stale readiness from persistent memory    | Fable 5, Claude Code terminal conversation | Hosted server with the exact terminal product | Provision protected subscription OAuth; the report's auth mode is undisclosed. |
| Prior transcripts or memory not consulted | Opus 5, Claude Code Desktop                | Controlled interactive host                   | Record the application version and authentication mode used by the new run.    |
| Prior transcripts or memory not consulted | Fable 5, Claude Code Desktop               | Controlled interactive host                   | Record the application version and authentication mode; do not substitute 5.1. |
| Answered directives treated as pending    | Fable 5, Claude Code VS Code extension     | Controlled interactive host                   | Requires the actual signed-in extension and exact model.                       |
| Past event re-dated after midnight        | Opus 5, Claude Code Desktop                | Controlled interactive host                   | Requires the actual signed-in desktop application across the time boundary.    |

## Promotion boundary

Execution is human-started. A completed run produces a reviewable evidence package, not an accepted observation. Promotion still requires a separate human decision that checks exact coordinates, artifacts, oracle output and independence of the required trials. Automatic execution and automatic evidence acceptance remain disabled.

The executable and interactive preparation packages are documented in [the reproduction runbooks](reproduction-runbooks-v1.md).
