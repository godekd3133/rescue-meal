# Docker daemon readiness readback

## Observation

The local Docker client can list the `desktop-linux` context, but the server
API does not complete a read-only request. The Unix socket exists at
`/Users/kimminkyu/.docker/run/docker.sock`; an HTTP `_ping` through that socket
timed out with zero bytes, and `docker info`/`docker version` did not return a
server version.

## Root-cause evidence

Read-only host/process probes found:

- `/Users/kimminkyu/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`
  is `994662416384` bytes (about 926 GiB).
- The macOS Data volume is at **96%** capacity with about **35 GiB** available.
- Docker Desktop `com.docker.backend` and `com.docker.virtualization` processes
  are present but idle at approximately 0% CPU while the API socket does not
  answer.
- The VM console log contains repeated ext4 journal and block write errors,
  including `I/O error, dev vda`, `Aborting journal`, `Buffer I/O error`,
  `Remounting filesystem read-only`, and dockerd failures writing container
  state, overlayfs directories, network state, and json-file logs.

This proves a Docker VM storage/write failure and read-only filesystem state.
It is not evidence that the Rescue Meal source or PostgreSQL migration is
incorrect.

## Safety boundary

No Docker container, image, volume, VM disk, or Docker Desktop state was
deleted, pruned, reset, or restarted. There are long-running Docker commands
owned by other local tasks, so they were not terminated either.

The safe recovery owner is the user/host operator: preserve any required Docker
data, reclaim or provision sufficient host storage, then use Docker Desktop's
own recovery/restart flow and re-run a bounded `_ping`, `docker info`, Compose
health, migration `001→025`, `/ready`, and normalized read/write smoke. Do not
run destructive cleanup merely to make this readback green.

## Current claim

Live PostgreSQL, Compose, OCR-worker Docker, and backup/restore evidence remain
unavailable in this environment until Docker's writable VM filesystem is
recovered. Local temporary mirror build/API/browser evidence remains valid and
is kept as a separate evidence lane.
