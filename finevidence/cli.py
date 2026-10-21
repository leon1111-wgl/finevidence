"""Parse terminal commands and display original evidence with source identities."""

import argparse
import json
from pathlib import Path
import sys
from uuid import uuid4

from .documents import DocumentError, import_documents
from .facts import FinanceError
from .fact_store import build_fact_store
from .retrieval import QueryError, SearchHit
from .workflow import (
    calculation_envelope, calculate_margin, calculate_margin_change, calculate_revenue_growth,
    response_envelope, retrieve, store_build_envelope,
)


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "synthetic"
INDEX_PATH = ROOT / "data" / "index.json"
FACTS_PATH = ROOT / "data" / "facts" / "synthetic.json"
DATABASE_PATH = ROOT / "data" / "facts.sqlite"


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
    builder = commands.add_parser("build-facts", help="校验合成事实并新建 SQLite 快照，不覆盖已有文件")
    builder.add_argument("--json", action="store_true", dest="as_json")
    calculator = commands.add_parser("calculate", help="计算虚构事实的毛利率、收入同比或毛利率百分点变化")
    calculator.add_argument("operation", choices=("gross-margin", "revenue-growth", "gross-margin-change"))
    calculator.add_argument("--company", required=True, help="精确匹配虚构公司")
    calculator.add_argument("--year", type=int, required=True, help="完整公历年度；跨年计算自动比较上一年")
    calculator.add_argument("--fact-store", choices=("manifest", "sqlite"), default="manifest",
                            help="明确选择 JSON 清单或只读 SQLite 快照（默认 manifest）")
    calculator.add_argument("--json", action="store_true", dest="as_json")
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
    envelope = {"calculate": calculation_envelope, "build-facts": store_build_envelope}.get(
        args.command, response_envelope,
    )
    try:
        if args.command == "import":
            result = import_documents(DATA_DIR, INDEX_PATH, args.filenames)
            print(
                f"SYNTHETIC imported={result.imported} skipped={result.skipped} "
                f"documents={result.documents} chunks={result.chunks}"
            )
        elif args.command == "build-facts":
            result = build_fact_store(FACTS_PATH, DATA_DIR, INDEX_PATH, DATABASE_PATH)
            payload = envelope(trace_id, "FACT_STORE_BUILT")
            payload.update(result)
            if args.as_json:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            else:
                print(f"SYNTHETIC FACT_STORE_BUILT facts={result['fact_count']} schema=1")
        elif args.command == "calculate":
            calculate = {"gross-margin": calculate_margin, "revenue-growth": calculate_revenue_growth,
                         "gross-margin-change": calculate_margin_change}[args.operation]
            payload = calculate(INDEX_PATH, FACTS_PATH, DATA_DIR, args.company, args.year,
                                trace_id=trace_id,
                                database_path=DATABASE_PATH if args.fact_store == "sqlite" else None)
            if args.as_json:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            else:
                print(payload["answer"])
                calculation = payload["calculations"][0]
                print(f"formula={calculation['formula']} unit={calculation['unit']} value={calculation['value']}")
                for fact in payload["facts"]:
                    print(f"{fact['fact_id']} {fact['metric']}={fact['raw_value']} * {fact['unit_scale']}"
                          f" = {fact['normalized_value']} {fact['currency']}")
                for citation in payload["citations"]:
                    print(f"source={citation['source_file']} page={citation['page']} (synthetic)")
                    print(citation["excerpt"])
                print("SYNTHETIC — 仅工程测试夹具；未经人工核验，不代表真实财务结果。")
        else:
            result = retrieve(
                INDEX_PATH, args.question, args.top_k, data_dir=DATA_DIR,
                company=args.company, year=args.year, trace_id=trace_id,
            )
            if args.as_json:
                print(json.dumps(result.as_dict(), ensure_ascii=False, indent=2))
            else:
                print_hits(result.hits)
    except (DocumentError, QueryError, FinanceError) as exc:
        if getattr(args, "as_json", False):
            payload = envelope(trace_id, str(exc).split(":", 1)[0])
            payload["error"] = str(exc)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(str(exc), file=sys.stderr)
        return 2
    except OSError as exc:
        message = f"IO_ERROR: {exc.strerror or type(exc).__name__}"
        if getattr(args, "as_json", False):
            payload = envelope(trace_id, "IO_ERROR")
            payload["error"] = message
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print(message, file=sys.stderr)
        return 2
    return 0
