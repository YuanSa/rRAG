export function formatHelp() {
  return `rrag

Usage:
  rrag update "<text>"
  rrag update --file <path>
  rrag update --apply
  rrag update --review
  rrag update --merge
  rrag ask "<question>"
  rrag rebuild [--dry-run]
  rrag resume <run_id>
  rrag runs [limit]
  rrag delete <skill_id>
  rrag clear
  rrag status
  rrag config set <key> <value>

Notes:
  - runtime data is stored under ~/.rrag by default
  - set RRAG_HOME to override the shared data directory
  - update "<text>" appends a text note into staging/
  - update --file copies a file or directory into staging/
  - update --apply creates or reuses an update branch, consumes staging/, and commits data changes
  - update --review shows the current branch diff against main in the data repo
  - update --merge merges the current update branch into main in the data repo
  - clear removes staging/, runs/, and archive/ under the shared data directory
`;
}
