# Raw evidence recovery

The ordinary/diagnostic output is preserved byte-for-byte in the ordered chunks listed by `RAW-MANIFEST.json`. Each chunk is below 900 KB for connector recovery. Repeated compiled assets are stored once inside the tar using hardlinks; every original path/content hash remains in the manifest.

From a restored analysis checkout run the shared `oct8/restore-evidence.py` with this manifest path and the `resumed` directory as destination. It verifies every chunk, the complete compressed archive and each restored file. It refuses to overwrite different existing bytes. Results and source boundaries remain in the adjacent reports; archived failed/partial runs are not acceptance.
