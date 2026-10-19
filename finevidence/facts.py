"""Bounded synthetic facts and structural source checks, not human verification."""

from dataclasses import dataclass, fields
from datetime import date
from decimal import Context, Decimal, DivisionByZero, InvalidOperation, Overflow, ROUND_HALF_EVEN, localcontext
import json
from pathlib import Path
import re

from .documents import load_document, make_chunks, read_index


class FinanceError(ValueError):
    """A fact, comparison or calculation failed a defined boundary."""


def decimal_context() -> Context:
    # A fresh explicit context avoids caller precision, traps and rounding settings.
    return Context(prec=50, rounding=ROUND_HALF_EVEN, Emin=-999, Emax=999, capitals=1, clamp=0,
                   traps=[DivisionByZero, InvalidOperation, Overflow])


def decimal_value(raw: object) -> Decimal:
    # Fixed-point strings only: at most 18 integral and 12 fractional digits.
    # This also bounds arithmetic and rejects floats, booleans and nonfinite values.
    if not isinstance(raw, str) or not re.fullmatch(r"-?(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,12})?", raw):
        raise FinanceError("INVALID_FACT: value must be a bounded fixed-point decimal string")
    return Decimal(raw)


@dataclass(frozen=True)
class FinancialFact:
    fact_id: str
    company: str
    metric: str
    period_start: str
    period_end: str
    report_type: str
    raw_value: str
    currency: str
    unit_scale: str
    accounting_basis: str
    consolidation_scope: str
    doc_id: str
    source_file: str
    source_sha256: str
    page: int
    source_excerpt: str
    verification_status: str
    verified_by: str | None

    def __post_init__(self):
        # Inspect field types before any recursive dataclass serialization.
        for field in fields(self):
            key, value = field.name, getattr(self, field.name)
            if key in {"page", "verified_by"}:
                continue
            if not isinstance(value, str) or not value.strip() or len(value) > 8192:
                raise FinanceError(f"INVALID_FACT: missing or invalid {key}")
        if self.verified_by is not None and (not isinstance(self.verified_by, str)
                                            or not self.verified_by.strip() or len(self.verified_by) > 256):
            raise FinanceError("INVALID_FACT: invalid verifier identity")
        decimal_value(self.raw_value)
        for key in ("fact_id", "doc_id"):
            if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", getattr(self, key)):
                raise FinanceError(f"INVALID_FACT: invalid {key}")
        if self.metric not in {"revenue", "gross_profit"}:
            raise FinanceError("INVALID_FACT: unsupported metric")
        if self.unit_scale not in {"1", "1000", "1000000", "1000000000"}:
            raise FinanceError("INVALID_FACT: unsupported unit scale")
        if not re.fullmatch(r"[A-Z]{3}", self.currency):
            raise FinanceError("INVALID_FACT: explicit currency code required")
        if any(getattr(self, key).strip().lower() in {"unknown", "n/a", "unspecified"}
               for key in ("accounting_basis", "consolidation_scope")):
            raise FinanceError("INVALID_FACT: explicit accounting basis and scope required")
        if self.report_type not in {"annual", "quarterly", "interim"}:
            raise FinanceError("INVALID_FACT: unsupported report type")
        try:
            start, end = date.fromisoformat(self.period_start), date.fromisoformat(self.period_end)
        except ValueError as exc:
            raise FinanceError("INVALID_FACT: invalid reporting period") from exc
        if start.isoformat() != self.period_start or end.isoformat() != self.period_end or start > end:
            raise FinanceError("INVALID_FACT: require ordered ISO reporting dates")
        if type(self.page) is not int or self.page < 1:
            raise FinanceError("INVALID_FACT: page must be a positive integer")
        if not re.fullmatch(r"[0-9a-f]{64}", self.source_sha256):
            raise FinanceError("INVALID_FACT: invalid source SHA256")

    @property
    def normalized_value(self) -> Decimal:
        with localcontext(decimal_context()):
            return decimal_value(self.raw_value) * Decimal(self.unit_scale)


