"""Validate synthetic sources, preserve pages, and build a local import snapshot."""

from contextlib import contextmanager
from dataclasses import asdict, dataclass
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile

try:
    import fcntl
except ImportError:
    fcntl = None


MAX_SOURCE_BYTES = 64 * 1024
MAX_INDEX_BYTES = 1024 * 1024
MAX_PAGES = 10


class DocumentError(ValueError):
    """A document or index failed a documented input boundary."""


@dataclass(frozen=True)
class Document:
    doc_id: str
    company: str
    year: int
    language: str
    classification: str
    notice: str
    pages: tuple[str, ...]
    filename: str
    sha256: str


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    doc_id: str
    filename: str
    company: str
    year: int
    page: int
    text: str


@dataclass(frozen=True)
class ImportResult:
    imported: int
    skipped: int
    documents: int
    chunks: int


def validate_document(payload: object, filename: str, sha256: str) -> Document:
    if not isinstance(payload, dict):
        raise DocumentError("INVALID_DOCUMENT: expected a JSON object")
    required = ("doc_id", "company", "language", "classification", "notice")
    if any(not isinstance(payload.get(key), str) or not payload[key].strip() for key in required):
        raise DocumentError("INVALID_DOCUMENT: missing or empty text metadata")
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", payload["doc_id"]):
        raise DocumentError("INVALID_DOCUMENT: doc_id must use lowercase letters, digits or underscores")
    if payload["classification"] != "SYNTHETIC" or "SYNTHETIC" not in payload["notice"]:
        raise DocumentError("INVALID_DOCUMENT: M1 accepts only explicitly SYNTHETIC documents")
    if payload["language"] != "en" or type(payload.get("year")) is not int:
        raise DocumentError("INVALID_DOCUMENT: language must be en and year must be an integer")
    if not 1000 <= payload["year"] <= 9999:
        raise DocumentError("INVALID_DOCUMENT: year must have four digits")
    pages = payload.get("pages")
    if not isinstance(pages, list) or any(not isinstance(page, str) for page in pages):
        raise DocumentError("INVALID_DOCUMENT: pages must be a list of strings")
    if len(pages) > MAX_PAGES:
        raise DocumentError(f"DOCUMENT_LIMIT: at most {MAX_PAGES} synthetic pages")
    if not any(page.strip() for page in pages):
        raise DocumentError("EMPTY_DOCUMENT: no nonblank source text")
    try:
        for text in [*(payload[key] for key in required), *pages, filename]:
            text.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise DocumentError("INVALID_DOCUMENT: text must contain valid Unicode scalar values") from exc
    return Document(
        doc_id=payload["doc_id"], company=payload["company"], year=payload["year"],
        language=payload["language"], classification=payload["classification"],
        notice=payload["notice"], pages=tuple(pages), filename=filename, sha256=sha256,
    )


def safe_source_path(data_dir: Path, filename: str) -> Path:
    relative = Path(filename)
    if relative.is_absolute() or ".." in relative.parts or relative.suffix != ".json":
        raise DocumentError("INVALID_PATH: use a relative .json path inside data/synthetic")
    try:
        root = data_dir.resolve()
        resolved = (root / relative).resolve()
    except (OSError, RuntimeError, ValueError) as exc:
        raise DocumentError("INVALID_PATH: source path cannot be resolved") from exc
    if not resolved.is_relative_to(root):
        raise DocumentError("INVALID_PATH: source resolves outside data/synthetic")
    return resolved


def load_document(data_dir: Path, filename: str) -> Document:
    source = safe_source_path(data_dir, filename)
    if not source.is_file():
        raise DocumentError("SOURCE_ERROR: source must be an existing regular file")
    try:
        with source.open("rb") as stream:
            raw = stream.read(MAX_SOURCE_BYTES + 1)
    except OSError as exc:
        raise DocumentError(f"SOURCE_ERROR: cannot read {filename}") from exc
    if len(raw) > MAX_SOURCE_BYTES:
        raise DocumentError(f"DOCUMENT_LIMIT: source exceeds {MAX_SOURCE_BYTES} bytes")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise DocumentError("INVALID_DOCUMENT: source must be valid UTF-8 JSON") from exc
    return validate_document(payload, Path(filename).as_posix(), hashlib.sha256(raw).hexdigest())


def make_chunks(document: Document) -> list[Chunk]:
    chunks = []
    for page_number, raw_page in enumerate(document.pages, start=1):
        paragraphs = re.split(r"\r?\n[ \t]*\r?\n", raw_page)
        paragraph_number = 0
        for paragraph in paragraphs:
            if not paragraph.strip():
                continue
            paragraph_number += 1
            chunks.append(Chunk(
                chunk_id=f"{document.doc_id}:p{page_number}:c{paragraph_number}",
                doc_id=document.doc_id, filename=document.filename,
                company=document.company, year=document.year,
                page=page_number, text=paragraph,
            ))
    return chunks


