# Why Use This Plugin

> This comparison describes Forge Desktop 0.2.179. It was verified against
> the OpenCode bootstrap, agents, and plugins bundled with that release.

This plugin is designed with the idea: **you own your configuration**.
Forge Desktop's bundled CLI modifies the OpenCode configuration directly,
which works when used through the Forge desktop terminal or the `forge`
command. This plugin makes the following customizations easier to retain.

1. **Disabling tools, MCPs, and plugins.**
   The bundled CLI also installs MCPs and other plugins
   that you might not want or use. For example:

   - Using the Context7 CLI and skill instead of its MCP server.
   - Using another TUI theme.
   - Disabling TUI sidebar elements.
   - Changing the configuration of bundled plugins.

2. **Customizing agents.**
   The bundled CLI ships with a set of custom agents and subagents
   for orchestration work and copies their configuration directly
   to the OpenCode config directory. You may instead want to:

   - Modify an agent prompt to experiment with different instructions.
   - Modify agent permissions.
   - Disable agents or add an experimental agent.

3. **Using other providers.**
   The bundled CLI sets `enabled_providers` to
   only the proxied OpenRouter provider, plus Ollama when Forge has discovered
   local models. This disables other providers you configured yourself, such
   as providers exposed by ChatGPT Codex, Claude Code, or GitHub Copilot.

Forge Desktop also ships a bundled OpenCode binary for its integrated
terminal—locking you to that version.

## What's Different

This plugin provides the core Forge integration through a smaller,
user-controlled configuration. Installing it adds
the line below to your `opencode.jsonc` and `tui.jsonc` plugins:

```json
"../../.local/share/forge/packages/opencode"
```

One line. All core features.

### Token Usage Tracking

Token usage and cost tracker per session was intentionally left out
as that feature can be expensive to calculate since it crawls through all
sessions and possibly each message in a session.

Instead, your [daily usage balance](features.md#usage-balance)
is displayed in the TUI.

### Subagent Progress

The bundled subagent progress relay depends on hardcoded and repeated
instructions from the subagent prompts so the models explicitly print
plain text of a specific format in the conversation. To display this,
we have to loop through each message per subagent spawned to find that string.

That approach is fragile and can be expensive to calculate for little benefit.

This plugin implements it differently by using OpenCode's built-in
`todowrite` tool—which is disabled for subagents by default. We re-enable this
tool and inject a short instruction on the subagent system prompts at runtime
to call this tool.

The todo list for each session is stored as metadata by OpenCode, removing
the need to go through messages to find a string. Exposing this as a tool
call also gives input validation to ensure the model uses proper syntax,
instead of relying on plain text strings.
