"""A shared retrieval workflow with an explicit, source-linked response contract."""

from dataclasses import asdict, dataclass
from pathlib import Path
from uuid import uuid4

from .documents import Document, make_chunks, load_verified_documents
from .retrieval import QueryError, SearchHit, search, validate_query_text
from .facts import FinancialFact, FinanceError, load_fixture_facts, load_fixture_periods
from .finance import gross_margin, gross_margin_change, revenue_growth


LIMITATIONS = [
    "All source documents are SYNTHETIC; page numbers are synthetic, not PDF pages.",
    "English lexical retrieval only. BM25 scores are not confidence probabilities.",
    "No generated answer or verified financial calculation is provided.",
    "Citation structure does not establish semantic support; human review is required.",
    "Company/year filters are query controls, not document access authorization.",
    "trace_id is a request identifier; persistent tool tracing is not implemented.",
]


def response_envelope(trace_id: str, status: str) -> dict:
    return {
        "schema_version": "1.0", "trace_id": trace_id,
        "mode": "offline_retrieval", "status": status,
        "answer": None, "claims": [], "citations": [], "calculations": [],
        "limitations": list(LIMITATIONS),
    }


@dataclass(frozen=True)
class RetrievalResult:
    query: str
    company: str | None
    year: int | None
    top_k: int
    trace_id: str
    documents: list[Document]
    hits: list[SearchHit]

    def as_dict(self) -> dict:
        payload = response_envelope(self.trace_id, "EVIDENCE_FOUND" if self.hits else "NO_MATCH")
        payload["query"] = self.query
        payload["filters"] = {"company": self.company, "year": self.year}
        payload["top_k"] = self.top_k
        sources = {document.doc_id: document for document in self.documents}
        payload["citations"] = [
            {
                "citation_id": hit.chunk.chunk_id, "chunk_id": hit.chunk.chunk_id,
                "doc_id": hit.chunk.doc_id, "source_file": hit.chunk.filename,
                "source_sha256": sources[hit.chunk.doc_id].sha256,
                "company": hit.chunk.company, "year": hit.chunk.year,
                "page": hit.chunk.page, "page_kind": "synthetic",
                "classification": "SYNTHETIC", "excerpt": hit.chunk.text,
                "score": hit.score,
            }
            for hit in self.hits
        ]
        return payload


def retrieve(
    index_path: Path, query: str, top_k: int = 3, *, data_dir: Path,
    company: str | None = None, year: int | None = None,
    trace_id: str | None = None,
) -> RetrievalResult:
    validate_query_text(query)
    if company is not None and (not isinstance(company, str) or not company.strip()):
        raise QueryError("INVALID_COMPANY: company must be a nonempty exact metadata value")
    if company is not None:
        try:
            company.encode("utf-8")
        except UnicodeEncodeError as exc:
            raise QueryError("INVALID_COMPANY: company must contain valid Unicode scalar values") from exc
    if year is not None and (type(year) is not int or not 1000 <= year <= 9999):
        raise QueryError("INVALID_YEAR: year must be a four-digit integer")
    documents = load_verified_documents(index_path, data_dir)
    candidates = [
        chunk for document in documents
        if (company is None or document.company == company)
        and (year is None or document.year == year)
        for chunk in make_chunks(document)
    ]
    hits = search(candidates, query, top_k)
    return RetrievalResult(query, company, year, top_k, trace_id or uuid4().hex, documents, hits)


def calculation_envelope(trace_id: str, status: str) -> dict:
    payload = response_envelope(trace_id, status)
    payload.update(mode="synthetic_calculation", facts=[], limitations=[
        "SYNTHETIC fixture calculation only; not real financial data or human-verified facts.",
        "The version-controlled fixture manifest is trusted for numeric transcription and metadata.",
        "Source hashes/excerpts detect drift, not semantic correctness or malicious replacement of all artifacts.",
        "Only calendar-year gross margin, adjacent-year revenue growth and margin percentage-point change are exposed; no currency conversion or missing-value inference.",
        "Decimal ratios use 50 significant digits; margin change uses 100-digit cross-product arithmetic. Displays use two decimals, half-even rounding.",
        "No model, database, authorization system or persistent trace is involved.",
    ])
    return payload


