"""Seed the demo site: playbook page, a past matter and the main request.

Usage:
  python3 seed.py playbook          # create or update the Confluence playbook
  python3 seed.py past              # create the earlier Northwind matter
  python3 seed.py request           # create the main request with v1 attached
  python3 seed.py attach KEY FILE   # attach another version
"""
import base64
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

SITE = "https://one-atlas-fczx.atlassian.net"
HOME = Path.home() / ".atlassian"
AUTH = base64.b64encode(
    f"{(HOME / 'forge_email').read_text().strip()}:{(HOME / 'forge_token').read_text().strip()}".encode()
).decode()
HERE = Path(__file__).parent
SPACE_ID = "1081345"  # Confluence space LEGAL
DESK = "10"  # Commercial Legal Service Desk
REQ_TYPE = "126"  # Request a contract review


def call(method, path, body=None, headers=None, raw=None):
    h = {"Authorization": f"Basic {AUTH}", "Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    if raw is not None:
        data = raw
    h.update(headers or {})
    req = urllib.request.Request(SITE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code} {e.read().decode()[:400]}")


def user(name):
    users = call("GET", f"/rest/api/3/user/search?query={urllib.parse.quote(name)}")
    return next(u["accountId"] for u in users if u["displayName"] == name)


PLAYBOOK = [
    ("Limitation of liability", "liability, limitation of liability, liability cap", "high",
     "Each party's total liability is capped at the fees paid or payable in the 12 months before the claim.",
     "A cap between 12 and 24 months of fees, applying to both parties.",
     "Each party's total cumulative liability for all claims arising out of or relating to this Agreement will not be more than the fees paid or payable by Customer in the 12 months before the claim.",
     "1 month; unlimited; uncapped"),
    ("Indirect damages", "indirect damages, consequential, indirect damages waiver", "high",
     "The waiver of lost profits and indirect damages is mutual and protects both parties.",
     "Carve-outs for confidentiality breaches and indemnity obligations, if they apply to both parties.",
     "Except for a breach of Section 10 (Confidentiality), under no circumstances will either party be liable to the other for lost profits or revenues, or for consequential, special, indirect, exemplary, punitive, or incidental damages.",
     "will provider be liable to customer; will customer be liable to provider"),
    ("Governing law", "governing law, chosen courts, jurisdiction", "medium",
     "New York law and the state or federal courts in New York County.",
     "New York, California, or England and Wales.",
     "The laws of the State of New York will govern all interpretations and disputes about this Agreement, and the parties will bring any suit in the state or federal courts in New York County.",
     "delaware"),
    ("Payment disputes", "payment dispute, payment, fees", "low",
     "Customer has at least 30 days after an automatic payment to dispute fees.",
     "30 to 60 days.",
     "Customer must notify Provider about the dispute before payment is due, or within 30 days of an automatic payment.",
     "within 10 days; within 7 days; within 5 days"),
    ("Renewal and termination", "term, termination, renewal", "low",
     "Automatic renewal is fine if either party can give notice of non-renewal at least 30 days before the end of the term.",
     "Notice periods of 30 to 90 days.",
     "The Agreement renews for additional Subscription Periods unless one party gives notice of non-renewal at least 30 days before the end of the current period.",
     "no right to terminate; 180 days"),
]


def playbook_html():
    parts = [
        "<p>Acme Robotics standard positions for customer contracts. Sidebar reads this page. "
        "Each clause is a heading followed by Match, Risk, Standard, Allowed, Fallback and Red flags.</p>"
    ]
    for title, match, risk, std, allowed, fallback, flags in PLAYBOOK:
        parts.append(
            f"<h2>{title}</h2>"
            f"<p><strong>Match:</strong> {match}</p>"
            f"<p><strong>Risk:</strong> {risk}</p>"
            f"<p><strong>Standard:</strong> {std}</p>"
            f"<p><strong>Allowed:</strong> {allowed}</p>"
            f"<p><strong>Fallback:</strong> {fallback}</p>"
            f"<p><strong>Red flags:</strong> {flags}</p>"
        )
    return "".join(parts)


def seed_playbook():
    found = call("GET", f"/wiki/api/v2/spaces/{SPACE_ID}/pages?title=Sidebar%20Playbook&body-format=storage")
    body = {"representation": "storage", "value": playbook_html()}
    if found["results"]:
        p = found["results"][0]
        cur = call("GET", f"/wiki/api/v2/pages/{p['id']}")
        call("PUT", f"/wiki/api/v2/pages/{p['id']}", {
            "id": p["id"], "status": "current", "title": "Sidebar Playbook", "body": body,
            "version": {"number": cur["version"]["number"] + 1},
        })
        print("updated playbook", p["id"])
    else:
        p = call("POST", "/wiki/api/v2/pages", {"spaceId": SPACE_ID, "status": "current", "title": "Sidebar Playbook", "body": body})
        print("created playbook", p["id"])


def create_request(summary, description, on_behalf, party="Northwind Supply Co.", dept="Operations"):
    r = call("POST", "/rest/servicedeskapi/request", {
        "serviceDeskId": DESK, "requestTypeId": REQ_TYPE, "raiseOnBehalfOf": user(on_behalf),
        "requestFieldValues": {"summary": summary, "description": description, "customfield_10169": party, "customfield_10170": dept},
    })
    return r["issueKey"]


def attach(key, file):
    f = Path(file)
    boundary = "sidebarboundary7d3"
    raw = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{f.name}\"\r\n"
        "Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n"
    ).encode() + f.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    call("POST", f"/rest/api/3/issue/{key}/attachments", raw=raw, headers={
        "X-Atlassian-Token": "no-check", "Content-Type": f"multipart/form-data; boundary={boundary}",
    })
    print("attached", f.name, "to", key)


def seed_past():
    key = create_request(
        "Data processing agreement · Northwind Supply Co.",
        "DPA for the 2025 Northwind pilot. Signed in March 2025.",
        "Mitch Davis",
    )
    decisions = {
        "past-1": {"action": "replied", "clause": "§8 Limitation of liability", "title": "§8.1 liability cap.",
                   "text": "Each party's liability is capped at the fees paid or payable in the 12 months before the claim. Indirect damages are excluded for both parties.",
                   "by": "Sara Kim", "at": "2025-03-04T10:00:00Z"},
        "past-2": {"action": "accepted", "clause": "§12 Governing law", "title": "§12.3 Delaware law.",
                   "text": "Delaware law, because the pilot was under USD 50k. Approved once, not a precedent.",
                   "by": "Sara Kim", "at": "2025-03-04T10:05:00Z"},
    }
    call("PUT", f"/rest/api/3/issue/{key}/properties/sidebar-decisions", decisions)
    print("past matter", key)


def seed_request():
    key = create_request(
        "Cloud service agreement · Northwind Supply Co.",
        "Northwind sent their paper for the inventory platform. Annual value about USD 240k. We need signature by Dec 5.",
        "Alana Grant",
    )
    attach(key, HERE / "out" / "Northwind_CSA_v1.docx")
    print("request", key)


if __name__ == "__main__":
    import urllib.parse  # noqa: E402

    cmd = sys.argv[1]
    if cmd == "playbook":
        seed_playbook()
    elif cmd == "past":
        seed_past()
    elif cmd == "request":
        seed_request()
    elif cmd == "attach":
        attach(sys.argv[2], sys.argv[3])
