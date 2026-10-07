# Raw evidence backup

This checkpoint preserves 25 previously untracked originals larger than 500,000
bytes: 88,348,890 raw bytes stored as 6,989,553 bytes of lossless gzip data. The
original local files remain unchanged. Their larger uncompressed copies should
not be added to the publication commit; the manifest maps each original path to
its content-addressed archive under `banked-raw/`.

The backup preserves historical evidence from multiple source variants. It does
not turn those results into acceptance evidence for the selected source,
`c954c0d808847f249df0659ed15fdce2e89f84c4` (test build #54). Build #55,
`508f2d450c7cc17cc464cf316b80748367adc9e2`, is excluded from the candidate. Read
each result's existing source/harness manifests and the accompanying resumption
trace documents before using a measurement. Historical result contents and
provenance have not been edited or relabeled by this backup.

`banked-raw-manifest.json` records each original repository-relative path, raw
SHA-256 and size, archive path, compressed SHA-256 and size. Its own SHA-256 is
recorded in `banked-raw-manifest.sha256`. Archive names use the raw SHA-256. Gzip
headers have a fixed zero timestamp; no original filename is embedded.

From the repository root, verify the manifest and every compressed and restored
byte stream without writing originals:

```sh
python analysis/rc17/completion/c954-resumption/restore-banked-raw.py --verify
```

Restore original paths into a fresh checkout:

```sh
python analysis/rc17/completion/c954-resumption/restore-banked-raw.py --restore
```

An optional `--destination /absolute/path/to/recovery` restores the same
repository-relative paths elsewhere. The script verifies all archives before
writing, skips existing byte-identical originals, and refuses to overwrite
different files. Neither restoration nor verification changes Git's index.

The manifest and gzip files must be retained together. The checksum file detects
accidental manifest changes; it is not a signature or an independent attestation.
