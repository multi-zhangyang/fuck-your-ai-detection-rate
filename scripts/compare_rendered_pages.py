from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance


def page_number(path: Path) -> int:
    return int(path.stem.rsplit("-", 1)[-1])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--diff-dir", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    source_dir = Path(args.source_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    diff_dir = Path(args.diff_dir).resolve()
    report_path = Path(args.report).resolve()
    diff_dir.mkdir(parents=True, exist_ok=True)
    source_pages = sorted(source_dir.glob("page-*.png"), key=page_number)
    output_pages = sorted(output_dir.glob("page-*.png"), key=page_number)
    if len(source_pages) != len(output_pages):
        report = {"ok": False, "sourcePageCount": len(source_pages), "outputPageCount": len(output_pages)}
    else:
        pages = []
        for source_path, output_path in zip(source_pages, output_pages):
            source = Image.open(source_path).convert("RGB")
            output = Image.open(output_path).convert("RGB")
            if source.size != output.size:
                pages.append({"page": page_number(source_path), "sameSize": False, "sourceSize": source.size, "outputSize": output.size})
                continue
            difference = ImageChops.difference(source, output)
            bbox = difference.getbbox()
            grayscale = difference.convert("L")
            histogram = grayscale.histogram()
            unchanged_pixels = histogram[0]
            total_pixels = source.width * source.height
            changed_pixels = total_pixels - unchanged_pixels
            item = {
                "page": page_number(source_path),
                "sameSize": True,
                "width": source.width,
                "height": source.height,
                "pixelIdentical": bbox is None,
                "changedPixels": changed_pixels,
                "changedRatio": round(changed_pixels / total_pixels, 8),
                "differenceBox": list(bbox) if bbox else None,
            }
            if bbox:
                enhanced = ImageEnhance.Contrast(difference).enhance(8)
                diff_path = diff_dir / f"diff-page-{item['page']:03d}.png"
                enhanced.save(diff_path)
                item["diffPath"] = str(diff_path)
            pages.append(item)
        changed = [item["page"] for item in pages if not item.get("pixelIdentical", False)]
        unchanged = [item["page"] for item in pages if item.get("pixelIdentical", False)]
        report = {
            "ok": all(item.get("sameSize") for item in pages),
            "sourcePageCount": len(source_pages),
            "outputPageCount": len(output_pages),
            "changedPages": changed,
            "pixelIdenticalPages": unchanged,
            "pages": pages,
        }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
