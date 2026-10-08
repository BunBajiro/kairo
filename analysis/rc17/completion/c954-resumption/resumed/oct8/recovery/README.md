# Analysis workspace recovery — 8 October 2026

The analysis workspace is bound to exact GitHub commit `c4ee543379e99a37c8f7fe077bf138f93789b1ee`, tree `f9989c36297466832facd71ab4d6d54a7d6a7331`. All 2,025 present tracked files match their Git blob SHA; there are no mismatches. Code, harnesses, current completion documents and the complete M9/F7 archive are recovered. The M9/F7 archive was verified and every member extracted and checked against the saved byte-length/SHA-256 manifest.

Recovery is partial: four older diagnostic gzip blobs remain absent locally because the available text/blob transport cannot retrieve their binary content above 1 MiB. The adjacent receipt lists exact paths, hashes and sizes. Their remote GitHub objects remain banked. Do not claim full recovery or replace them with placeholders. Their index entries are marked skip-worktree so ordinary staging does not delete them; the canonical tree still references the original SHAs.

Use `git write-tree --missing-ok` when freezing new local analysis checkpoints until those objects are restored. Publish the complete new tree through GitHub, retaining the missing historical entries unchanged. A normal git push cannot supply the missing objects from this partial clone. Local history has an explicit shallow boundary at the recovered commit. No new work paths were overwritten. Source checkout recovery is separate.

Raw extracted M9/F7 files are already banked in the archive; avoid adding duplicates. Use explicit evidence paths when staging new work.
