from __future__ import annotations

import argparse
import concurrent.futures
import json
import statistics
import time
import urllib.error
import urllib.request


def timed_request(method: str, url: str, token: str, payload: dict | None, idem_key: str | None) -> tuple[float, int]:
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if idem_key:
        req.add_header("Idempotency-Key", idem_key)
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:
        exc.read()
        status = exc.code
    except Exception:
        status = 0
    return (time.perf_counter() - start) * 1000, status


def percentile(samples: list[float], pct: float) -> float:
    ordered = sorted(samples)
    if not ordered:
        return 0.0
    rank = max(0, min(len(ordered) - 1, round((pct / 100) * (len(ordered) - 1))))
    return ordered[rank]


def summarize(results: list[tuple[float, int]], expected_status: int) -> dict:
    latencies = [ms for ms, _ in results]
    errors = sum(1 for _, status in results if status != expected_status)
    return {
        "count": len(results),
        "errors": errors,
        "min_ms": round(min(latencies), 1) if latencies else 0,
        "p50_ms": round(statistics.median(latencies), 1) if latencies else 0,
        "p95_ms": round(percentile(latencies, 95), 1),
        "max_ms": round(max(latencies), 1) if latencies else 0,
    }


def run(args: argparse.Namespace) -> dict:
    base = args.base.rstrip("/")
    token = args.token
    report: dict = {"base": base}

    # Phase 1: sequential read baseline on the dashboard read model.
    seq = [timed_request("GET", f"{base}/api/dashboard", token, None, None) for _ in range(args.sequential_reads)]
    report["sequential_read"] = summarize(seq, 200)

    # Phase 2: concurrent read fan-out.
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.read_workers) as pool:
        conc = list(pool.map(
            lambda _: timed_request("GET", f"{base}/api/dashboard", token, None, None),
            range(args.concurrent_reads),
        ))
    report["concurrent_read"] = summarize(conc, 200)

    # Phase 3: concurrent write path through the normalized inventory mutation.
    def create(i: int) -> tuple[float, int]:
        return timed_request(
            "POST",
            f"{base}/api/foods",
            token,
            {
                "canonical_name": f"Perf Smoke Food {i}",
                "quantity": 1,
                "unit": "개",
                "storage_type": "refrigerated",
                "category": "perf-smoke",
                "note": "bounded perf smoke write",
            },
            f"perf-smoke-{args.run_id}-{i}",
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.write_workers) as pool:
        writes = list(pool.map(create, range(args.concurrent_writes)))
    report["concurrent_write"] = summarize(writes, 201)

    # Phase 4: same-key concurrent replay must converge to a single mutation.
    same_key = f"perf-smoke-{args.run_id}-replay"
    payload = {
        "canonical_name": "Perf Smoke Replay Food",
        "quantity": 1,
        "unit": "개",
        "storage_type": "refrigerated",
        "category": "perf-smoke",
        "note": "same-key concurrency replay",
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.write_workers) as pool:
        replays = list(pool.map(
            lambda _: timed_request("POST", f"{base}/api/foods", token, payload, same_key),
            range(args.replay_attempts),
        ))
    report["same_key_replay"] = summarize(replays, 201)

    # The dashboard read model must reflect every unique mutation exactly once.
    _, dash_status = timed_request("GET", f"{base}/api/dashboard", token, None, None)
    req = urllib.request.Request(f"{base}/api/dashboard")
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        dashboard = json.loads(resp.read())
    expected = args.concurrent_writes + 1
    report["dashboard_food_count"] = dashboard.get("food_count")
    report["expected_min_food_count"] = expected
    report["count_match"] = dashboard.get("food_count", 0) >= expected and dash_status == 200
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded perf smoke against a disposable Rescue Meal API.")
    parser.add_argument("--base", required=True)
    parser.add_argument("--token", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--sequential-reads", type=int, default=120)
    parser.add_argument("--concurrent-reads", type=int, default=100)
    parser.add_argument("--read-workers", type=int, default=4)
    parser.add_argument("--concurrent-writes", type=int, default=24)
    parser.add_argument("--write-workers", type=int, default=4)
    parser.add_argument("--replay-attempts", type=int, default=8)
    parser.add_argument("--max-p95-ms", type=float, default=15000)
    args = parser.parse_args()

    report = run(args)
    failures = []
    for phase in ("sequential_read", "concurrent_read", "concurrent_write", "same_key_replay"):
        stats = report[phase]
        if stats["errors"]:
            failures.append(f"{phase}: {stats['errors']} unexpected statuses")
        if stats["p95_ms"] > args.max_p95_ms:
            failures.append(f"{phase}: p95 {stats['p95_ms']}ms over {args.max_p95_ms}ms ceiling")
    if not report["count_match"]:
        failures.append(
            f"dashboard food_count {report['dashboard_food_count']} < expected {report['expected_min_food_count']}"
        )

    print(json.dumps(report, ensure_ascii=False, indent=2))
    if failures:
        for failure in failures:
            print(f"perf smoke failure: {failure}")
        return 1
    print("perf smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
