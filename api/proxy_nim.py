import json, urllib.request, os

NIM_TARGET = "https://integrate.api.nvidia.com/v1/chat/completions"

def handler(request):
    if request.method == "OPTIONS":
        return {"statusCode": 204, "headers": cors_headers()}
    if request.method != "POST":
        return {"statusCode": 405, "body": "Method Not Allowed"}

    auth = request.headers.get("authorization", "")
    length = int(request.headers.get("content-length", 0))
    body = request.body.read() if length else b""

    req = urllib.request.Request(
        NIM_TARGET, data=body,
        headers={"Content-Type": "application/json", "Authorization": auth},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        return {"statusCode": 200, "headers": cors_headers({"Content-Type": "application/json"}), "body": data.decode()}
    except urllib.error.HTTPError as e:
        return {"statusCode": e.code, "headers": cors_headers(), "body": e.read().decode()}
    except Exception as e:
        return {"statusCode": 500, "headers": cors_headers(), "body": json.dumps({"error": str(e)})}

def cors_headers(extra=None):
    h = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization"}
    if extra: h.update(extra)
    return h
