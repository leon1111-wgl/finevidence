"""Explicit synthetic SQLite snapshots; application reads never execute caller SQL."""

from contextlib import closing, contextmanager
from dataclasses import fields
import os
from pathlib import Path
import re
import sqlite3
import stat
import tempfile

from .documents import read_index
from .facts import (
    FinancialFact, FinanceError, read_fixture_manifest, validate_fact_request,
    validate_fact_set, verify_fact_sources,
)

MAX_STORE_BYTES = 1048576
APPLICATION_ID = 0x46455631
COLUMNS = tuple(field.name for field in fields(FinancialFact))
# Identifiers are defined by our dataclass, never by user/model input.
FACTS_SCHEMA = "CREATE TABLE facts (" + ", ".join(
    name + (" INTEGER" if name == "page" else " TEXT")
    + ("" if name == "verified_by" else " NOT NULL") for name in COLUMNS
) + ", PRIMARY KEY (fact_id), UNIQUE (company, period_start, period_end, report_type, metric))"
METADATA_SCHEMA = ("CREATE TABLE metadata (schema_version INTEGER NOT NULL, "
                   "classification TEXT NOT NULL, manifest_sha256 TEXT NOT NULL)")


def build_fact_store(manifest_path: Path, data_dir: Path, index_path: Path, database_path: Path) -> dict:
    """Validate every authored fixture, then publish a new complete snapshot without replacement."""
    if database_path.exists() or database_path.is_symlink():
        raise FinanceError("FACT_STORE_EXISTS: preserve or move the existing snapshot before rebuilding")
    documents = {d.doc_id: d for d in read_index(index_path)}
    facts, manifest_sha = read_fixture_manifest(manifest_path)
    verify_fact_sources(facts, data_dir, documents)
    fd, name = tempfile.mkstemp(prefix="facts.", suffix=".tmp", dir=database_path.parent)
    os.close(fd)
    staged = Path(name)
    try:
        with closing(sqlite3.connect(staged)) as con, con:
            con.execute("PRAGMA application_id=" + str(APPLICATION_ID))
            con.execute("PRAGMA user_version=1")
            con.execute(FACTS_SCHEMA)
            con.execute(METADATA_SCHEMA)
            con.execute("INSERT INTO metadata VALUES (?, ?, ?)", (1, "SYNTHETIC", manifest_sha))
            con.executemany("INSERT INTO facts VALUES (" + ",".join("?" for _ in COLUMNS) + ")",
                            [tuple(getattr(f, key) for key in COLUMNS) for f in facts])
        if staged.stat().st_size > MAX_STORE_BYTES:
            raise FinanceError("FACT_STORE_INVALID: snapshot exceeds 1 MiB")
        # A same-directory hard link publishes only if the destination is absent.
        # Concurrent builders cannot replace one another's completed snapshot.
        try:
            os.link(staged, database_path)
        except FileExistsError as exc:
            raise FinanceError("FACT_STORE_EXISTS: a snapshot already occupies the destination") from exc
    except sqlite3.Error as exc:
        raise FinanceError("FACT_STORE_INVALID: cannot build the synthetic snapshot") from exc
    finally:
        # Normal failures clean staging; a killed process may leave an uncommitted .tmp.
        staged.unlink(missing_ok=True)
    return {"fact_count": len(facts), "classification": "SYNTHETIC", "store_schema_version": 1,
            "manifest_sha256": manifest_sha}


def _check_snapshot_file(path: Path) -> Path:
    try:
        info = path.lstat()
    except FileNotFoundError as exc:
        raise FinanceError("FACT_STORE_MISSING: build the SQLite snapshot explicitly first") from exc
    if not stat.S_ISREG(info.st_mode) or not 100 <= info.st_size <= MAX_STORE_BYTES:
        raise FinanceError("FACT_STORE_INVALID: require a regular SQLite snapshot of at most 1 MiB")
    # These are closed rollback-journal snapshots, not live WAL databases.
    if any(Path(str(path) + suffix).exists() or Path(str(path) + suffix).is_symlink()
           for suffix in ("-wal", "-shm", "-journal")):
        raise FinanceError("FACT_STORE_INVALID: live database sidecars are unsupported")
    with path.open("rb") as stream:
        header = stream.read(100)
    if header[:16] != b"SQLite format 3\x00" or header[18:20] != b"\x01\x01":
        raise FinanceError("FACT_STORE_INVALID: require a closed rollback-journal SQLite snapshot")
    return path.resolve()


