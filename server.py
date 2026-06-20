import http.server
import urllib.request
import urllib.parse
import os, json, smtplib, logging, base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Try to load Google API client (optional — falls back gracefully)
try:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    from google.auth.transport.requests import Request
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False

# Try to load OAuth flow helper for setup endpoint
try:
    import google_auth_oauthlib.flow
    GOOGLE_AUTH_FLOW_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_FLOW_AVAILABLE = False

GMAIL_CALENDAR_SCOPES = [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/calendar",
]

# Build a Google Calendar API service using the same OAuth2 refresh token
def _calendar_service():
    cid = os.environ.get("GOOGLE_CLIENT_ID", "")
    cs = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    rt = os.environ.get("GOOGLE_REFRESH_TOKEN", "")
    if not GOOGLE_API_AVAILABLE or not cid or not cs or not rt:
        return None
    creds = Credentials(None, refresh_token=rt,
                        token_uri="https://oauth2.googleapis.com/token",
                        client_id=cid, client_secret=cs)
    creds.refresh(Request())
    return build("calendar", "v3", credentials=creds, cache_discovery=False)

NIM_TARGET = "https://integrate.api.nvidia.com/v1/chat/completions"
ML_TARGET = "http://localhost:5000/predict"
DDG_TARGET = "https://api.duckduckgo.com/"
GEMINI_BASE = "https://generativelanguage.googleapis.com"

# Read env vars from Render — ALL keys stay server-side, NEVER sent to browser.
# Claude/Gemini keys are injected server-side in proxy calls.
# Google Client ID is served via a dedicated endpoint (not in HTML source).
# Gmail API: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, FROM_EMAIL
server_claude_key = os.environ.get("CLAUDE_API_KEY", "")
server_gemini_key = os.environ.get("GEMINI_API_KEY", "")
google_client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
if server_claude_key:
    print("[SERVER] CLAUDE_API_KEY available server-side (not exposed to browser)", flush=True)
if server_gemini_key:
    print("[SERVER] GEMINI_API_KEY available server-side (not exposed to browser)", flush=True)
if os.environ.get("GOOGLE_REFRESH_TOKEN"):
    print("[SERVER] Gmail API ready (GOOGLE_REFRESH_TOKEN set)", flush=True)
elif os.environ.get("SMTP_HOST"):
    print("[SERVER] SMTP email configured", flush=True)
