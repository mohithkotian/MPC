# ADR 0009: Historical sample-binary exposure

## Status

Pending licensing and publication approval. No Git history has been rewritten.

## Established evidence

- Commit `31723a4e437096462987700034120cc1506e3b87` introduced 26 MP3 binaries under `server/storage/samples/`.
- The current working tree proposes deletion of all 26 files; no replacement audio binaries are present.
- The public GitHub repository currently has no declared license.
- The repository is public, but the exact date and scope of historical public or collaborator access to the binaries have not been established.
- The original asset licenses, permissions, provenance, and intended distribution rights are unknown.
- Removing files from the current tree does not remove them from existing Git objects, clones, forks, caches, or downloaded archives.
- No commit, push, repository-visibility change, or history rewrite has been performed.

## Evidence required before publication

1. Identify the source and rights holder for each historical audio asset, or document that the asset was created or licensed for redistribution.
2. Obtain written license or permission records covering repository distribution and the intended MPC deployment.
3. Establish, where possible, the repository visibility and collaborator/access history during the period in which the binaries were reachable.
4. Determine whether any public forks, clones, releases, caches, or deployment artifacts contain the assets.
5. Obtain an explicit owner decision on whether the evidence supports continued public distribution or requires history cleanup.

## Options and consequences

### Option A: Retain history after licensing clearance

This is acceptable only if every asset has documented permission for the historical and intended distribution scope. The current-tree deletions should still remain if runtime samples are supplied through authorized private storage.

### Option B: Approved Git-history cleanup

If licensing cannot be established or public distribution was unauthorized, prepare a reviewed history rewrite that removes the binaries from all relevant refs. Before execution, preserve an audit backup, identify all collaborators and forks, coordinate the force-push and downstream reclone instructions, rotate any affected credentials, and obtain explicit authorization. History cleanup does not retract copies already cloned or downloaded.

### Option C: Change repository visibility

Making the repository private may reduce future exposure but does not remediate existing clones, forks, caches, or historical objects. It must not be treated as a substitute for licensing review or approved history cleanup.

## Recommendation

Do not claim licensing clearance or production readiness. Keep the 26 binaries removed from the proposed release, freeze publication until licensing evidence is collected, and choose Option A or B through an explicit owner decision. If licensing remains unknown, Option B is the safest technical remediation, but it requires separate authorization and coordinated impact handling; do not execute it automatically.

## Scope boundary

This ADR is documentation only. It does not authorize a repository visibility change, Git-history rewrite, force-push, takedown request, or deletion of data outside the current working tree.