def _read_authorizer(action, table, column, database, source):
    if action == sqlite3.SQLITE_SELECT:
        return sqlite3.SQLITE_OK
    if action == sqlite3.SQLITE_READ and database == "main" and table in {"facts", "metadata"} and source is None:
        return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY


@contextmanager
def open_readonly_store(database_path: Path):
    """Own and close one mode=ro connection; intended for fixed internal SELECTs only."""
    path = _check_snapshot_file(database_path)
    con = None
    try:
        # as_uri escapes ?, # and % in filenames; callers cannot add URI settings.
        con = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=0, isolation_level=None)
        con.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 131072)
        con.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH, 8192)
        con.setlimit(sqlite3.SQLITE_LIMIT_ATTACHED, 0)
        ticks = 0

        def stop_expensive_query():
            nonlocal ticks
            ticks += 1
            return ticks >= 100

        con.set_progress_handler(stop_expensive_query, 1000)
        con.execute("PRAGMA query_only=ON")
        con.execute("PRAGMA trusted_schema=OFF")
        con.execute("BEGIN")
        if (con.execute("PRAGMA application_id").fetchone()[0] != APPLICATION_ID
                or con.execute("PRAGMA user_version").fetchone()[0] != 1):
            raise FinanceError("FACT_STORE_INVALID: unsupported snapshot identity or schema version")
        objects = con.execute("SELECT name, type, sql FROM sqlite_schema "
                              "WHERE name NOT GLOB 'sqlite_*' ORDER BY name").fetchall()
        if objects != [("facts", "table", FACTS_SCHEMA), ("metadata", "table", METADATA_SCHEMA)]:
            raise FinanceError("FACT_STORE_INVALID: unsupported snapshot schema")
        metadata = con.execute("SELECT schema_version, classification, manifest_sha256 FROM metadata").fetchmany(2)
        if (len(metadata) != 1 or metadata[0][:2] != (1, "SYNTHETIC")
                or not isinstance(metadata[0][2], str) or not re.fullmatch(r"[0-9a-f]{64}", metadata[0][2])):
            raise FinanceError("FACT_STORE_INVALID: invalid synthetic snapshot metadata")
        if con.execute("PRAGMA integrity_check(1)").fetchall() != [("ok",)]:
            raise FinanceError("FACT_STORE_INVALID: SQLite integrity check failed")
        con.set_authorizer(_read_authorizer)
        yield con
    except sqlite3.Error as exc:
        if getattr(exc, "sqlite_errorcode", 0) & 0xFF in {sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED}:
            raise FinanceError("FACT_STORE_BUSY: snapshot is locked; retry after its writer finishes") from exc
        raise FinanceError("FACT_STORE_INVALID: cannot read the SQLite snapshot") from exc
    finally:
        if con is not None:
            con.close()


def load_store_facts(
    database_path: Path, company: str, years: tuple[int, ...], *, metrics: tuple[str, ...],
) -> list[FinancialFact]:
    """Read typed facts using bound values; application workflow still checks source files."""
    validate_fact_request(company, years, metrics)
    with open_readonly_store(database_path) as con:
        rows = con.execute("SELECT * FROM facts").fetchmany(33)
        all_facts = [FinancialFact(**dict(zip(COLUMNS, row))) for row in rows]
        validate_fact_set(all_facts)
        # The small full validation catches malformed/ambiguous rows before selection,
        # just like the reference manifest backend. Selection itself is SQL.
        periods = " OR ".join("(period_start=? AND period_end=?)" for _ in years)
        metric_slots = ",".join("?" for _ in metrics)
        sql = ("SELECT * FROM facts WHERE company=? AND report_type='annual' AND (" + periods
               + ") AND metric IN (" + metric_slots + ") ORDER BY rowid")
        parameters = [company]
        for year in years:
            parameters.extend((f"{year}-01-01", f"{year}-12-31"))
        parameters.extend(metrics)
        selected = con.execute(sql, parameters).fetchmany(33)
        return [FinancialFact(**dict(zip(COLUMNS, row))) for row in selected]