def calculate_margin(
    index_path: Path, manifest_path: Path, data_dir: Path, company: str, year: int, *,
    trace_id: str | None = None,
) -> dict:
    facts, citations = load_fixture_facts(manifest_path, data_dir, index_path, company, year)
    by_metric = {fact.metric: fact for fact in facts}
    calculation = gross_margin(by_metric["gross_profit"], by_metric["revenue"])
    return _calculation_result(
        facts, citations, calculation,
        {"company": company, "year": year, "report_type": "annual"},
        f"SYNTHETIC: {company} {year} gross margin = {calculation['display']}",
        trace_id,
    )


def calculate_revenue_growth(
    index_path: Path, manifest_path: Path, data_dir: Path, company: str, year: int, *,
    trace_id: str | None = None,
) -> dict:
    if type(year) is not int or not 1001 <= year <= 9999:
        raise FinanceError("INVALID_YEAR: growth needs a current year and four-digit prior year")
    facts, citations = load_fixture_periods(
        manifest_path, data_dir, index_path, company, (year, year - 1), metrics=("revenue",))
    by_year = {int(fact.period_start[:4]): fact for fact in facts}
    calculation = revenue_growth(by_year[year], by_year[year - 1])
    return _calculation_result(
        facts, citations, calculation,
        {"company": company, "year": year, "prior_year": year - 1, "report_type": "annual"},
        f"SYNTHETIC: {company} {year} vs {year - 1} revenue growth = {calculation['display']}",
        trace_id,
    )


def calculate_margin_change(
    index_path: Path, manifest_path: Path, data_dir: Path, company: str, year: int, *,
    trace_id: str | None = None,
) -> dict:
    if type(year) is not int or not 1001 <= year <= 9999:
        raise FinanceError("INVALID_YEAR: margin change needs a current year and four-digit prior year")
    facts, citations = load_fixture_periods(
        manifest_path, data_dir, index_path, company, (year, year - 1),
        metrics=("gross_profit", "revenue"))
    selected = {(int(fact.period_start[:4]), fact.metric): fact for fact in facts}
    calculation = gross_margin_change(
        selected[(year, "gross_profit")], selected[(year, "revenue")],
        selected[(year - 1, "gross_profit")], selected[(year - 1, "revenue")])
    current, prior = (calculation["component_margins"][period]["display"]
                      for period in ("current", "prior"))
    return _calculation_result(
        facts, citations, calculation,
        {"company": company, "year": year, "prior_year": year - 1, "report_type": "annual"},
        f"SYNTHETIC: {company} {year} vs {year - 1} gross margin change = {calculation['display']} "
        f"(current {current}; prior {prior})",
        trace_id,
    )


def _calculation_result(
    facts: list[FinancialFact], citations: list[dict], calculation: dict,
    filters: dict, answer: str, trace_id: str | None,
) -> dict:
    payload = calculation_envelope(trace_id or uuid4().hex, "CALCULATED")
    payload["filters"] = filters
    payload["citations"] = citations
    for fact in facts:
        record = asdict(fact)
        record["normalized_value"] = format(fact.normalized_value, "f")
        record["classification"] = "SYNTHETIC"
        record["citation_id"] = next(c["citation_id"] for c in citations
                                     if c["doc_id"] == fact.doc_id and c["page"] == fact.page
                                     and c["excerpt"] == fact.source_excerpt)
        payload["facts"].append(record)
    calculation["citation_ids"] = [c["citation_id"] for c in citations]
    payload["calculations"] = [calculation]
    payload["answer"] = answer
    payload["claims"] = [{"text": payload["answer"], "calc_id": calculation["calc_id"],
                           "citation_ids": calculation["citation_ids"]}]
    return payload
