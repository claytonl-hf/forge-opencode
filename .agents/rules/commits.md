# Commit Conventions

Commits should be logical and focused on one concern or intent.

A commit may include multiple files and does not need to deliver a complete feature on its own.
Avoid mixing unrelated work.

Use Conventional Commits:

```text
<type>(<scope>): <subject>
```

Prefer this small set of commit types:

| Type       | Use for                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| `feat`     | Adding or changing functionality or behavior.                                            |
| `fix`      | Correcting faulty or unintended behavior.                                                |
| `refactor` | Restructuring without intentionally changing behavior.                                   |
| `chore`    | Maintenance, tooling, setup, docs, tests, dependencies, or other non-functional changes. |

Scopes are encouraged when useful, but optional.

Choose the scope based on the **main domain or subsystem affected by the change**, not simply the
file being edited.

When choosing a scope:

- Prefer an existing scope already used by the repository.
- Prefer product or technical domains such as `auth`, `api`, `database`, `cli`, or `billing`.
- In monorepos, a package or workspace name is often the best scope.
- For infrastructure or tooling changes, use the relevant technology or subsystem such as `docker`,
  `eslint`, `github`, or `build`.
- Do not use filenames or overly specific implementation details as scopes.
- Do not create separate scopes for operating systems when the change belongs to a broader domain.
- If a change spans several files but serves one domain, use that domain as the scope.
- If a change is repository-wide or no single scope clearly fits, omit the scope.

Examples:

```text
feat(auth): add passkey login
fix(api): handle expired sessions
refactor(parser): simplify token handling
chore(deps): update dependencies
chore: update repository documentation
```

When composing commits:

- Group changes by intent, not merely by file or directory.
- Keep tightly related changes together.
- Separate unrelated concerns.
- Prefer commits that can be reviewed and understood independently.
