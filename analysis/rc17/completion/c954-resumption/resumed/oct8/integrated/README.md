# Integrated accepted changes

Attempt 1 ran all 972 tests before the restored app had been built: 971 passed; the HTTP isolation homepage assertion received 404 instead of 200. That startup-page test requires dist/client/index.html (tests/kairo/contracts.test.mjs). No source fix or weakened assertion was made.

Attempt 2 ran type checking, a fresh build and all 972 tests. All passed with source hashes stable. Its tree 2d7b4ea was published as 985a6c1. The next Atlas integration and compiled replay evidence lives in ../../atlas-m7-9afa/integrated-attempt1. The canonical 227 source/build manifest here equals those tested bytes exactly, despite the later Git commit identity.

All failed and successful logs/receipts remain. Final combined performance and release acceptance are not claimed.
