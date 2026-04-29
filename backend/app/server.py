import base64
import hashlib
import hmac
import json
import os
import sqlite3
import time
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen

APP_ID = os.getenv("WECHAT_APP_ID", "wx7b15df0f163b627b")
APP_SECRET = os.getenv("WECHAT_APP_SECRET", "")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-before-production")
DB_PATH = Path(os.getenv("DB_PATH", "/opt/taoxi-baba/data/taoxi-baba.sqlite3"))
PORT = int(os.getenv("PORT", "8018"))


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_json({})

    def do_GET(self):
        path, query = self.path_parts()
        try:
            if path == "/health":
                return self.send_json({"status": "ok"})
            if path == "/api/bills":
                openid = self.current_openid()
                family_id = query.get("familyId", [""])[0]
                month = query.get("month", [""])[0]
                assert_member(family_id, openid)
                bills = list_bills(family_id, month)
                return self.send_json({"bills": bills, "summary": summarize(bills)})
            if path.startswith("/api/bills/"):
                openid = self.current_openid()
                family_id = query.get("familyId", [""])[0]
                assert_member(family_id, openid)
                bill = get_bill(path.rsplit("/", 1)[1], family_id)
                return self.send_json({"bill": bill})
            if path == "/api/stats":
                openid = self.current_openid()
                family_id = query.get("familyId", [""])[0]
                month = query.get("month", [""])[0]
                assert_member(family_id, openid)
                return self.send_json(stats(family_id, month))
            if path == "/api/family":
                openid = self.current_openid()
                family_id = query.get("familyId", [""])[0]
                return self.send_json({"family": family_detail(family_id, openid)})
            self.send_error_json(404, "Not found")
        except ApiError as exc:
            self.send_error_json(exc.status, exc.message)
        except Exception as exc:
            self.send_error_json(500, str(exc))

    def do_POST(self):
        path, _ = self.path_parts()
        try:
            body = self.json_body()
            if path == "/api/auth/wechat-login":
                openid = resolve_openid(body.get("code", ""))
                user = get_or_create_user(openid)
                family_id = get_or_create_family(user)
                token = sign_token({"openid": openid, "exp": int(time.time()) + 30 * 24 * 3600})
                return self.send_json({"token": token, "user": user, "familyId": family_id})
            if path == "/api/bills":
                openid = self.current_openid()
                assert_member(body.get("familyId"), openid)
                return self.send_json({"id": create_bill(body, openid)})
            if path == "/api/family/join":
                openid = self.current_openid()
                return self.send_json(request_join(body.get("familyId"), openid))
            if path == "/api/family/approve":
                openid = self.current_openid()
                return self.send_json(review_join(body.get("familyId"), body.get("openid"), openid, True))
            if path == "/api/family/reject":
                openid = self.current_openid()
                return self.send_json(review_join(body.get("familyId"), body.get("openid"), openid, False))
            self.send_error_json(404, "Not found")
        except ApiError as exc:
            self.send_error_json(exc.status, exc.message)
        except Exception as exc:
            self.send_error_json(500, str(exc))

    def do_PUT(self):
        path, _ = self.path_parts()
        try:
            body = self.json_body()
            openid = self.current_openid()
            if path.startswith("/api/bills/"):
                assert_member(body.get("familyId"), openid)
                update_bill(path.rsplit("/", 1)[1], body)
                return self.send_json({"status": "updated"})
            if path == "/api/budget":
                assert_member(body.get("familyId"), openid)
                set_budget(body)
                return self.send_json({"status": "saved"})
            self.send_error_json(404, "Not found")
        except ApiError as exc:
            self.send_error_json(exc.status, exc.message)
        except Exception as exc:
            self.send_error_json(500, str(exc))

    def do_DELETE(self):
        path, query = self.path_parts()
        try:
            openid = self.current_openid()
            if path.startswith("/api/bills/"):
                family_id = query.get("familyId", [""])[0]
                assert_member(family_id, openid)
                delete_bill(path.rsplit("/", 1)[1], family_id)
                return self.send_json({"status": "deleted"})
            self.send_error_json(404, "Not found")
        except ApiError as exc:
            self.send_error_json(exc.status, exc.message)
        except Exception as exc:
            self.send_error_json(500, str(exc))

    def path_parts(self):
        parsed = urlparse(self.path)
        return parsed.path, parse_qs(parsed.query)

    def json_body(self):
        length = int(self.headers.get("content-length", "0") or 0)
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def current_openid(self):
        auth = self.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            raise ApiError(401, "Missing token")
        return verify_token(auth[7:]).get("openid")

    def send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("access-control-allow-headers", "Authorization,Content-Type")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def send_error_json(self, status, message):
        self.send_json({"detail": message}, status)

    def log_message(self, fmt, *args):
        return


