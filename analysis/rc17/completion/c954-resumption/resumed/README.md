# Work resumed after the recovery bank

The user resumed work after verified analysis checkpoint `801829695f5f5956b1fac137c2e4e77b54c4dfb7`. The selected implementation baseline remains c954 / build #54; excluded 508 / build #55 is not inherited.

Current verified source successor: **`f01072674c044f39badc5e5e56c0c3d676621c07`**, on `refactor/rc17-c954-continuation-v0.8.0`, internal draft PR #11. It combines [the native administrative timer correction](admin/README.md) banked at 9331b19 and [the dataset rollback correction](updater-rollback.md). Source and analysis are banked separately; inspect the newest verified heads when recovering.

The updater correction uses an external per-UUID rejection marker that survives partial recursive cleanup and is retired only after the failed directory is absent. Independent review, 93 focused tests and the [951-test integrated type/build gate](integrated-correctness-1/verification-completed.json) pass. It is included in f010726, not in 9331b19. The fresh combined source/build fingerprint is `47d9d44d087be3e85c08372503b4af0cd2fad88cc8ef53fec86fa5da90beb73e`; 482 source files and 20 freshly built client assets. A receipt-writing filename collision is retained and reconciled explicitly; the successful commands were not rerun.

[The M9 proposal](maps-m9/PROPOSAL.md) is isolated from c954 and not adopted. Independent source review found no material bug; semantic tests and source-pinned payload/count/timing gates remain required. Incomplete earlier trials retain their status.

Every other finding and final gate remains governed by the four c954 traces plus later source-bound evidence. No clean RC17, merge or release is prepared. PR #10 remains withdrawn and unchanged.
