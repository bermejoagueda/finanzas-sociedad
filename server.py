import os, base64, json
import urllib.request, urllib.error
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder="static")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("static", path)

@app.route("/analizar-pdf", methods=["POST"])
def analizar_pdf():
    if not GEMINI_API_KEY:
        return jsonify({"error": "API key de Gemini no configurada"}), 500

    data    = request.get_json()
    system  = data.get("system", "")
    pdf_b64 = data.get("pdf_b64", "")

    if not pdf_b64:
        return jsonify({"error": "No se recibió el PDF"}), 400

    # Modelos confirmados disponibles, en orden de preferencia
    modelos = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash"]

    ultimo_error = ""
    for modelo in modelos:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"parts": [
                    {"inline_data": {"mime_type": "application/pdf", "data": pdf_b64}},
                    {"text": "Extrae los datos de este documento según las instrucciones del sistema."}
                ]}]
            }
            body = json.dumps(payload).encode("utf-8")
            req  = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                texto  = result["candidates"][0]["content"]["parts"][0]["text"]
                return jsonify({"resultado": texto})
        except urllib.error.HTTPError as e:
            ultimo_error = f"{modelo}: {e.code} {e.read().decode('utf-8')[:300]}"
            continue
        except Exception as e:
            ultimo_error = f"{modelo}: {str(e)}"
            continue

    return jsonify({"error": ultimo_error}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port)
