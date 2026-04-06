export function formatHelp() {
  return `rrag

Usage:
  rrag update "<text>"
  rrag update --file <path>
  rrag update --apply
  rrag update --review
  rrag update --merge
  rrag ask "<question>"
  rrag ask --explain "<question>"
  rrag gui [--host <host>] [--port <port>]
  rrag rebuild [--dry-run]
  rrag init
  rrag resume <run_id>
  rrag runs [limit]
  rrag delete <skill_id>
  rrag clear
  rrag status
  rrag config set <key> <value>
  rrag config show
  rrag config --file <path>

Notes:
  - runtime data is stored under ~/.rrag by default
  - set RRAG_HOME to override the shared data directory
  - update "<text>" appends a text note into staging/
  - update --file copies a file or directory into staging/
  - update --apply creates or reuses an update branch, consumes staging/, and commits data changes
  - update --review shows the current branch diff against main in the data repo
  - update --merge merges the current update branch into main in the data repo
  - ask prints only the final answer by default; add --explain to include retrieval and evidence details
  - ask no-answer behavior is configurable via ask_no_answer_behavior=error|reply|empty
  - gui starts a React + Semi browser console for ask/update/review/merge/status workflows
  - init runs an interactive setup only; existing config values become defaults, and fresh setups use recommended defaults
  - config --file loads an existing JSON config file into the shared data directory
  - clear removes staging/, runs/, and archive/ under the shared data directory
`;
}
