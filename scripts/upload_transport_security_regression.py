from __future__ import annotations

import base64
import hashlib
from io import BytesIO
import json
from pathlib import Path
import tempfile
import zipfile

from docx import Document  # type: ignore[import]

import docx_security
import web_app


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "upload_transport_security_regression_report.json"


def _docx_bytes(text: str = "安全上传正文") -> bytes:
    document = Document()
    document.add_paragraph(text)
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _minimal_docx_bytes(*, extra_parts: list[tuple[str, bytes]] | None = None) -> bytes:
    content_types = b"""<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
    relationships = b"""<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    document_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>"""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", relationships)
        archive.writestr("word/document.xml", document_xml)
        for name, payload in extra_parts or []:
            archive.writestr(name, payload)
    return buffer.getvalue()


def _expect_unsafe(payload: bytes, expected_fragment: str) -> None:
    with tempfile.NamedTemporaryFile(suffix=".docx") as handle:
        handle.write(payload)
        handle.flush()
        try:
            docx_security.validate_docx_package(Path(handle.name))
        except docx_security.UnsafeDocxError as exc:
            assert expected_fragment.lower() in str(exc).lower(), str(exc)
        else:
            raise AssertionError(f"unsafe DOCX was accepted: {expected_fragment}")


def run() -> dict[str, object]:
    checks: list[str] = []
    valid_docx = _docx_bytes()
    with tempfile.NamedTemporaryFile(suffix=".docx") as handle:
        handle.write(valid_docx)
        handle.flush()
        report = docx_security.validate_docx_package(Path(handle.name))
        assert report["ok"] is True
        assert report["entryCount"] >= 3
    checks.append("normal python-docx packages pass bounded OOXML preflight")

    _expect_unsafe(b"not-a-zip", "signature")
    _expect_unsafe(_minimal_docx_bytes(extra_parts=[("../escape.xml", b"x")]), "unsafe part path")
    _expect_unsafe(
        _minimal_docx_bytes(extra_parts=[("customXml/item1.xml", b"<!DOCTYPE x [<!ENTITY y 'z'>]><x>&y;</x>")]),
        "DTD or entity",
    )
    _expect_unsafe(
        _minimal_docx_bytes(
            extra_parts=[
                (
                    "customXml/late-entity.xml",
                    b" " * (docx_security.MAX_XML_PROLOG_SCAN_BYTES + 1024)
                    + b"<!DOCTYPE x [<!ENTITY y 'z'>]><x>&y;</x>",
                )
            ]
        ),
        "DTD or entity",
    )
    _expect_unsafe(
        _minimal_docx_bytes(extra_parts=[("word/media/bomb.bin", b"A" * (8 * 1024 * 1024))]),
        "compression ratio",
    )
    checks.append("bad signatures, traversal, XML entities, and high-ratio ZIP bombs fail closed")

    with tempfile.TemporaryDirectory(prefix="fyadr-upload-regression-") as temporary_name:
        root = Path(temporary_name)
        original_dirs = (web_app.ORIGIN_DIR, web_app.EXPORT_DIR, web_app.TASK_STATE_DIR)
        try:
            web_app.ORIGIN_DIR = root / "origin"
            web_app.EXPORT_DIR = root / "finish" / "web_exports"
            web_app.TASK_STATE_DIR = root / "finish" / "intermediate" / "task_states"
            client = web_app.app.test_client()

            text_payload = "流式文本上传".encode("utf-8")
            text_response = client.post(
                "/api/upload-document",
                data={"file": (BytesIO(text_payload), "thesis.txt")},
                content_type="multipart/form-data",
            )
            assert text_response.status_code == 201, text_response.get_data(as_text=True)
            text_path = Path(text_response.get_json()["sourcePath"])
            assert text_path.read_bytes() == text_payload
            assert text_path.parent.name == hashlib.sha256(text_payload).hexdigest()

            docx_response = client.post(
                "/api/upload-document",
                data={"file": (BytesIO(valid_docx), "thesis.docx")},
                content_type="multipart/form-data",
            )
            assert docx_response.status_code == 201, docx_response.get_data(as_text=True)
            docx_path = Path(docx_response.get_json()["sourcePath"])
            assert docx_path.read_bytes() == valid_docx
            checks.append("multipart TXT and DOCX uploads stream into content-addressed storage")

            legacy_response = client.post(
                "/api/upload-document",
                json={
                    "filename": "thesis.docx",
                    "encoding": "base64",
                    "contentBase64": base64.b64encode(valid_docx).decode("ascii"),
                },
            )
            assert legacy_response.status_code == 201
            assert Path(legacy_response.get_json()["sourcePath"]) == docx_path
            checks.append("legacy JSON/Base64 clients remain compatible and deduplicate safely")

            bomb_docx = _minimal_docx_bytes(
                extra_parts=[("word/media/bomb.bin", b"A" * (8 * 1024 * 1024))],
            )
            invalid_cases = [
                client.post(
                    "/api/upload-document",
                    data={"file": (BytesIO(b"pdf"), "thesis.pdf")},
                    content_type="multipart/form-data",
                ),
                client.post(
                    "/api/upload-document",
                    data={"file": (BytesIO(b"\xff\xfe"), "invalid.txt")},
                    content_type="multipart/form-data",
                ),
                client.post(
                    "/api/upload-document",
                    data={"file": (BytesIO(bomb_docx), "bomb.docx")},
                    content_type="multipart/form-data",
                ),
            ]
            assert all(response.status_code == 400 for response in invalid_cases)
            unsupported = client.post("/api/upload-document", data=b"raw", content_type="application/octet-stream")
            assert unsupported.status_code == 415
            assert not list(web_app.ORIGIN_DIR.glob(".upload-*.tmp"))
            checks.append("extension, UTF-8, DOCX preflight, media type, and temporary-file cleanup gates hold")
        finally:
            web_app.ORIGIN_DIR, web_app.EXPORT_DIR, web_app.TASK_STATE_DIR = original_dirs

    documents_source = (ROOT_DIR / "app" / "src" / "lib" / "webServiceDocuments.ts").read_text(encoding="utf-8")
    http_source = (ROOT_DIR / "app" / "src" / "lib" / "webServiceHttp.ts").read_text(encoding="utf-8")
    audit_source = (ROOT_DIR / "scripts" / "docx_audit.py").read_text(encoding="utf-8")
    assert "new FormData()" in documents_source and 'requestBody.append("file", file, file.name)' in documents_source
    assert "readFileAsBase64" not in documents_source and "contentBase64" not in documents_source
    assert "body instanceof FormData" in http_source and "!isMultipart" in http_source
    assert "_BoundedDocxParts" in audit_source and "def sha256(" in audit_source
    assert "return {\n            item.filename: archive.read" not in audit_source
    checks.append("frontend avoids Base64 copies and DOCX audit no longer materializes every ZIP part")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
