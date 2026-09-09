seek-bzip 2.0.0, MIT. Decoder files from https://registry.npmjs.org/seek-bzip/-/seek-bzip-2.0.0.tgz
Upstream: https://github.com/cscott/seek-bzip
Local compatibility change: numeric `new Buffer(n)` allocations use `Buffer.alloc(n)` for Node 24.
Only the decoder and license are bundled; the command-line utility is not used.
