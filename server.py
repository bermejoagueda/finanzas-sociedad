import os, base64, json
import urllib.request, urllib.error
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder="static")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

MODELOS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash"]

PROMPT_SELAE_MULTI = """Eres un asistente contable experto en documentos de SELAE.

Se te envían uno o dos documentos PDF relacionados con la misma semana de liquidación SELAE:

DOCUMENTO DE LIQUIDACIÓN SEMANAL (el largo, con tabla de juegos y premios):
- Contiene: punto de venta, período/semana, total ventas, total comisiones, neto a cobrar/pagar

DOCUMENTO DE FACTURA DE COBRO (el corto, con tabla Comisión Bruta / IVA / TOTAL FACTURA):
- Contiene: comisión bruta, IVA 21%, total factura, fecha de expedición

Tu tarea es extraer y combinar todos los campos disponibles en un único JSON:

- fecha: fecha de expedición de la factura (formato YYYY-MM-DD). Si no hay factura, usa la fecha de la liquidación.
- concepto: "Comisiones SELAE - Semana X / YYYY" (usa semana y año del documento)
- importe: TOTAL FACTURA (comisión bruta + IVA). Este es el ingreso real de la sociedad. Solo número, sin símbolo ni puntos de miles, punto como decimal.
- referencia: "Semana X/YYYY"
- comision_bruta: importe comisión bruta sin IVA, solo número
- iva: importe del IVA, solo número
- punto_venta: número de punto de venta
- total_ventas: total ventas semana, solo número
- total_premios: total pago de premios semana, solo número
- total_comisiones_brutas: total comisiones brutas del periodo, solo número
- neto_liquidacion: neto a cobrar/pagar por SELAE (campo L de la liquidación), solo número

Si algún campo no está disponible en los documentos recibidos usa null.

IMPORTANTE: El campo "importe" SIEMPRE debe ser el TOTAL FACTURA (lo que cobra la sociedad). Si solo tienes la liquidación y no la factura, usa el total de comisiones como importe.

Responde SOLO con JSON válido, sin texto adicional, sin bloques de código markdown:
{"fecha":"...","concepto":"...","importe":0.00,"referencia":"...","comision_bruta":null,"iva":null,"punto_venta":null,"total_ventas":null,"total_premios":null,"total_comisiones_brutas":null,"neto_liquidacion":null}"""

PROMPT_FACTURA = """Eres un asistente contable experto. El usuario sube una factura o recibo en PDF.

Extrae con precisión:
- fecha: fecha de emisión en formato YYYY-MM-DD
- concepto: descripción principal del servicio o producto facturado
- importe: importe TOTAL a pagar incluyendo IVA. Solo número, sin símbolo ni puntos de miles, punto como decimal.
- referencia: número de factura o referencia del documento
- emisor: nombre de la empresa o autónomo que emite la factura
- base_imponible: importe sin IVA, solo número
- iva_pct: porcentaje de IVA aplicado (ej: 21)
- iva_importe: importe del IVA, solo número

Si algún campo no está disponible usa null.

Responde SOLO con JSON válido, sin texto adicional:
{"fecha":"...","concepto":"...","importe":0.00,"referencia":"...","emisor":"...","base_imponible":null,"iva_pct":null,"iva_importe":null}"""


def llamar_gemini(parts_content, system_prompt):
    ultimo_error = ""
    for modelo in MODELOS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"parts": parts_content}]
            }
            body = json.dumps(payload).encode("utf-8")
            req  = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                return result["candidates"][0]["content"]["parts"][0]["text"], None
        except urllib.error.HTTPError as e:
            ultimo_error = f"{modelo}: {e.code} {e.read().decode('utf-8')[:200]}"
        except Exception as e:
            ultimo_error = f"{modelo}: {str(e)}"
    return None, ultimo_error


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

    data     = request.get_json()
    tipo_doc = data.get("tipo_doc", "factura")
    # Soporte para uno o dos PDFs
    pdfs     = data.get("pdfs", [])          # lista de base64
    pdf_b64  = data.get("pdf_b64", "")       # compatibilidad hacia atrás

    if not pdfs and pdf_b64:
        pdfs = [pdf_b64]

    if not pdfs:
        return jsonify({"error": "No se recibió ningún PDF"}), 400

    # Construir partes con todos los PDFs recibidos
    parts = []
    for b64 in pdfs:
        parts.append({"inline_data": {"mime_type": "application/pdf", "data": b64}})

    if tipo_doc == "selae":
        parts.append({"text": "Analiza estos documentos SELAE y extrae todos los campos disponibles según las instrucciones."})
        system = PROMPT_SELAE_MULTI
    else:
        parts.append({"text": "Extrae los datos de esta factura según las instrucciones."})
        system = PROMPT_FACTURA

    texto, error = llamar_gemini(parts, system)
    if error:
        return jsonify({"error": error}), 500

    return jsonify({"resultado": texto})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port)
