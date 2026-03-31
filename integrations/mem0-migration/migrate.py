#!/usr/bin/env python3
"""
migrate.py — Migrate memories from Mem0 to Slopshop
=====================================================

Reads a Mem0 memory export (JSON) and writes every entry to Slopshop's
memory-set endpoint. Each write returns a proof_hash and merkle_root.
All proofs are saved to migration_proofs.json for later verification.

Usage
-----
# 1. Export from Mem0 first:
#    python3 -c "
#      from mem0 import MemoryClient; import json
#      m = MemoryClient()
#      data = m.get_all()          # or m.get_all(user_id='alice')
#      with open('mem0_export.json','w') as f: json.dump(data, f, indent=2)
#    "

# 2. Dry run (no writes):
python3 migrate.py --slop-key sk-slop-xxx --input mem0_export.json --dry-run

# 3. Real migration:
python3 migrate.py --slop-key sk-slop-xxx --input mem0_export.json

# 4. Migrate into a specific namespace:
python3 migrate.py --slop-key sk-slop-xxx --input mem0_export.json --namespace my-namespace

# 5. Preserve per-user namespaces from the export:
python3 migrate.py --slop-key sk-slop-xxx --input mem0_export.json --per-user-namespace

# 6. Verify proofs after migration:
python3 migrate.py --verify migration_proofs.json --slop-key sk-slop-xxx

Dependencies: requests (pip install requests)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from typing import Any, Optional

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    sys.exit("ERROR: 'requests' library not found. Install it with: pip install requests")

__version__ = "1.0.0"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

SLOPSHOP_BASE = "https://slopshop.gg"
WRITE_TIMEOUT = 15  # seconds per request
BATCH_SLEEP = 0.05  # 50ms between writes to stay within rate limits


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

def build_session(api_key: str) -> requests.Session:
    """Build a requests.Session with retries and auth headers."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist={502, 503, 504},
        allowed_methods={"GET", "POST"},
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": f"slopshop-migrate/{__version__}",
    })
    return session


# ---------------------------------------------------------------------------
# Mem0 export parsing
# ---------------------------------------------------------------------------

def parse_mem0_export(raw: Any) -> list[dict]:
    """
    Normalise a Mem0 export into a flat list of memory dicts.

    Mem0 exports vary by SDK version and endpoint used. This handles the
    most common shapes:
      - List of {"id": ..., "memory": ..., ...}                  (get_all)
      - {"results": [...]}                                        (search)
      - {"memories": [...]}                                       (some SDKs)
      - Single dict (single memory export)
    """
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("results", "memories", "data", "items"):
            if key in raw and isinstance(raw[key], list):
                return raw[key]
        # Single memory object
        if "memory" in raw or "content" in raw or "id" in raw:
            return [raw]
    log.warning("Unexpected export format — treating as empty list. Check your input file.")
    return []


def derive_key(mem: dict, index: int) -> str:
    """
    Derive a stable key for a Mem0 memory entry.

    Priority:
      1. mem["id"]          — most reliable, Mem0's own ID
      2. mem["memory_id"]   — alternate ID field
      3. mem["hash"]        — content hash if present
      4. "mem_{index}"      — fallback sequential key
    """
    for field in ("id", "memory_id", "hash"):
        val = mem.get(field)
        if val and isinstance(val, str) and val.strip():
            return val.strip()
    return f"mem_{index}"


def derive_value(mem: dict) -> Any:
    """
    Extract the content value from a Mem0 memory dict.

    Priority:
      1. mem["memory"]   — standard Mem0 field
      2. mem["content"]  — alternate content field
      3. Full dict       — store the whole thing as structured data
    """
    for field in ("memory", "content", "text"):
        val = mem.get(field)
        if val is not None:
            return val
    # Store the whole dict minus known metadata fields
    stripped = {k: v for k, v in mem.items()
                if k not in ("id", "memory_id", "hash", "created_at", "updated_at")}
    return stripped or mem


