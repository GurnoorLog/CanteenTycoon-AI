import http.server
import urllib.request
import os, json

NIM_TARGET = "https://integrate.api.nvidia.com/v1/chat/completions"
ML_TARGET = "http://localhost:5000/predict"
DDG_TARGET = "https://api.duckduckgo.com/"
GEMINI_BASE = "https://generativelanguage.googleapis.com"

# Read env vars from Render and inject into client-side JS
ENV_SCRIPT = ""
keys = {
    "CLAUDE_API_KEY": os.environ.get("CLAUDE_API_KEY", ""),
    "GEMINI_API_KEY": os.environ.get("GEMINI_API_KEY", ""),
    "GOOGLE_CLIENT_ID": os.environ.get("GOOGLE_CLIENT_ID", ""),
}
if any(keys.values()):
    ENV_SCRIPT = f'<script>window.__ENV = {json.dumps(keys)}</script>'
    print(f"[SERVER] Injected env vars: {[k for k,v in keys.items() if v]}", flush=True)

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent browser caching of JS/HTML so updates are always picked up
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        # Inject env vars into index.html so client-side JS picks up Render API keys
        if self.path in ("/", "/index.html") and ENV_SCRIPT:
            try:
                with open("index.html", "rb") as f:
                    content = f.read().decode("utf-8")
                content = content.replace("</head>", ENV_SCRIPT + "</head>")
                body = content.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            except Exception as e:
                print(f"[SERVER] Inject error: {e}", flush=True)

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
            # Forward to Gemini API - strip /proxy/gemini prefix, keep ?key=... query
            gemini_path = self.path[len("/proxy/gemini"):]  # e.g. /v1beta/models/...:generateContent?key=...
            target_url = GEMINI_BASE + gemini_path
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
            api_key = self.headers.get("x-api-key", "")
            print(f"[CLAUDE_PROXY] Request: {length} bytes | Key: {'present' if api_key else 'MISSING!'}", flush=True)
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
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
