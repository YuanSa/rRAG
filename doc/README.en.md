# rrag

English | [简体中文](README.zh-CN.md)

## Quick Start

```bash
rrag init
rrag update "Beam search should keep traversal branch budgets small."
rrag update --apply
rrag update --review
rrag update --merge
rrag ask "How should traversal branch budgets be controlled?"
```

## Main Commands

```bash
rrag update "<text>"
rrag update --file <path>
rrag update --apply
rrag update --review
rrag update --merge
rrag ask "<question>"
rrag ask --explain "<question>"
rrag rebuild [--dry-run]
rrag init
rrag config show
rrag config set <key> <value>
rrag config --file <path>
rrag status
rrag runs [limit]
rrag resume <run_id>
rrag clear
rrag delete <skill_id>
```

## Notes

- Runtime data defaults to `~/.rrag`
- Override with `RRAG_HOME=/some/path`
- The runtime data directory is managed as its own git repository
- `ask_no_answer_behavior` supports `error`, `reply`, and `empty`

## More

- [Chinese README](README.zh-CN.md)
- [Spec](spec.md)
- [Example test cases](../examples/test-cases/README.md)
