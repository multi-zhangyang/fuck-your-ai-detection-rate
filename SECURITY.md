# Security and Privacy

Please do not post private documents, detector reports, API keys, provider URLs, local config files, or unreleased thesis content in public issues.

## Data flow

- The Web UI stores model provider settings in the local user config file.
- Uploaded documents are copied into local runtime folders such as `origin/` and `finish/`.
- Rewrite requests send editable paragraph text to the model provider configured by the user.
- Protected areas such as table of contents, figures, tables, formulas, and references are not sent to the rewrite pipeline.
- External detector reports are used only as feedback/location material; the project does not provide its own external AI detector.

## Network boundary

FYADR is a single-user local/trusted-network application. The backend currently
has no built-in login, tenant isolation, or per-route authorization. Its API can
upload and read workspace documents, use saved provider credentials, trigger
paid model calls, change prompts/configuration, and perform destructive history
maintenance.

- Keep the default listeners and Docker port mapping on `127.0.0.1`.
- Do not expose port `8765` directly to the Internet.
- CORS only controls which browser origins may read responses; it is not
  authentication. TLS only encrypts transport; it is not authorization.
- If remote access is required, use a reviewed authentication gateway, restrict
  source networks, enforce request/rate limits, and keep the backend unreachable
  from untrusted peers.
- Only configure provider Base URLs that you trust. A saved API key is bound to
  its saved Base URL; changing that URL requires explicitly entering the key
  again.

On POSIX, the provider configuration directory and file are restricted to
`0700` and `0600`. Configuration writes use an atomic temporary-file replace.
The file still contains usable provider credentials, so do not copy it into bug
reports, images, backups, or shared volumes without equivalent protection.

## Reporting

If you need to report a bug, open 启动诊断 in the Web UI and click 复制诊断信息, then review and redact the copied payload before pasting it into an issue.

If a report contains sensitive content, replace the document text with a minimal synthetic sample that reproduces the issue.

## Release hygiene

Before publishing a repository snapshot, run:

```powershell
python scripts/open_source_audit.py
```

The audit blocks likely API keys, private model provider URLs, personal absolute paths, old project names, and mojibake text. Warnings about local PDFs, DOCX files, screenshots, `finish/`, `origin/`, `logs/`, `app/dist/`, and `app/node_modules/` must be checked before committing.
