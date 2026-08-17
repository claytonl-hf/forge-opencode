# Features

This plugin ships with the following core features.

## Usage Balance

Forge recently introduced daily credit usage caps.
This plugin displays it in the TUI.

## Notifications

When an OpenCode session becomes idle, this plugin
notifies Forge so it can show a native desktop notification.

## Web Bridge

Run `/forge:web` from an OpenCode session to open that session in Forge's
embedded web interface. Forge starts or reuses the appropriate OpenCode server
and navigates to the current session and working directory.

## Model Profiles

Forge currently only allows you to assign one model
per agent in its settings. This plugin allows you to
assign multiple ones. For example, you might want:

- A default profile for normal use.
- A "budget" profile with models that are low cost
  for when you are almost out of usage credits.
- An experimental profile for you to try out models
  on specific roles, without changing your default.

Profiles are not limited to Forge agents, you can
assign models to other custom agents or built-in roles
such as for title generation or compaction.

> See [Configuration](configuration.md#model-profiles)
> for more information.

Switch between profiles by using the `/forge:profile`
command in the TUI. It will open a dialog for you to
select or edit a profile.

### Preset Profiles

This plugin also has preset profiles you can install by passing
the `--profiles` flag in the install command. The profiles are:

- **Bedrock** - Models from AWS Bedrock
- **Pareto** - Best intelligence for the cost
- **Lite** - Fast and low-cost models

## Worker Progress

This plugin adds a collapsible sidebar panel for tracking
the progress of the subagents spawned during the session.