def derive_namespace(mem: dict, default_namespace: str, per_user: bool) -> str:
    """
    Determine the Slopshop namespace for a memory entry.

    When --per-user-namespace is set, reads user_id from the memory dict
    (set by the export step as _source_user_id, or the native user_id field).
    Falls back to default_namespace.
    """
    if per_user:
        uid = mem.get("_source_user_id") or mem.get("user_id") or mem.get("agent_id")
        if uid and isinstance(uid, str) and uid.strip():
            return uid.strip()
    return default_namespace


def derive_tags(mem: dict) -> list[str]:
    """Extract or construct tags for a Mem0 memory entry."""
    tags = ["migrated-from-mem0"]
    # Preserve Mem0 categories or labels if present
    for field in ("categories", "labels", "tags"):
        val = mem.get(field)
        if isinstance(val, list):
            tags.extend(str(t) for t in val if t)
        elif isinstance(val, str) and val.strip():
            tags.append(val.strip())
    return tags


# ---------------------------------------------------------------------------
# Migration logic
# ---------------------------------------------------------------------------

def migrate_memories(
    memories: list[dict],
    session: requests.Session,
    base_url: str,
    default_namespace: str,
    per_user: bool,
    dry_run: bool,
    skip_errors: bool,
) -> dict:
    """
    Write all memories to Slopshop. Returns a result summary dict.
    """
    migrated = 0
    failed = 0
    skipped = 0
    proofs: list[dict] = []
    errors: list[dict] = []

    total = len(memories)
    log.info(f"Starting migration: {total} memories → namespace='{default_namespace}' "
             f"dry_run={dry_run} per_user_namespace={per_user}")

    for i, mem in enumerate(memories, start=1):
        key = derive_key(mem, i - 1)
        value = derive_value(mem)
        namespace = derive_namespace(mem, default_namespace, per_user)
        tags = derive_tags(mem)

        if dry_run:
            preview_val = str(value)[:80] + "..." if len(str(value)) > 80 else str(value)
            log.info(f"  [DRY RUN] {i}/{total}  key={key!r}  ns={namespace!r}  "
                     f"val={preview_val!r}")
            skipped += 1
            continue

        try:
            resp = session.post(
                f"{base_url}/v1/memory-set",
                json={
                    "key": key,
                    "value": value,
                    "namespace": namespace,
                    "tags": tags,
                },
                timeout=WRITE_TIMEOUT,
            )
        except requests.exceptions.RequestException as exc:
            msg = f"Network error for key {key!r}: {exc}"
            log.error(f"  FAIL {i}/{total}  {msg}")
            errors.append({"key": key, "namespace": namespace, "error": str(exc)})
            failed += 1
            if not skip_errors:
                raise SystemExit(f"Migration aborted. Re-run with --skip-errors to continue past failures.") from exc
            continue

        try:
            result = resp.json()
        except ValueError:
            msg = f"Non-JSON response (HTTP {resp.status_code}) for key {key!r}: {resp.text[:200]}"
            log.error(f"  FAIL {i}/{total}  {msg}")
            errors.append({"key": key, "namespace": namespace, "error": msg})
            failed += 1
            if not skip_errors:
                raise SystemExit("Migration aborted. Re-run with --skip-errors to continue past failures.")
            continue

        if resp.status_code == 401:
            raise SystemExit("ERROR: Invalid API key. Check SLOPSHOP_KEY or --slop-key.")

        if resp.status_code >= 400 or result.get("status") != "stored":
            err_body = result.get("error", result)
            msg = str(err_body)[:120]
            log.error(f"  FAIL {i}/{total}  key={key!r}  error={msg}")
            errors.append({"key": key, "namespace": namespace, "error": msg, "http": resp.status_code})
            failed += 1
            if not skip_errors:
                raise SystemExit("Migration aborted. Re-run with --skip-errors to continue past failures.")
            continue

        proof_hash = result.get("proof_hash", "")
        merkle_root = result.get("merkle_root", "")
        version = result.get("version", 1)
        log.info(
            f"  OK  {i}/{total}  key={key!r}  ns={namespace!r}  "
            f"v{version}  proof={proof_hash[:16]}..."
        )
        proofs.append({
            "key": key,
            "namespace": namespace,
            "proof_hash": proof_hash,
            "merkle_root": merkle_root,
            "version": version,
            "migrated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        migrated += 1

        # Rate-limit courtesy sleep
        if i < total:
            time.sleep(BATCH_SLEEP)

    return {
        "migrated": migrated,
        "failed": failed,
        "skipped": skipped,
        "total": total,
        "proofs": proofs,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Proof verification
# ---------------------------------------------------------------------------

def verify_proofs(
    proof_file: str,
    session: requests.Session,
    base_url: str,
    sample: Optional[int] = None,
) -> None:
    """Load a migration_proofs.json file and verify each proof against Slopshop."""
    with open(proof_file) as f:
        proofs = json.load(f)

    if sample:
        proofs = proofs[:sample]
        log.info(f"Verifying first {len(proofs)} proofs (sample mode)")
    else:
        log.info(f"Verifying all {len(proofs)} proofs")

    valid_count = 0
    invalid_count = 0

    for p in proofs:
        key = p.get("key", "?")
        leaf = p.get("proof_hash", "")
        root = p.get("merkle_root", "")

        if not leaf or not root:
            log.warning(f"  SKIP  {key!r} — missing proof_hash or merkle_root")
            continue

        try:
            resp = session.post(
                f"{base_url}/v1/proof/verify",
                json={"leaf": leaf, "root": root},
                timeout=WRITE_TIMEOUT,
            )
            result = resp.json()
        except Exception as exc:
            log.error(f"  ERROR  {key!r} — {exc}")
            invalid_count += 1
            continue

        if result.get("valid"):
            log.info(f"  VALID  {key!r}  proof={leaf[:16]}...")
            valid_count += 1
        else:
            log.warning(f"  INVALID  {key!r}  proof={leaf[:16]}...")
            invalid_count += 1

    total = valid_count + invalid_count
    log.info(f"\nVerification complete: {valid_count}/{total} valid, {invalid_count}/{total} invalid")
    if invalid_count > 0:
        sys.exit(1)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Migrate memories from Mem0 to Slopshop",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dry run to preview
  python3 migrate.py --slop-key sk-slop-xxx --input mem0_export.json --dry-run

  # Full migration to 'migrated' namespace
  python3 migrate.py --slop-key sk-slop-xxx --input mem0_export.json

  # Preserve per-user namespaces (uses _source_user_id or user_id from export)
  python3 migrate.py --slop-key sk-slop-xxx --input mem0_export.json --per-user-namespace

  # Verify proofs after migration
  python3 migrate.py --slop-key sk-slop-xxx --verify migration_proofs.json

  # Verify a sample of 20 proofs
  python3 migrate.py --slop-key sk-slop-xxx --verify migration_proofs.json --verify-sample 20

  # Self-hosted Slopshop
  python3 migrate.py --slop-key sk-slop-xxx --input mem0_export.json --base-url http://localhost:3000
        """,
    )
    p.add_argument(
        "--slop-key",
        default=os.environ.get("SLOPSHOP_KEY", ""),
        help="Slopshop API key (default: $SLOPSHOP_KEY env var)",
    )
    p.add_argument(
        "--input",
        metavar="FILE",
        help="Path to the Mem0 JSON export file",
    )
    p.add_argument(
        "--namespace",
        default="migrated",
        help="Target Slopshop namespace (default: migrated)",
    )
    p.add_argument(
        "--per-user-namespace",
        action="store_true",
        help="Use _source_user_id / user_id fields from the export as the namespace",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be migrated without writing anything",
    )
    p.add_argument(
        "--skip-errors",
        action="store_true",
        help="Continue past individual write failures instead of aborting",
    )
    p.add_argument(
        "--output",
        default="migration_proofs.json",
        metavar="FILE",
        help="Where to save proof hashes (default: migration_proofs.json)",
    )
    p.add_argument(
        "--errors-output",
        default="migration_errors.json",
        metavar="FILE",
        help="Where to save error details (default: migration_errors.json)",
    )
    p.add_argument(
        "--base-url",
        default=SLOPSHOP_BASE,
        help=f"Slopshop base URL (default: {SLOPSHOP_BASE})",
    )
    # Verification mode
    p.add_argument(
        "--verify",
        metavar="PROOF_FILE",
        help="Verify proofs from a previous migration. Pass the proof JSON file.",
    )
    p.add_argument(
        "--verify-sample",
        type=int,
        metavar="N",
        help="Only verify the first N proofs (for large migrations)",
    )
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.slop_key:
        parser.error(
            "No API key found. Pass --slop-key sk-slop-xxx or set SLOPSHOP_KEY env var.\n"
            "Get a key: npm install -g slopshop && slop signup"
        )

    session = build_session(args.slop_key)

    # ------------------------------------------------------------------
    # Verify mode
    # ------------------------------------------------------------------
    if args.verify:
        if not os.path.exists(args.verify):
            parser.error(f"Proof file not found: {args.verify}")
        verify_proofs(args.verify, session, args.base_url, sample=args.verify_sample)
        return

    # ------------------------------------------------------------------
    # Migration mode
    # ------------------------------------------------------------------
    if not args.input:
        parser.error(
            "--input FILE is required for migration.\n"
            "Export your Mem0 memories first, then run:\n"
            "  python3 migrate.py --slop-key $SLOPSHOP_KEY --input mem0_export.json"
        )

    if not os.path.exists(args.input):
        parser.error(f"Input file not found: {args.input}")

    # Load and parse
    log.info(f"Loading {args.input}")
    with open(args.input, encoding="utf-8") as f:
        try:
            raw = json.load(f)
        except json.JSONDecodeError as exc:
            sys.exit(f"ERROR: Could not parse {args.input} as JSON: {exc}")

    memories = parse_mem0_export(raw)
    if not memories:
        sys.exit("ERROR: No memories found in the export file. Check the file format.")

    log.info(f"Loaded {len(memories)} memories from {args.input}")

    if args.dry_run:
        log.info("DRY RUN mode — no writes will occur")

    # Run
    result = migrate_memories(
        memories=memories,
        session=session,
        base_url=args.base_url,
        default_namespace=args.namespace,
        per_user=args.per_user_namespace,
        dry_run=args.dry_run,
        skip_errors=args.skip_errors,
    )

    # Report
    log.info("")
    log.info("=" * 60)
    log.info(f"Migration complete")
    log.info(f"  Total:    {result['total']}")
    log.info(f"  Migrated: {result['migrated']}")
    log.info(f"  Failed:   {result['failed']}")
    if args.dry_run:
        log.info(f"  Skipped:  {result['skipped']} (dry run)")
    log.info("=" * 60)

    # Save proofs
    if result["proofs"] and not args.dry_run:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result["proofs"], f, indent=2)
        log.info(f"Proof hashes saved to {args.output}")
        log.info(f"Verify any write with:")
        log.info(f"  python3 migrate.py --slop-key $SLOPSHOP_KEY --verify {args.output}")
        log.info(f"  slop proof verify  (CLI)")

    # Save errors
    if result["errors"] and not args.dry_run:
        with open(args.errors_output, "w", encoding="utf-8") as f:
            json.dump(result["errors"], f, indent=2)
        log.warning(f"{result['failed']} errors saved to {args.errors_output}")

    if result["failed"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
