# Runtime-only hosting and release retention

## Promotion and recovery

1. Build and test outside the VPS in the source-light release artifact workflow.
2. Promote successful, same-repository CI artifacts through the manual **Preserve verified runtime candidate** workflow. Supply its successful run ID and the full source SHA. The resulting prerelease includes web, worker and realtime archives, source and run markers, and SHA256SUMS. It is not a production deployment certification.
3. Deploy only the needed archives after verifying their checksums and archive policy. Maintain the permanent application entry path, private environment configuration, database, media and backup storage separately.
4. Verify public API/database, worker/realtime and other required service health. Verify the compatible prior runtime set against the durable recovery archives. Do not use a live worker or production database to rehearse a rollback; use an isolated acceptance environment.
5. Write the root-owned 0600 retention manifest atomically only after deployment acceptance. Do not include credentials or customer information. Do not commit the real manifest.

## Manifest contract

The manifest contains a repository identifier, canonical release root, deployment lock paths, active service-to-runtime mapping, one coherent rollback revision with three component entries, explicitly reviewed superseded candidates and their successful CI run IDs, health URLs, required systemd units, reference paths and link roots. Every runtime entry contains its component, exact directory name and full source SHA; candidates may set durable=true when their matching preserved prerelease exists. An optional tracked_uploads map permits only individually reviewed, source-tracked immutable asset paths with exact SHA-256 values; unknown uploads are never eligible. A reviewed asset does not authorize accessing or deleting persistent media.

The deployed script is `scripts/prune-runtime-releases.py`. It defaults to dry-run. The operator or deploy hook may use `--apply` only with a verified private manifest. It refuses stale active service paths, unrecognized local files, source checkouts, active process/service/symlink/mount references, failed health checks and unrecoverable packages. Before removing an obsolete source-light directory, it downloads its exact GitHub recovery archive, verifies checksum and byte-compares files. It independently verifies the previous coherent rollback set. Logs record exact paths, allocated directory size and filesystem free-space change separately.

Use a local oneshot service to invoke this script after the verified deployment manifest is updated; if a deployment lock is busy, retry after the lock clears. Never override the deployment lock. The operator must refresh the manifest after every deployment, not reuse stale active or rollback entries. The script intentionally refuses source checkouts, legacy full tracing-root builds and unreviewed generated files: preserve and reconcile them separately. Keep the public repository free of private operations evidence.

## Testing

The Runtime retention safety tests workflow checks archive path traversal, unexpected local data, changed files, source checkout protection, compiled upload route separation and reviewed source-asset handling on Python 3.9. Recovery publication is independently verified by the promotion workflow. Neither workflow switches services or migrates a live database.
