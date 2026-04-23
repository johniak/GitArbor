# Contributing to GitArbor

Thanks for your interest in contributing. GitArbor is a small project and
we keep the contribution flow simple.

## Ground rules

- Be respectful. We follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
- Open an [issue](https://github.com/johniak/gitarbor/issues) before starting
  on a non-trivial change, so we can agree on direction.
- Keep pull requests focused. One logical change per PR.

## Local setup

**Prerequisites:** [Bun](https://bun.sh/), [Node.js](https://nodejs.org/), Git.

```bash
git clone https://github.com/johniak/gitarbor.git
cd gitarbor
bun install
bun run start
```

## Before you submit

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run test:e2e    # optional for small changes
```

All checks must pass. New features should ship with tests.

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] Commits are small and well-described
- [ ] `format` / `lint` / `typecheck` / `test` all pass
- [ ] New features include tests
- [ ] README / docs updated if behavior changed

## Reporting bugs

Open an issue with: your OS, GitArbor version, steps to reproduce,
expected vs actual result. Include logs if the app crashed.

## Security

If you think you've found a security issue, please email romaniak.jan@gmail.com
rather than opening a public issue.
