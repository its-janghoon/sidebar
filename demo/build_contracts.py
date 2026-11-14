"""Build the demo contract versions from the Common Paper Cloud Service Agreement.

Source: Common Paper Cloud Service Agreement Standard Terms v3.0,
https://github.com/CommonPaper/CSA, licensed CC BY 4.0. We fill in the
variables and make the counterparty edits that the demo shows. Output:
demo/out/Northwind_CSA_v1.docx, v2.docx (+ .txt copies for checking).
"""
import html
import re
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "CSA.md"
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

VARS = {
    "Subscription Period": "the Subscription Period",
    "General Cap Amount": "the fees paid or payable by Customer in the 12 months before the claim",
    "Governing Law": "laws of the State of New York",
    "Chosen Courts": "state or federal courts in New York County",
}


def flatten(md: str) -> list[str]:
    """Markdown with nested numbered lists -> numbered paragraphs."""
    paras = []
    stack = []  # numbering per depth
    for raw in md.splitlines():
        if not raw.strip() or raw.startswith("# "):
            continue
        m = re.match(r"^(\s*)(\d+|[a-z]|[ivx]+)\.\s+(.*)$", raw)
        if not m:
            if paras:
                paras[-1] += " " + raw.strip()
            continue
        depth = len(m.group(1)) // 4
        label, body = m.group(2), m.group(3)
        stack = stack[:depth] + [label]
        body = clean(body)
        if depth == 0:
            paras.append(f"{label}. {body}")
        elif depth == 1:
            paras.append(f"{stack[0]}.{label} {body}")
        else:
            paras.append(f"({label}) {body}")
    return paras


def clean(s: str) -> str:
    s = re.sub(r"<span[^>]*>(.*?)</span>", r"\1", s)
    s = s.replace("**", "")
    s = re.sub(r"<(https?://[^>]+)>", r"\1", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def fill(paras):
    out = []
    for p in paras:
        p = p.replace("Except as provided in the Cover Page, each", "Each")
        p = p.replace(" and as provided in the Cover Page,", ",")
        p = p.replace("the General Cap Amount", VARS["General Cap Amount"])
        p = p.replace("The Governing Law will govern", "The laws of the State of New York will govern")
        p = p.replace("the Chosen Courts", VARS["Chosen Courts"])
        out.append(p)
    return out


def edit(paras, old, new):
    """Replace a phrase in exactly one paragraph; fail loudly if missing."""
    hits = [i for i, p in enumerate(paras) if old in p]
    if len(hits) != 1:
        raise SystemExit(f"edit target found {len(hits)} times: {old[:60]}")
    i = hits[0]
    paras[i] = paras[i].replace(old, new)
    return paras


def write_docx(paras, path: Path, title: str):
    body = "".join(
        f'<w:p><w:r>{"<w:rPr><w:b/></w:rPr>" if re.match(r"^\d+\. ", p) else ""}'
        f'<w:t xml:space="preserve">{html.escape(p)}</w:t></w:r></w:p>'
        for p in [title] + paras
    )
    doc = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body></w:document>"
    )
    ct = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", doc)
    path.with_suffix(".txt").write_text("\n".join([title] + paras) + "\n")


base = fill(flatten(SRC.read_text()))
TITLE = "Cloud Service Agreement between Northwind Supply Co. (Provider) and Acme Robotics Inc. (Customer). Based on Common Paper CSA Standard Terms v3.0 (CC BY 4.0)."

# v1: Northwind's first draft. Four changes against Acme's playbook.
v1 = list(base)
edit(v1, "the fees paid or payable by Customer in the 12 months before the claim", "the fees paid by Customer in the 1 month before the claim")
edit(v1, "under no circumstances will either party be liable to the other for", "under no circumstances will Provider be liable to Customer for")
edit(v1, "The laws of the State of New York will govern", "The laws of the State of Delaware will govern")
edit(v1, "state or federal courts in New York County", "state or federal courts in New Castle County, Delaware")

# v2: Northwind "fixes" the cap but keeps the one-sided waiver and Delaware,
# and quietly stretches the payment dispute window.
v2 = list(v1)
edit(v2, "the fees paid by Customer in the 1 month before the claim", "the fees paid or payable by Customer in the 12 months before the claim")
edit(v2, "within 30 days of an automatic payment", "within 10 days of an automatic payment")

write_docx(v1, OUT / "Northwind_CSA_v1.docx", TITLE)
write_docx(v2, OUT / "Northwind_CSA_v2.docx", TITLE)
print(len(v1), "paragraphs")
