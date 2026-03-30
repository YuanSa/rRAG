export function formatHelp() {
  return `rrag

Usage:
  rrag update "<text>"
  rrag update --file <path>
  rrag update --apply
  rrag ask "<question>"
  rrag rebuild [--dry-run]
  rrag resume <run_id>
  rrag delete <skill_id>
  rrag status
  rrag config set <key> <value>

Notes:
  - update "<text>" appends a text note into staging/
  - update --file copies a file or directory into staging/
  - update --apply consumes the whole staging/ directory
`;
}