def load_fixture_facts(
    manifest_path: Path, data_dir: Path, index_path: Path, company: str, year: int,
) -> tuple[list[FinancialFact], list[dict]]:
    """Select calendar-year fixture facts, then recheck original files and snapshots.

    The version-controlled fixture manifest is trusted for the numeric transcription.
    Hash/excerpt checks detect drift, not a malicious rewrite of all trusted artifacts.
    No caller-supplied status can enable a real-data/human-verified calculation here.
    """
    if not isinstance(company, str) or not company.strip():
        raise FinanceError("INVALID_COMPANY: nonempty company required")
    if type(year) is not int or not 1000 <= year <= 9999:
        raise FinanceError("INVALID_YEAR: four-digit calendar year required")
    documents = {document.doc_id: document for document in read_index(index_path)}
    if not manifest_path.is_file():
        raise FinanceError("FACTS_INVALID: fixture manifest must be a regular file")
    with manifest_path.open("rb") as stream:
        raw = stream.read(65537)
    if len(raw) > 65536:
        raise FinanceError("FACTS_INVALID: fixture manifest exceeds 64 KiB")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise FinanceError("FACTS_INVALID: fixture manifest must be UTF-8 JSON") from exc
    if (not isinstance(payload, dict) or type(payload.get("version")) is not int
            or payload["version"] != 1 or payload.get("classification") != "SYNTHETIC"
            or not isinstance(payload.get("facts"), list) or not 1 <= len(payload["facts"]) <= 32):
        raise FinanceError("FACTS_INVALID: invalid synthetic fixture manifest")
    facts = []
    for record in payload["facts"]:
        if not isinstance(record, dict):
            raise FinanceError("FACTS_INVALID: each fact must be an object")
        try:
            facts.append(FinancialFact(**record))
        except TypeError as exc:
            raise FinanceError("FACTS_INVALID: unexpected or missing fact fields") from exc
    identities = [fact.fact_id for fact in facts]
    selectors = [(f.company, f.period_start, f.period_end, f.report_type, f.metric) for f in facts]
    if len(set(identities)) != len(identities) or len(set(selectors)) != len(selectors):
        raise FinanceError("FACT_CONFLICT: ambiguous or duplicate facts")
    selected = [fact for fact in facts if fact.company == company
                and fact.period_start == f"{year}-01-01" and fact.period_end == f"{year}-12-31"
                and fact.report_type == "annual"]
    if {fact.metric for fact in selected} != {"gross_profit", "revenue"}:
        raise FinanceError("FACTS_NOT_FOUND: no complete calendar-year fixture pair; not a disclosure conclusion")
    citations = {}
    for fact in selected:
        if fact.verification_status != "synthetic_fixture" or fact.verified_by is not None:
            raise FinanceError("FACT_UNVERIFIED: only explicitly synthetic fixtures are enabled")
        original = load_document(data_dir, fact.source_file)
        if (original != documents.get(fact.doc_id) or original.sha256 != fact.source_sha256
                or original.company != fact.company or str(original.year) != fact.period_end[:4]):
            raise FinanceError("SOURCE_MISMATCH: fact, original source and imported snapshot must agree")
        matches = [chunk for chunk in make_chunks(original)
                   if chunk.page == fact.page and chunk.text == fact.source_excerpt]
        if len(matches) != 1:
            raise FinanceError("SOURCE_MISMATCH: fact must identify one exact source paragraph")
        chunk = matches[0]
        citations[chunk.chunk_id] = {
            "citation_id": chunk.chunk_id, "chunk_id": chunk.chunk_id,
            "doc_id": original.doc_id, "source_file": original.filename,
            "source_sha256": original.sha256, "company": original.company,
            "year": original.year, "page": chunk.page, "page_kind": "synthetic",
            "classification": "SYNTHETIC", "excerpt": chunk.text,
        }
    return selected, list(citations.values())
