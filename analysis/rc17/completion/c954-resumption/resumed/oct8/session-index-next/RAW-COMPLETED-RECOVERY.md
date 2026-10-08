# Completed raw evidence recovery

Use `oct8/restore-evidence.py RAW-COMPLETED-MANIFEST.json RESUMED_DIRECTORY` from the restored analysis checkout. The manifest pins every ordered chunk, the complete gzip archive and every original file. Recovery refuses to overwrite different bytes. Failed attempts are retained and do not become acceptance merely by being archived.
