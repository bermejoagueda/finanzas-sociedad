import os, json, base64
from flask import Flask, request, jsonify, send_from_directory
import google.generativeai as genai

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

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=system
        )

        pdf_bytes = base64.b64decode(pdf_b64)
        part = {"mime_type": "application/pdf", "data": pdf_bytes}

        response = model.generate_content([
            part,
            "Extrae los datos de este documento según las instrucciones."
        ])

        return jsonify({"resultado": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port)
