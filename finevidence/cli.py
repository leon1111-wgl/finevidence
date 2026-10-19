"""Parse terminal commands and display original evidence with source identities."""

import argparse
import json
from pathlib import Path
import sys
from uuid import uuid4

from .documents import DocumentError, import_documents
from .retrieval import QueryError, SearchHit
from .workflow import response_envelope, retrieve


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "synthetic"
INDEX_PATH = ROOT / "data" / "index.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="FinEvidence — source-linked financial document retrieval")
    commands = parser.add_subparsers(dest="command", required=True)
    importer = commands.add_parser("import", help="从 data/synthetic 导入虚构 JSON 文档")
    importer.add_argument("filenames", nargs="+", help="数据目录内的相对 JSON 文件名")
    query = commands.add_parser("query", help="用英文问题查找原文段落")
    query.add_argument("question")
    query.add_argument("--top-k", type=int, default=3, help="最多展示几段原文（默认 3）")
    query.add_argument("--company", help="精确匹配公司元数据（区分大小写）")
    query.add_argument("--year", type=int, help="筛选报告年度")
    query.add_argument("--json", action="store_true", dest="as_json", help="输出结构化证据和状态")
    return parser


def print_hits(hits: list[SearchHit]) -> None:
    print("SYNTHETIC — 全部为虚构教学数据；page 是合成页码，不是 PDF 页码。")
    print("仅显示检索原文；BM25 分数不是置信度，不生成答案。")
    if not hits:
        print("NO_MATCH — 未检索到词语匹配片段；这不代表文档没有披露。")
        return
    print(f"FOUND hits={len(hits)}")
    for rank, hit in enumerate(hits, start=1):
        chunk = hit.chunk
        print(f"\n[{rank}] score={hit.score:.6f} chunk_id={chunk.chunk_id}")
        print(f"source={chunk.filename} doc_id={chunk.doc_id} page={chunk.page}")
        print(f"company={chunk.company} year={chunk.year}")
        print("原文：")
        print(chunk.text)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    trace_id = uuid4().hex
    try:
        if args.command == "import":
            result = import_documents(DATA_DIR, INDEX_PATH, args.filenames)
            print(
                f"SYNTHETIC imported={result.imported} skipped={result.skipped} "
                f"documents={result.documents} chunks={result.chunks}"
            )
        else:
            result = retrieve(
                INDEX_PATH, args.question, args.top_k,
                company=args.company, year=args.year, trace_id=trace_id,
            )
            if args.as_json:
                print(json.dumps(result.as_dict(), ensure_ascii=False, indent=2))
            else:
                print_hits(result.hits)
    except (DocumentError, QueryError) as exc:
        if getattr(args, "as_json", False):
            payload = response_envelope(trace_id, str(exc).split(":", 1)[0])
            payload["error"] = str(exc)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(str(exc), file=sys.stderr)
        return 2
    except OSError as exc:
        message = f"IO_ERROR: {exc.strerror or type(exc).__name__}"
        if getattr(args, "as_json", False):
            payload = response_envelope(trace_id, "IO_ERROR")
            payload["error"] = message
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(message, file=sys.stderr)
        return 2
    return 0
