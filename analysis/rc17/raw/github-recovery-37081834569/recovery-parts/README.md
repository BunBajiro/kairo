# Internal RC17 bundle download

Download and extract the bundle manifest artifact and every numbered part
artifact into one directory. Each numbered part is at most 30 MiB, keeping
individual downloads below the transfer limit. The parts are pieces of one
tar.gz archive, not independently extractable archives.

Run `python3 reassemble-bundle.py /absolute/path/to/that/directory`. The helper
checks each part's size/SHA-256 and the complete archive's size/SHA-256 before
publishing it. Extract the resulting tar.gz, then run the internal
`verify-bundle.py` inventory check. `parts.json` lists the required part count,
names and hashes. No part or failed original run is silently omitted.
