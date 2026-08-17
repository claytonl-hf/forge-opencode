# Configuration

You are free to customize OpenCode as you wish. Add plugins, MCPs,
custom agents, or change model preferences.

You can also customize how the Forge plugin behaves by creating or
updating the `forge.jsonc` file inside your OpenCode config directory,
in `~/.config/opencode`.

```jsonc
{
  // Adds the Forge subagents with your selected models
  // from Forge desktop > Settings > Subagent models.
  //
  // Change to `false` to disable Forge subagents.
  //
  // Or, pick which agents you want by passing an array:
  // `["lead", "code", "review"]`
  "agents": true,
}
```

## TUI Customization

You can control which TUI elements would be installed and shown.

```jsonc
{
  "tui": {
    // Enable or disable the Forge TUI theme.
    "theme": true,

    // Notify Forge when a session becomes idle. This is useful
    // only in the Forge Desktop terminal and is disabled by default.
    // Notifications are skipped when that session is visibly focused.
    "notify": false,

    // Enable or disable TUI components.
    // Set to `true` to enable all.
    // Set to `false` to disable all.
    // Or, use an object to configure which ones to keep.
    "components": {
      // Replace the OpenCode banner in the home
      // screen with "Forge by Humanforce".
      "logo": true,

      // Display your daily Forge balance on the home
      // screen and in the Forge sidebar section.
      "usage": true,

      // Display an action that opens the current session
      // in Forge's embedded browser.
      "web": true,

      // Display a collapsible list of the progress
      // of all subagents in the current session.
      "workers": true,
    },
  },
}
```

The Forge Desktop terminal can enable notifications for its OpenCode process by
setting `FORGE_OPENCODE_NOTIFY=1`. This overrides `tui.notify: false`.

## Model Profiles

Configure model profiles to switch between.

```jsonc
{
  // Set the global profile for new sessions.
  // Remove to not apply any profile.
  // Set to `"default"` to use the models set from the
  // Forge desktop settings.
  "profile": "default",

  "profiles": {
    "my-profile": {
      // The display name used for the profile
      "name": "My Profile",

      // A short description for what the profile is
      "description": "My personal model list",

      // Set models per role or agent.
      // Each entry supports an `id` and `variant`.
      "models": {
        // Default model for agents and tasks without
        // a model configured.
        "$default": {
          "id": "openai/gpt-5.6-terra",
          "variant": "high",
        },

        // Model for utilities such as title generation.
        "$small": {
          "id": "openai/gpt-5.6-luna",
          "variant": "low",
        },

        // Set model for any agent, use the agent name as key
        "lead": {
          "id": "anthropic/claude-opus-5",
          "variant": "medium",
        },
        "explore": {
          "id": "deepseek/deepseek-v4-flash-0731",
          "variant": "low",
        },
      },
    },
  },
}
```