else:
    print("[SERVER] No email provider configured — emails will be simulated", flush=True)

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def _serve_google_setup_page(self):
        cid = os.environ.get("GOOGLE_CLIENT_ID", "")
        cs = os.environ.get("GOOGLE_CLIENT_SECRET", "")
        if not cid or not cs:
            html = """<html><body><h1>Google OAuth Setup</h1>
<p style="color:red">GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set on server.</p>
<p>Add them to your Render environment variables, then reload this page.</p></body></html>"""
        elif not GOOGLE_AUTH_FLOW_AVAILABLE:
            html = """<html><body><h1>Google OAuth Setup</h1>
<p style="color:red">google_auth_oauthlib not installed. Run: pip install google-auth-oauthlib</p></body></html>"""
        else:
            host = self.headers.get("Host", "localhost:8080")
            scheme = "https" if "onrender.com" in host else "http"
            redirect_uri = f"{scheme}://{host}/oauth2callback"
            flow = google_auth_oauthlib.flow.Flow.from_client_config(
                {"web": {"client_id": cid, "client_secret": cs,
                         "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                         "token_uri": "https://oauth2.googleapis.com/token",
                         "redirect_uris": [redirect_uri]}},
                scopes=GMAIL_CALENDAR_SCOPES)
            flow.redirect_uri = redirect_uri
            auth_url, _ = flow.authorization_url(
                access_type="offline", include_granted_scopes="true",
                prompt="consent")
            html = f"""<html><body><h1>Google OAuth Setup</h1>
<p>This will generate a <code>GOOGLE_REFRESH_TOKEN</code> with both scopes:</p>
<ul><li>gmail.send</li><li>calendar.events</li></ul>
<p>Step 1: Make sure this exact redirect URI is in your Google Cloud Console:</p>
<pre>{redirect_uri}</pre>
<p>Step 2: <a href="{auth_url}" style="font-size:1.2em;font-weight:bold">🔑 Click here to authorize with Google</a></p>
<p>Step 3: Copy the refresh token shown after authorization and paste it into your <b>Render</b> environment variables as <code>GOOGLE_REFRESH_TOKEN</code>.</p>
<p>Step 4: Restart your Render service.</p>
<hr><small>Redirect URI: {redirect_uri}</small></body></html>"""
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_oauth2_callback(self):
        cid = os.environ.get("GOOGLE_CLIENT_ID", "")
        cs = os.environ.get("GOOGLE_CLIENT_SECRET", "")
        if not cid or not cs or not GOOGLE_AUTH_FLOW_AVAILABLE:
            html = "<html><body><h1>Error</h1><p>Google credentials not configured.</p></body></html>"
        else:
            host = self.headers.get("Host", "localhost:8080")
            scheme = "https" if "onrender.com" in host else "http"
            redirect_uri = f"{scheme}://{host}/oauth2callback"
            try:
                parsed = urllib.parse.urlparse(self.path)
                params = urllib.parse.parse_qs(parsed.query)
                code = params.get("code", [None])[0]
                if not code:
                    html = "<html><body><h1>Error</h1><p>No authorization code received.</p></body></html>"
                else:
                    flow = google_auth_oauthlib.flow.Flow.from_client_config(
                        {"web": {"client_id": cid, "client_secret": cs,
                                 "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                                 "token_uri": "https://oauth2.googleapis.com/token",
                                 "redirect_uris": [redirect_uri]}},
                        scopes=GMAIL_CALENDAR_SCOPES)
                    flow.redirect_uri = redirect_uri
                    flow.fetch_token(code=code)
                    rt = flow.credentials.refresh_token
                    html = f"""<html><body><h1>✅ Success!</h1>
<p>Copy this refresh token and add it to your Render environment as <code>GOOGLE_REFRESH_TOKEN</code>:</p>
<textarea rows="3" cols="80" readonly style="font-size:1.1em;width:100%"
onclick="this.select()">{rt}</textarea>
<p style="color:green">Also set <code>FROM_EMAIL</code> to your sender address in Render env vars.</p>
<p>After adding both, restart your Render service. Gmail and Calendar will work immediately.</p>
<hr><small>Scopes: gmail.send, calendar.events</small></body></html>"""
            except Exception as e:
                html = f"<html><body><h1>Error</h1><p>{e}</p></body></html>"
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Serve Google Client ID via API (not in HTML source)
        if self.path == "/proxy/google-client-id":
            if google_client_id:
                body = json.dumps({"client_id": google_client_id}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                body = json.dumps({"client_id": ""}).encode()
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return

        if self.path.startswith("/proxy/ddg?"):
            query = self.path.split("?", 1)[1]
            url = DDG_TARGET + "?" + query
            try:
                with urllib.request.urlopen(url, timeout=15) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        if self.path == "/setup-google-auth":
            self._serve_google_setup_page()
            return

        if self.path.startswith("/oauth2callback"):
            self._handle_oauth2_callback()
            return

        super().do_GET()

    def do_POST(self):
        if self.path == "/proxy/nim":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            auth = self.headers.get("Authorization", "")
            print(f"[NIM_PROXY] Request: {length} bytes | Auth: {'present' if auth else 'MISSING!'}", flush=True)
            req = urllib.request.Request(
                NIM_TARGET,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": auth,
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    print(f"[NIM_PROXY] OK - {len(data)} bytes returned", flush=True)
            except urllib.error.HTTPError as e:
                raw = e.read().decode(errors='replace')[:500]
                print(f"[NIM_PROXY] HTTP ERROR {e.code}: {raw}", flush=True)
                err_body = json.dumps({"error": f"NVIDIA returned {e.code}", "detail": raw})
                try:
                    self.send_response(e.code)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(err_body)))
                    self.end_headers()
                    self.wfile.write(err_body.encode())
                except (ConnectionAbortedError, ConnectionResetError) as conn_err:
                    print(f"[NIM_PROXY] Connection closed while sending HTTPError: {conn_err}", flush=True)
            except (ConnectionAbortedError, ConnectionResetError) as e:
                print(f"[NIM_PROXY] Client aborted connection: {e}", flush=True)
            except Exception as e:
                err_msg = f"{type(e).__name__}: {e}"
                print(f"[NIM_PROXY] ERROR 500 - {err_msg}", flush=True)
                body_preview = body[:200].decode(errors='replace') if body else '(empty)'
                print(f"[NIM_PROXY] Request body preview: {body_preview}", flush=True)
                resp_body = json.dumps({"error": err_msg}).encode()
                try:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(resp_body)))
                    self.end_headers()
                    self.wfile.write(resp_body)
                except (ConnectionAbortedError, ConnectionResetError) as conn_err:
                    print(f"[NIM_PROXY] Connection closed while sending 500: {conn_err}", flush=True)
            return

        if self.path.startswith("/proxy/gemini"):
            # Strip /proxy/gemini prefix to get the Gemini-relative path
            gemini_path = self.path[len("/proxy/gemini"):]
            # If server has a Gemini key, use it and strip any key from the client URL
            if server_gemini_key:
                parsed = urllib.parse.urlparse(gemini_path)
                clean_path = parsed.path  # drop any ?key=... from client
                target_url = f"{GEMINI_BASE}{clean_path}?key={server_gemini_key}"
            else:
                target_url = GEMINI_BASE + gemini_path  # local dev: client sends key
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            print(f"[GEMINI_PROXY] -> {target_url[:80]}... ({length} bytes)", flush=True)
            req = urllib.request.Request(
                target_url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    print(f"[GEMINI_PROXY] OK - {len(data)} bytes", flush=True)
            except urllib.error.HTTPError as e:
                raw = e.read().decode(errors="replace")[:500]
                print(f"[GEMINI_PROXY] HTTP ERROR {e.code}: {raw}", flush=True)
                err_body = json.dumps({"error": {"code": e.code, "message": raw}}).encode()
                try:
                    self.send_response(e.code)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(err_body)))
                    self.end_headers()
                    self.wfile.write(err_body)
                except Exception: pass
            except Exception as e:
                err_body = json.dumps({"error": {"message": str(e)}}).encode()
                print(f"[GEMINI_PROXY] ERROR - {e}", flush=True)
                try:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(err_body)))
                    self.end_headers()
                    self.wfile.write(err_body)
                except Exception: pass
            return

        if self.path == "/proxy/claude":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            # Use server-side key first (from Render env var), fallback to client-provided key (local dev)
            claude_key = server_claude_key or self.headers.get("x-api-key", "")
            print(f"[CLAUDE_PROXY] Request: {length} bytes | Key: {'server' if server_claude_key else 'client' if claude_key else 'MISSING!'}", flush=True)
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": claude_key,
                    "anthropic-version": "2023-06-01"
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    print(f"[CLAUDE_PROXY] OK - {len(data)} bytes", flush=True)
            except urllib.error.HTTPError as e:
                raw = e.read().decode(errors='replace')[:500]
                print(f"[CLAUDE_PROXY] HTTP ERROR {e.code}: {raw}", flush=True)
                err_body = json.dumps({"error": {"message": f"Anthropic returned {e.code}: {raw}"}}).encode()
                try:
                    self.send_response(e.code)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(err_body)))
                    self.end_headers()
                    self.wfile.write(err_body)
                except Exception: pass
            except Exception as e:
                err_body = json.dumps({"error": {"message": str(e)}}).encode()
                print(f"[CLAUDE_PROXY] ERROR - {e}", flush=True)
                try:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(err_body)))
                    self.end_headers()
                    self.wfile.write(err_body)
                except Exception: pass
            return

        if self.path == "/proxy/send-email":
            length = int(self.headers.get("Content-Length", 0))
            req_data = json.loads(self.rfile.read(length))
            to_addr = req_data.get("to", "")
            subject = req_data.get("subject", "CanteenTycoon AI Dispatch")
            text = req_data.get("body", "")
            from_addr = req_data.get("from_email") or os.environ.get("FROM_EMAIL", "noreply@canteentycoon.com")
            client_token = req_data.get("access_token", "")
            server_rt = os.environ.get("GOOGLE_REFRESH_TOKEN", "")
            resp = {"sent": False, "to": to_addr}

            # Try Gmail API with available auth: server refresh token > client token > SMTP > simulate
            gmail_sent = False
            gmail_err = None

            # 1. Server-side refresh token (no client involvement)
            if GOOGLE_API_AVAILABLE and os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET") and server_rt:
                try:
                    creds = Credentials(None, refresh_token=server_rt,
                        token_uri="https://oauth2.googleapis.com/token",
                        client_id=os.environ["GOOGLE_CLIENT_ID"],
                        client_secret=os.environ["GOOGLE_CLIENT_SECRET"])
                    creds.refresh(Request())
                    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
                    mime = MIMEMultipart("alternative")
                    mime["Subject"] = subject; mime["From"] = from_addr; mime["To"] = to_addr
                    mime.attach(MIMEText(text, "plain", "utf-8"))
                    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
                    sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
                    resp = {"sent": True, "to": to_addr, "gmail_id": sent.get("id")}
                    print(f"[EMAIL] Sent via Gmail (server) to {to_addr}: {subject}", flush=True)
                    gmail_sent = True
                except Exception as e:
                    gmail_err = str(e)
                    print(f"[EMAIL] Gmail server-auth failed: {gmail_err}", flush=True)

            # 2. Client-provided access token (browser OAuth)
            if not gmail_sent and client_token and GOOGLE_API_AVAILABLE:
                try:
                    creds = Credentials(client_token)
                    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
                    mime = MIMEMultipart("alternative")
                    mime["Subject"] = subject; mime["From"] = from_addr; mime["To"] = to_addr
                    mime.attach(MIMEText(text, "plain", "utf-8"))
                    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
                    sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
                    resp = {"sent": True, "to": to_addr, "gmail_id": sent.get("id")}
                    print(f"[EMAIL] Sent via Gmail (client-token) to {to_addr}: {subject}", flush=True)
                    gmail_sent = True
                except Exception as e:
                    print(f"[EMAIL] Gmail client-token failed: {e}", flush=True)

            # 3. SMTP fallback
            if not gmail_sent:
                smtp_host = os.environ.get("SMTP_HOST", "")
                smtp_port = int(os.environ.get("SMTP_PORT", 587))
                smtp_user = os.environ.get("SMTP_USER", "")
                smtp_pass = os.environ.get("SMTP_PASS", "")
                if smtp_host and smtp_user:
                    try:
                        msg = MIMEText(text, "plain", "utf-8")
                        msg["Subject"] = subject; msg["From"] = from_addr; msg["To"] = to_addr
                        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
                            s.starttls(); s.login(smtp_user, smtp_pass); s.send_message(msg)
                        resp = {"sent": True, "to": to_addr}
                        print(f"[EMAIL] Sent via SMTP to {to_addr}: {subject}", flush=True)
                    except Exception as e:
                        resp = {"sent": False, "error": str(e)}
                        print(f"[EMAIL] SMTP failed: {e}", flush=True)
                else:
                    resp = {"sent": True, "simulated": True, "to": to_addr,
                            "note": "No email configured — simulated. Set GOOGLE_REFRESH_TOKEN on Render to send real emails."}
                    print(f"[EMAIL] Simulated to {to_addr}: {subject}", flush=True)

            body_resp = json.dumps(resp).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body_resp)))
            self.end_headers()
            self.wfile.write(body_resp)
            return

        if self.path.startswith("/proxy/calendar"):
            length = int(self.headers.get("Content-Length", 0))
            req_body = json.loads(self.rfile.read(length))
            action = req_body.get("action", "")
            client_token = req_body.get("access_token", "")
            resp = {"ok": False, "error": "No auth available"}

            # Try server-side refresh token first, then client token
            cal = _calendar_service()
            if not cal and client_token and GOOGLE_API_AVAILABLE:
                try:
                    cal = build("calendar", "v3",
                        credentials=Credentials(client_token), cache_discovery=False)
                except Exception as e:
                    print(f"[CALENDAR] Client-token build failed: {e}", flush=True)

            if cal:
                try:
                    if action == "create":
                        event = {
                            "summary": req_body.get("title", "CanteenTycoon Event"),
                            "start": {"date": req_body.get("date")},
                            "end": {"date": req_body.get("date")},
                        }
                        created = cal.events().insert(calendarId="primary", body=event).execute()
                        resp = {"ok": True, "id": created.get("id"), "htmlLink": created.get("htmlLink")}
                        print(f"[CALENDAR] Created: {req_body.get('title')} on {req_body.get('date')}", flush=True)

                    elif action == "list":
                        now = __import__("datetime").datetime.utcnow()
                        time_min = now.replace(day=1)
                        if time_min.month == 1:
                            time_min = time_min.replace(year=time_min.year - 1, month=12)
                        else:
                            time_min = time_min.replace(month=time_min.month - 1)
                        time_max = now.replace(day=1)
                        if time_max.month == 12:
                            time_max = time_max.replace(year=time_max.year + 1, month=1)
                        else:
                            time_max = time_max.replace(month=time_max.month + 3)
                        events = cal.events().list(
                            calendarId="primary", singleEvents=True,
                            orderBy="startTime",
                            timeMin=time_min.isoformat() + "Z",
                            timeMax=time_max.isoformat() + "Z",
                            maxResults=100
                        ).execute()
                        items = []
                        for e in events.get("items", []):
                            start = (e.get("start") or {}).get("date") or (e.get("start") or {}).get("dateTime", "")[:10]
                            if start and e.get("summary"):
                                items.append({"date": start, "title": e["summary"].strip(), "id": e.get("id")})
                        resp = {"ok": True, "items": items}
                        print(f"[CALENDAR] Listed {len(items)} events", flush=True)

                    elif action == "delete":
                        event_id = req_body.get("id", "")
                        if event_id:
                            cal.events().delete(calendarId="primary", eventId=event_id).execute()
                            resp = {"ok": True}
                            print(f"[CALENDAR] Deleted event {event_id}", flush=True)

                except Exception as e:
                    resp = {"ok": False, "error": str(e)}
                    print(f"[CALENDAR] Error: {e}", flush=True)

            body_resp = json.dumps(resp).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body_resp)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body_resp)
            return

        if self.path == "/proxy/ml/train":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            print(f"[ML_TRAIN] Request: {length} bytes", flush=True)
            req = urllib.request.Request("http://localhost:5000/train", data=body, headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    print(f"[ML_TRAIN] OK - {len(data)} bytes", flush=True)
            except Exception as e:
                err_msg = f"{type(e).__name__}: {e}"
                print(f"[ML_TRAIN] ERROR - {err_msg}", flush=True)
                resp_body = json.dumps({"error": err_msg}).encode()
                try:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(resp_body)))
                    self.end_headers()
                    self.wfile.write(resp_body)
                except Exception: pass
            return

        if self.path == "/proxy/ml":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            print(f"[ML_PROXY] Request: {length} bytes", flush=True)
            req = urllib.request.Request(ML_TARGET, data=body, headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    print(f"[ML_PROXY] OK - {len(data)} bytes", flush=True)
            except (ConnectionAbortedError, ConnectionResetError) as e:
                print(f"[ML_PROXY] Client aborted connection: {e}", flush=True)
            except Exception as e:
                err_msg = f"{type(e).__name__}: {e}"
                print(f"[ML_PROXY] ERROR - {err_msg}", flush=True)
                resp_body = json.dumps({"error": err_msg}).encode()
                try:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Content-Length", str(len(resp_body)))
                    self.end_headers()
                    self.wfile.write(resp_body)
                except (ConnectionAbortedError, ConnectionResetError) as conn_err:
                    print(f"[ML_PROXY] Connection closed while sending 500: {conn_err}", flush=True)
            return

        self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

from socketserver import ThreadingMixIn

class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

if __name__ == "__main__":
    import subprocess, sys
    # Start ML server (app.py) in a subprocess
    ml_proc = subprocess.Popen([sys.executable, "app.py"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"[SERVER] ML server started (PID {ml_proc.pid})", flush=True)

    port = int(os.environ.get("PORT", 8080))
    server = ThreadingHTTPServer(("0.0.0.0", port), ProxyHandler)
    print(f"Serving at http://localhost:{port} (multi-threaded)", flush=True)
    try:
        server.serve_forever()
    finally:
        ml_proc.terminate()
    server.serve_forever()
