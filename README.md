# Forge

A tool to integrate the [**Humanforce Forge**](https://forgeworkspace.dev)
desktop app with the [**OpenCode**](https://opencode.dev) harness.

For the difference between the bundled Forge CLI and this tool,
see [this document](docs/why.md).

## Features

Use Forge models, MCP tools, subagents, and commands directly in OpenCode.

See [Features](docs/features.md) for additional capabilities and improvements.

## Installation

Ensure the following requirements are met:

- Humanforce Forge desktop, running and signed in.
- OpenCode 1.18 or newer.
- Bun is recommended, but not required.

Clone the repository and install dependencies.

```sh
# This path is preferred, but you can choose another location.
git clone https://github.com/gerardthehuman/forge.git ~/.local/share/forge
cd ~/.local/share/forge
BUN_BE_BUN=1 opencode install
```

Install the Forge OpenCode plugin and configuration.

```sh
BUN_BE_BUN=1 opencode forge install
```

To install the additional `websearch`, `gh_grep`, and `context7` MCP servers,
pass the `--mcp` flag.

```sh
BUN_BE_BUN=1 opencode forge install --mcp
```

To install [preset profiles](docs/features.md#preset-profiles),
pass the `--profiles` flag.

```sh
BUN_BE_BUN=1 opencode forge install --profiles
```

## Configuration

See [Configuration](docs/configuration.md).

## Troubleshooting

- **The installer reports an OpenCode version error:** upgrade OpenCode to 1.18 or newer and ensure `opencode` is available on `PATH`.
- **The handshake is missing or malformed:** start or restart the Forge desktop app.
- **Forge cannot be reached or is not signed in:** sign in to Forge, then restart OpenCode.
- **Configuration changes are not visible:** check that the installer and OpenCode use the same `OPENCODE_CONFIG_DIRECTORY`, then restart OpenCode. Profile changes specifically require a restart.
