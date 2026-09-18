from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from copy import deepcopy
from pathlib import Path
from typing import Any

from docx import Document
from lxml import etree

from core_documents import _rewriteable_text_nodes


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W_BODY = f"{{{W_NS}}}body"
W_T = f"{{{W_NS}}}t"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
NS = {"w": W_NS}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def preserve_outer_whitespace(original: str, replacement: str) -> str:
    if not original or not original.strip():
        return original
    leading = re.match(r"^\s*", original).group(0)
    trailing = re.search(r"\s*$", original).group(0)
    return f"{leading}{replacement.strip()}{trailing}"


def effective_replacements(run: dict[str, Any], document: dict[str, Any]) -> dict[str, str]:
    chunks: dict[str, list[dict[str, Any]]] = {}
    for chunk in run.get("chunks", []):
        chunks.setdefault(str(chunk["paragraphId"]), []).append(chunk)
    decisions = run.get("reviewDecisions", {})
    result: dict[str, str] = {}
    for paragraph in document.get("paragraphs", []):
        if not paragraph.get("selected"):
            continue
        paragraph_id = str(paragraph["id"])
        decision = decisions.get(paragraph_id, {"decision": "rewrite", "text": ""})
        choice = str(decision.get("decision") or "rewrite")
        if choice == "original":
            result[paragraph_id] = str(paragraph.get("text") or "")
            continue
        if choice == "manual":
            value = str(decision.get("text") or "")
            if not value.strip():
                raise AssertionError(f"manual decision is empty for {paragraph_id}")
            result[paragraph_id] = value
            continue
        items = sorted(chunks.get(paragraph_id, []), key=lambda item: int(item["partIndex"]))
        if not items or any(item.get("status") != "completed" for item in items):
            raise AssertionError(f"rewrite is incomplete for {paragraph_id}")
        value = ""
        for index, item in enumerate(items):
            text = str(item.get("finalText") or "")
            joiner = str(item.get("joinerBefore") or "") if index else ""
            if joiner and value and text and not value[-1].isspace() and not text[0].isspace():
                value += joiner
            value += text
        result[paragraph_id] = value
    return result


def normalized_structure(root: etree._Element) -> bytes:
    copy = deepcopy(root)
    for node in copy.iter(W_T):
        node.text = "__TEXT__"
        node.attrib.pop(XML_SPACE, None)
    return etree.tostring(copy, method="c14n", with_comments=True)


def zip_metadata(info: zipfile.ZipInfo) -> tuple[Any, ...]:
    return (
        info.filename,
        info.date_time,
        info.compress_type,
        info.comment,
        info.extra,
        info.create_system,
        info.create_version,
        info.extract_version,
        info.volume,
        info.internal_attr,
        info.flag_bits & ~0x000E,
    )


def equivalent_zip_metadata(left: zipfile.ZipInfo, right: zipfile.ZipInfo) -> bool:
    if zip_metadata(left) != zip_metadata(right):
        return False
    if left.external_attr == right.external_attr:
        return True
    return left.external_attr == 0 and right.external_attr == (0o600 << 16)


def raw_zip_metadata(info: zipfile.ZipInfo) -> tuple[Any, ...]:
    return (
        zip_metadata(info),
        info.external_attr,
        info.flag_bits,
        info.CRC,
        info.compress_size,
        info.file_size,
    )