class ApiError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY, openid TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL DEFAULT '家庭成员',
              current_family_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS families (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_openid TEXT NOT NULL, member_openids TEXT NOT NULL,
              pending_members TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bills (
              id TEXT PRIMARY KEY, family_id TEXT NOT NULL, type TEXT NOT NULL, category TEXT NOT NULL,
              amount REAL NOT NULL, note TEXT NOT NULL DEFAULT '', bill_date TEXT NOT NULL, month TEXT NOT NULL,
              created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_bills_family_month ON bills(family_id, month);
            CREATE TABLE IF NOT EXISTS budgets (
              id TEXT PRIMARY KEY, family_id TEXT NOT NULL, month TEXT NOT NULL, amount REAL NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(family_id, month)
            );
            """
        )


def connect():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def resolve_openid(code):
    if APP_SECRET:
        url = "https://api.weixin.qq.com/sns/jscode2session?appid={}&secret={}&js_code={}&grant_type=authorization_code".format(APP_ID, APP_SECRET, code)
        try:
            data = json.loads(urlopen(url, timeout=8).read().decode("utf-8"))
        except HTTPError as exc:
            raise ApiError(401, str(exc))
        if "openid" not in data:
            raise ApiError(401, data.get("errmsg", "Wechat login failed"))
        return data["openid"]
    return "dev_" + hashlib.sha256(("dev:" + code).encode()).hexdigest()[:24]


def get_or_create_user(openid):
    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE openid = ?", (openid,)).fetchone()
        if not row:
            user_id = uuid.uuid4().hex
            conn.execute("INSERT INTO users (id, openid, nickname, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", (user_id, openid, "家庭成员", now_text(), now_text()))
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return user_payload(row)


def get_or_create_family(user):
    with connect() as conn:
        if user.get("currentFamilyId"):
            row = conn.execute("SELECT * FROM families WHERE id = ?", (user["currentFamilyId"],)).fetchone()
            if row and user["openid"] in json.loads(row["member_openids"]):
                return row["id"]
        row = conn.execute("SELECT * FROM families WHERE owner_openid = ?", (user["openid"],)).fetchone()
        if row:
            family_id = row["id"]
        else:
            family_id = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO families (id, name, owner_openid, member_openids, pending_members, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (family_id, "淘熙家的账本", user["openid"], json.dumps([user["openid"]]), "[]", now_text(), now_text()),
            )
        conn.execute("UPDATE users SET current_family_id = ?, updated_at = ? WHERE openid = ?", (family_id, now_text(), user["openid"]))
        return family_id


def list_bills(family_id, month):
    with connect() as conn:
        rows = conn.execute("SELECT * FROM bills WHERE family_id = ? AND month = ? ORDER BY bill_date DESC, created_at DESC LIMIT 100", (family_id, month)).fetchall()
    return [bill_payload(row) for row in rows]


def create_bill(body, openid):
    bill_id = uuid.uuid4().hex
    with connect() as conn:
        conn.execute(
            "INSERT INTO bills (id, family_id, type, category, amount, note, bill_date, month, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (bill_id, body["familyId"], body.get("type", "expense"), body.get("category", "其他")[:20], float(body["amount"]), body.get("note", "")[:100], body["date"], body["month"], openid, now_text(), now_text()),
        )
    return bill_id


def get_bill(bill_id, family_id):
    with connect() as conn:
        row = conn.execute("SELECT * FROM bills WHERE id = ? AND family_id = ?", (bill_id, family_id)).fetchone()
    if not row:
        raise ApiError(404, "Bill not found")
    return bill_payload(row)


def update_bill(bill_id, body):
    with connect() as conn:
        result = conn.execute(
            "UPDATE bills SET type = ?, category = ?, amount = ?, note = ?, bill_date = ?, month = ?, updated_at = ? WHERE id = ? AND family_id = ?",
            (body.get("type", "expense"), body.get("category", "其他")[:20], float(body["amount"]), body.get("note", "")[:100], body["date"], body["month"], now_text(), bill_id, body["familyId"]),
        )
    if result.rowcount == 0:
        raise ApiError(404, "Bill not found")


def delete_bill(bill_id, family_id):
    with connect() as conn:
        result = conn.execute("DELETE FROM bills WHERE id = ? AND family_id = ?", (bill_id, family_id))
    if result.rowcount == 0:
        raise ApiError(404, "Bill not found")


def stats(family_id, month):
    bills = list_bills(family_id, month)
    summary = summarize(bills)
    category_map = {}
    for bill in bills:
        if bill["type"] != "expense":
            continue
        item = category_map.setdefault(bill["category"] or "其他", {"category": bill["category"] or "其他", "amount": 0.0, "count": 0})
        item["amount"] += float(bill["amount"])
        item["count"] += 1
    categories = sorted(category_map.values(), key=lambda item: item["amount"], reverse=True)
    for item in categories:
        item["amount"] = format_money(item["amount"])
    with connect() as conn:
        budget = conn.execute("SELECT amount FROM budgets WHERE family_id = ? AND month = ?", (family_id, month)).fetchone()
    return {"summary": summary, "budget": build_budget(summary, float(budget["amount"]) if budget else 0), "categories": categories}


def set_budget(body):
    amount = float(body.get("amount", 0))
    if amount < 0:
        raise ApiError(400, "Invalid budget")
    with connect() as conn:
        current = conn.execute("SELECT id FROM budgets WHERE family_id = ? AND month = ?", (body["familyId"], body["month"])).fetchone()
        if current:
            conn.execute("UPDATE budgets SET amount = ?, updated_at = ? WHERE id = ?", (amount, now_text(), current["id"]))
        else:
            conn.execute("INSERT INTO budgets (id, family_id, month, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (uuid.uuid4().hex, body["familyId"], body["month"], amount, now_text(), now_text()))


def family_detail(family_id, openid):
    family = get_family(family_id)
    members = json.loads(family["member_openids"])
    if openid not in members and family["owner_openid"] != openid:
        raise ApiError(403, "No permission")
    pending = json.loads(family["pending_members"] or "[]") if family["owner_openid"] == openid else []
    return family_payload(family, openid, pending)


def request_join(family_id, openid):
    with connect() as conn:
        family = conn.execute("SELECT * FROM families WHERE id = ?", (family_id,)).fetchone()
        if not family:
            raise ApiError(404, "Family not found")
        members = json.loads(family["member_openids"])
        pending = json.loads(family["pending_members"] or "[]")
        if openid in members:
            return {"status": "already_member"}
        if not any(item["openid"] == openid for item in pending):
            pending.append({"openid": openid, "requestedAt": now_text()})
            conn.execute("UPDATE families SET pending_members = ?, updated_at = ? WHERE id = ?", (json.dumps(pending), now_text(), family_id))
    return {"status": "pending"}


def review_join(family_id, target_openid, owner_openid, approve):
    with connect() as conn:
        family = conn.execute("SELECT * FROM families WHERE id = ?", (family_id,)).fetchone()
        if not family:
            raise ApiError(404, "Family not found")
        if family["owner_openid"] != owner_openid:
            raise ApiError(403, "Only owner can review")
        pending = [item for item in json.loads(family["pending_members"] or "[]") if item["openid"] != target_openid]
        members = json.loads(family["member_openids"])
        if approve and target_openid not in members:
            members.append(target_openid)
            conn.execute("UPDATE users SET current_family_id = ?, updated_at = ? WHERE openid = ?", (family_id, now_text(), target_openid))
        conn.execute("UPDATE families SET member_openids = ?, pending_members = ?, updated_at = ? WHERE id = ?", (json.dumps(members), json.dumps(pending), now_text(), family_id))
    return {"status": "approved" if approve else "rejected"}


def assert_member(family_id, openid):
    family = get_family(family_id)
    if openid not in json.loads(family["member_openids"]):
        raise ApiError(403, "No permission")


def get_family(family_id):
    with connect() as conn:
        row = conn.execute("SELECT * FROM families WHERE id = ?", (family_id,)).fetchone()
    if not row:
        raise ApiError(404, "Family not found")
    return row


def sign_token(payload):
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(JWT_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return raw + "." + sig


def verify_token(token):
    try:
        raw, sig = token.split(".", 1)
        expected = hmac.new(JWT_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        payload = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8"))
    except Exception:
        raise ApiError(401, "Invalid token")
    if payload.get("exp", 0) < time.time():
        raise ApiError(401, "Token expired")
    return payload


def user_payload(row):
    return {"_id": row["id"], "openid": row["openid"], "nickName": row["nickname"], "currentFamilyId": row["current_family_id"]}


def family_payload(row, openid, pending):
    members = json.loads(row["member_openids"])
    return {"_id": row["id"], "name": row["name"], "ownerOpenid": row["owner_openid"], "memberOpenids": members, "memberCount": len(members), "pendingMembers": pending, "isOwner": row["owner_openid"] == openid}


def bill_payload(row):
    return {"_id": row["id"], "familyId": row["family_id"], "type": row["type"], "category": row["category"], "amount": float(row["amount"]), "note": row["note"], "date": row["bill_date"], "month": row["month"], "createdBy": row["created_by"]}


def summarize(bills):
    income = sum(float(item["amount"]) for item in bills if item["type"] == "income")
    expense = sum(float(item["amount"]) for item in bills if item["type"] == "expense")
    return {"income": format_money(income), "expense": format_money(expense), "balance": format_money(income - expense)}


def build_budget(summary, amount):
    expense = float(summary["expense"])
    percent = min(round(expense / amount * 100), 999) if amount > 0 else 0
    return {"amount": format_money(amount), "remaining": format_money(amount - expense), "percent": percent, "hasBudget": amount > 0, "isOver": amount > 0 and expense > amount}


def format_money(value):
    return "{:.2f}".format(value)


def now_text():
    return datetime.utcnow().isoformat(timespec="seconds")


if __name__ == "__main__":
    init_db()
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
