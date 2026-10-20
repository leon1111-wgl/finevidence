"""Small, explicit BM25 implementation; no network, model, or answer generation."""

from collections import Counter
from dataclasses import dataclass
import math
import re

from .documents import Chunk


class QueryError(ValueError):
    """The query cannot be processed by this English-only baseline."""


@dataclass(frozen=True)
class SearchHit:
    chunk: Chunk
    score: float


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def validate_query_text(query: str) -> None:
    """Reject invalid text before tokenization or response serialization."""
    if not isinstance(query, str) or not query.strip():
        raise QueryError("INVALID_QUERY: query must be a nonempty string")
    try:
        query.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise QueryError("INVALID_QUERY: query must contain valid Unicode scalar values") from exc


def search(chunks: list[Chunk], query: str, top_k: int = 3) -> list[SearchHit]:
    if type(top_k) is not int or top_k < 1:
        raise QueryError("INVALID_TOP_K: top_k must be a positive integer")
    validate_query_text(query)
    terms = sorted(set(tokenize(query)))
    if not terms or any(character.isalpha() and not character.isascii() for character in query):
        raise QueryError("INVALID_QUERY: use a nonempty English query; M1 has no translation")
    if not chunks:
        return []

    token_counts = [Counter(tokenize(chunk.text)) for chunk in chunks]
    lengths = [sum(counts.values()) for counts in token_counts]
    average_length = sum(lengths) / len(chunks)
    if average_length == 0:
        return []
    document_frequency = Counter()
    for counts in token_counts:
        document_frequency.update(counts.keys())

    k1, b = 1.2, 0.75
    hits = []
    for chunk, counts, length in zip(chunks, token_counts, lengths):
        score = 0.0
        for term in terms:
            frequency = counts[term]
            if frequency == 0:
                continue
            df = document_frequency[term]
            inverse_frequency = math.log(1 + (len(chunks) - df + 0.5) / (df + 0.5))
            length_adjustment = 1 - b + b * length / average_length
            score += inverse_frequency * frequency * (k1 + 1) / (frequency + k1 * length_adjustment)
        if score > 0:
            hits.append(SearchHit(chunk, score))
    hits.sort(key=lambda hit: (-hit.score, hit.chunk.chunk_id))
    return hits[:top_k]