def validate(args: argparse.Namespace) -> dict[str, Any]:
    source = Path(args.source).resolve()
    output = Path(args.output).resolve()
    document_path = Path(args.document_manifest).resolve()
    run_path = Path(args.run_manifest).resolve()
    manual_path = Path(args.manual_text).resolve() if args.manual_text else None
    required_paths = [source, output, document_path, run_path]
    if manual_path is not None:
        required_paths.append(manual_path)
    for path in required_paths:
        if not path.is_file():
            raise FileNotFoundError(path)

    document = json.loads(document_path.read_text(encoding="utf-8"))
    run = json.loads(run_path.read_text(encoding="utf-8"))
    source_hash = sha256_file(source)
    if source_hash != document.get("sourceHash"):
        raise AssertionError("source hash differs from the imported document snapshot")
    replacements = effective_replacements(run, document)
    selected = {int(item["bodyChildIndex"]): item for item in document["paragraphs"] if item.get("selected")}
    selected_ids = {str(item["id"]) for item in selected.values()}
    if set(replacements) != selected_ids:
        raise AssertionError("replacement IDs do not match the selected paragraph IDs")

    parser = etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=False)
    with zipfile.ZipFile(source, "r") as before_zip, zipfile.ZipFile(output, "r") as after_zip:
        corrupt_entry = after_zip.testzip()
        if corrupt_entry is not None:
            raise AssertionError(f"corrupt ZIP entry: {corrupt_entry}")
        before_infos = before_zip.infolist()
        after_infos = after_zip.infolist()
        before_names = [item.filename for item in before_infos]
        after_names = [item.filename for item in after_infos]
        if before_names != after_names:
            raise AssertionError("ZIP package part names or order changed")
        raw_metadata_differences = [
            left.filename
            for left, right in zip(before_infos, after_infos)
            if raw_zip_metadata(left) != raw_zip_metadata(right)
        ]
        metadata_differences = [
            left.filename
            for left, right in zip(before_infos, after_infos)
            if not equivalent_zip_metadata(left, right)
        ]
        if metadata_differences:
            raise AssertionError(f"meaningful ZIP metadata changed: {metadata_differences}")
        non_document_differences = [
            name
            for name in before_names
            if name != "word/document.xml" and before_zip.read(name) != after_zip.read(name)
        ]
        if non_document_differences:
            raise AssertionError(f"non-document package parts changed: {non_document_differences}")
        before_xml = before_zip.read("word/document.xml")
        after_xml = after_zip.read("word/document.xml")

    before_root = etree.fromstring(before_xml, parser=parser)
    after_root = etree.fromstring(after_xml, parser=parser)
    if normalized_structure(before_root) != normalized_structure(after_root):
        raise AssertionError("document.xml structure changed beyond w:t/xml:space")
    before_body = before_root.find("w:body", namespaces=NS)
    after_body = after_root.find("w:body", namespaces=NS)
    if before_body is None or after_body is None:
        raise AssertionError("word/document.xml has no w:body")
    before_children = list(before_body)
    after_children = list(after_body)
    if len(before_children) != len(after_children):
        raise AssertionError("body child count changed")

    changed_body_indexes: list[int] = []
    changed_text_nodes = 0
    selected_results: list[dict[str, Any]] = []
    for index, (left, right) in enumerate(zip(before_children, after_children)):
        left_bytes = etree.tostring(left)
        right_bytes = etree.tostring(right)
        if left_bytes != right_bytes:
            changed_body_indexes.append(index)
        left_all_nodes = list(left.iter(W_T))
        right_all_nodes = list(right.iter(W_T))
        if len(left_all_nodes) != len(right_all_nodes):
            raise AssertionError(f"w:t count changed at body child {index}")
        if index not in selected:
            if left_bytes != right_bytes:
                raise AssertionError(f"unselected body child changed at index {index}")
            continue
        paragraph = selected[index]
        paragraph_id = str(paragraph["id"])
        left_nodes = _rewriteable_text_nodes(left)
        right_nodes = _rewriteable_text_nodes(right)
        if len(left_nodes) != int(paragraph.get("textNodeCount") or 0):
            raise AssertionError(f"stored text-node mapping differs for {paragraph_id}")
        if len(right_nodes) != len(left_nodes):
            raise AssertionError(f"rewriteable text-node count changed for {paragraph_id}")
        left_rewriteable = set(left_nodes)
        right_rewriteable = set(right_nodes)
        for left_node, right_node in zip(left_all_nodes, right_all_nodes):
            if left_node in left_rewriteable or right_node in right_rewriteable:
                continue
            if etree.tostring(left_node) != etree.tostring(right_node):
                raise AssertionError(f"fixed inline text changed for {paragraph_id}")
        original_text = "".join(node.text or "" for node in left_nodes)
        exported_text = "".join(node.text or "" for node in right_nodes)
        if original_text != str(paragraph.get("text") or ""):
            raise AssertionError(f"source paragraph mapping differs for {paragraph_id}")
        expected_text = preserve_outer_whitespace(original_text, replacements[paragraph_id])
        if exported_text != expected_text:
            raise AssertionError(f"exported paragraph does not match the accepted result for {paragraph_id}")
        for left_node, right_node in zip(left_nodes, right_nodes):
            left_attrs = dict(left_node.attrib)
            right_attrs = dict(right_node.attrib)
            left_attrs.pop(XML_SPACE, None)
            right_attrs.pop(XML_SPACE, None)
            if left_attrs != right_attrs:
                raise AssertionError(f"w:t attributes changed for {paragraph_id}")
            value = right_node.text or ""
            if (value[:1].isspace() or value[-1:].isspace()) and right_node.get(XML_SPACE) != "preserve":
                raise AssertionError(f"xml:space is missing for {paragraph_id}")
            if (left_node.text or "") != value:
                changed_text_nodes += 1
        selected_results.append(
            {
                "paragraphId": paragraph_id,
                "bodyChildIndex": index,
                "textNodeCount": len(right_nodes),
                "sourceLength": len(original_text),
                "exportedLength": len(exported_text),
                "exportedSha256": sha256_bytes(exported_text.encode("utf-8")),
            }
        )

    if not set(changed_body_indexes).issubset(set(selected)):
        raise AssertionError("a body child outside the selected scope changed")
    manual_paragraph_id = ""
    manual_text_matched: bool | None = None
    if manual_path is not None:
        manual_text = manual_path.read_text(encoding="utf-8")
        manual_paragraph_id = manual_path.stem.removeprefix("manual-edit-")
        manual_decision = run.get("reviewDecisions", {}).get(manual_paragraph_id, {})
        if manual_decision.get("decision") != "manual" or manual_decision.get("text") != manual_text:
            raise AssertionError("saved manual decision does not match the evidence text")
        manual_result = next((item for item in selected_results if item["paragraphId"] == manual_paragraph_id), None)
        if not manual_result:
            raise AssertionError("manual paragraph is not in the exported selected scope")
        manual_result["manualEvidenceSha256"] = sha256_bytes(manual_text.encode("utf-8"))
        manual_result["manualTextMatched"] = manual_result["exportedSha256"] == manual_result["manualEvidenceSha256"]
        if not manual_result["manualTextMatched"]:
            raise AssertionError("manual text was not written to the exported DOCX")
        manual_text_matched = True

    reopened = Document(str(output))
    return {
        "ok": True,
        "source": str(source),
        "output": str(output),
        "sourceSha256": source_hash,
        "outputSha256": sha256_file(output),
        "packagePartCount": len(before_names),
        "packagePartOrderUnchanged": before_names == after_names,
        "packageMetadataDifferences": metadata_differences,
        "rawContainerMetadataDifferences": raw_metadata_differences,
        "rawContainerMetadataNote": "Python zipfile only normalized compressor flags and empty external attributes; these do not change OOXML or Word formatting.",
        "nonDocumentPartsByteIdentical": not non_document_differences,
        "documentStructureUnchanged": True,
        "bodyChildCount": len(before_children),
        "selectedBodyIndexes": sorted(selected),
        "changedBodyIndexes": changed_body_indexes,
        "changedTextNodeCount": changed_text_nodes,
        "selectedResults": selected_results,
        "manualParagraphId": manual_paragraph_id,
        "manualTextMatched": manual_text_matched,
        "pythonDocxReopen": {
            "paragraphCount": len(reopened.paragraphs),
            "tableCount": len(reopened.tables),
            "sectionCount": len(reopened.sections),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--document-manifest", required=True)
    parser.add_argument("--run-manifest", required=True)
    parser.add_argument("--manual-text")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    report_path = Path(args.report).resolve()
    try:
        report = validate(args)
    except Exception as exc:  # noqa: BLE001 - the report must preserve any independent validation failure.
        report = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
