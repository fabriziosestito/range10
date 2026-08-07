#!/bin/zsh

set -euo pipefail

root_dir="${0:A:h:h}"
snapshot_dir="$(mktemp -d "${TMPDIR:-/tmp}/range10-ios.XXXXXX")"

restore_generated_files() {
  local tracked_file

  if [[ -f "$snapshot_dir/files" ]]; then
    while IFS= read -r tracked_file; do
      mkdir -p "$root_dir/${tracked_file:h}"
      cp -p "$snapshot_dir/$tracked_file" "$root_dir/$tracked_file"
    done < "$snapshot_dir/files"
  fi

  rm -rf "$snapshot_dir"
}

trap restore_generated_files EXIT INT TERM HUP

mkdir -p "$snapshot_dir/src-tauri/gen/apple"
git -C "$root_dir" ls-files "src-tauri/gen/apple" > "$snapshot_dir/files"

while IFS= read -r tracked_file; do
  mkdir -p "$snapshot_dir/${tracked_file:h}"
  cp -p "$root_dir/$tracked_file" "$snapshot_dir/$tracked_file"
done < "$snapshot_dir/files"

cd "$root_dir"
npx tauri ios "$@"
