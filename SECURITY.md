# Security and Privacy

Please do not post private documents, detector reports, API keys, provider URLs, local config files, or unreleased thesis content in public issues.

## Data flow

- The Web UI stores model provider settings in the local user config file.
- Uploaded documents are copied into local runtime folders such as `origin/` and `finish/`.
- Rewrite requests send editable paragraph text to the model provider configured by the user.
- Protected areas such as table of contents, figures, tables, formulas, and references are not sent to the rewrite pipeline.
- External detector reports are used only as feedback/location material; the project does not provide its own external AI detector.

## Reporting

If you need to report a bug, open 启动诊断 in the Web UI and click 复制诊断信息, then review and redact the copied payload before pasting it into an issue.

If a report contains sensitive content, replace the document text with a minimal synthetic sample that reproduces the issue.

## Release hygiene

Before publishing a repository snapshot, run:

```powershell
python scripts/open_source_audit.py
```

The audit blocks likely API keys, private model provider URLs, personal absolute paths, old project names, and mojibake text. Warnings about local PDFs, DOCX files, screenshots, `finish/`, `origin/`, `logs/`, `app/dist/`, and `app/node_modules/` must be checked before committing.
