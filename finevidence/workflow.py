"""A shared retrieval workflow with an explicit, source-linked response contract."""

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from .documents import Document, make_chunks, read_index
from .retrieval import QueryError, SearchHit, search


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
    index_path: Path, query: str, top_k: int = 3, *,
    company: str | None = None, year: int | None = None,
    trace_id: str | None = None,
) -> RetrievalResult:
    if company is not None and (not isinstance(company, str) or not company.strip()):
        raise QueryError("INVALID_COMPANY: company must be a nonempty exact metadata value")
    if year is not None and (type(year) is not int or not 1000 <= year <= 9999):
        raise QueryError("INVALID_YEAR: year must be a four-digit integer")
    documents = read_index(index_path)
    candidates = [
        chunk for document in documents
        if (company is None or document.company == company)
        and (year is None or document.year == year)
        for chunk in make_chunks(document)
    ]
    hits = search(candidates, query, top_k)
    return RetrievalResult(query, company, year, top_k, trace_id or uuid4().hex, documents, hits)