def read_index(index_path: Path, *, missing_ok: bool = False) -> list[Document]:
    descriptor = None
    try:
        # Nonblocking open prevents a FIFO from waiting before fstat can reject it.
        descriptor = os.open(index_path, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0))
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise DocumentError("INDEX_INVALID: index must be a regular file")
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            raw = stream.read(MAX_INDEX_BYTES + 1)
    except FileNotFoundError as exc:
        if index_path.is_symlink():
            raise DocumentError("INDEX_INVALID: index link has no readable target") from exc
        if missing_ok:
            return []
        raise DocumentError("INDEX_MISSING: run the import command first") from exc
    except OSError as exc:
        raise DocumentError("INDEX_INVALID: index cannot be read as a regular file") from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)
    if len(raw) > MAX_INDEX_BYTES:
        raise DocumentError(f"INDEX_LIMIT: index exceeds {MAX_INDEX_BYTES} bytes")
    try:
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict) or type(payload.get("version")) is not int or payload["version"] != 1:
            raise ValueError("unsupported index version")
        records = payload.get("documents")
        if not isinstance(records, list):
            raise ValueError("missing document list")
        documents = []
        seen_ids, seen_files, seen_hashes = set(), set(), set()
        for record in records:
            if not isinstance(record, dict):
                raise ValueError("invalid index record")
            filename, digest = record.get("filename"), record.get("sha256")
            if not isinstance(filename, str) or not isinstance(digest, str):
                raise ValueError("missing source identity")
            relative = Path(filename)
            if relative.is_absolute() or ".." in relative.parts or relative.suffix != ".json":
                raise ValueError("invalid source filename")
            if not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError("invalid source hash")
            document = validate_document(record, filename, digest)
            if document.doc_id in seen_ids or filename in seen_files or digest in seen_hashes:
                raise ValueError("duplicate source identity")
            seen_ids.add(document.doc_id)
            seen_files.add(filename)
            seen_hashes.add(digest)
            documents.append(document)
        return documents
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise DocumentError("INDEX_INVALID: index is malformed; do not interpret this as no evidence") from exc


def write_index(index_path: Path, documents: list[Document]) -> None:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "documents": [asdict(doc) for doc in sorted(documents, key=lambda doc: doc.doc_id)]}
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=index_path.parent,
            prefix="index.", suffix=".tmp", delete=False,
        ) as stream:
            temporary = Path(stream.name)
            size = 1  # Include the final newline in the read/write capacity contract.
            for piece in json.JSONEncoder(ensure_ascii=False, indent=2).iterencode(payload):
                raw = piece.encode("utf-8")
                size += len(raw)
                if size > MAX_INDEX_BYTES:
                    raise DocumentError(f"INDEX_LIMIT: index exceeds {MAX_INDEX_BYTES} bytes; nothing was written")
                stream.write(raw)
            stream.write(b"\n")
        temporary.replace(index_path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def load_verified_documents(index_path: Path, data_dir: Path) -> list[Document]:
    """Recheck every indexed source before metadata filtering can hide drift."""
    originals = []
    for snapshot in read_index(index_path):
        original = load_document(data_dir, snapshot.filename)
        if original != snapshot:
            raise DocumentError("SOURCE_MISMATCH: original source and imported snapshot must agree")
        originals.append(original)
    return originals


@contextmanager
def _index_write_lock(index_path: Path):
    """Keep one stable lock inode across the complete read-modify-replace operation."""
    if fcntl is None or not all(hasattr(os, flag) for flag in ("O_NOFOLLOW", "O_NONBLOCK")):
        raise DocumentError("LOCK_UNSUPPORTED: imports require local POSIX file locking")
    descriptor = None
    try:
        try:
            index_path.parent.mkdir(parents=True, exist_ok=True)
            lock_path = index_path.with_name(index_path.name + ".lock")
            descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                raise DocumentError("INDEX_LOCK_ERROR: lock must be a dedicated regular file")
        except OSError as exc:
            raise DocumentError("INDEX_LOCK_ERROR: cannot open the index lock safely") from exc
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            if exc.errno in (errno.EAGAIN, errno.EACCES):
                raise DocumentError("INDEX_BUSY: another import is active; retry after it finishes") from exc
            raise DocumentError("INDEX_LOCK_ERROR: cannot acquire the index lock") from exc
        yield
    finally:
        if descriptor is not None:
            # Close releases ownership on success and failure. Never unlink the inode.
            os.close(descriptor)


def import_documents(data_dir: Path, index_path: Path, filenames: list[str]) -> ImportResult:
    with _index_write_lock(index_path):
        return _import_documents_locked(data_dir, index_path, filenames)


def _import_documents_locked(data_dir: Path, index_path: Path, filenames: list[str]) -> ImportResult:
    documents = read_index(index_path, missing_ok=True)
    by_id = {document.doc_id: document for document in documents}
    by_file = {document.filename: document.doc_id for document in documents}
    by_hash = {document.sha256: document.doc_id for document in documents}
    imported = skipped = 0
    for filename in filenames:
        incoming = load_document(data_dir, filename)
        existing = by_id.get(incoming.doc_id)
        if existing and existing.sha256 == incoming.sha256 and existing.filename == incoming.filename:
            skipped += 1
            continue
        if existing or incoming.filename in by_file or incoming.sha256 in by_hash:
            raise DocumentError("IMPORT_CONFLICT: existing ID, filename or content differs; nothing was written")
        by_id[incoming.doc_id] = incoming
        by_file[incoming.filename] = incoming.doc_id
        by_hash[incoming.sha256] = incoming.doc_id
        imported += 1
    documents = list(by_id.values())
    if imported:
        write_index(index_path, documents)
    return ImportResult(imported, skipped, len(documents), sum(len(make_chunks(doc)) for doc in documents))


def load_chunks(index_path: Path) -> list[Chunk]:
    return [chunk for document in read_index(index_path) for chunk in make_chunks(document)]
