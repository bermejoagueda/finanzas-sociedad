import os, json, base64, urllib.request, urllib.error
from datetime import datetime
from functools import wraps

import psycopg2
import psycopg2.extras
from flask import (Flask, request, jsonify, send_from_directory,
                   session, redirect, url_for)
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY", "cambia-esta-clave-en-produccion-123")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODELOS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash"]

# ── Prompts ────────────────────────────────────────────────────
PROMPT_SELAE = """Eres un asistente contable experto en documentos de SELAE.

Se te envían uno o dos documentos PDF de la misma semana:

FACTURA DE COBRO (corta, tabla Comisión Bruta / IVA / TOTAL FACTURA):
- importe = TOTAL FACTURA (lo que cobra la sociedad)
- comision_bruta, iva

LIQUIDACIÓN SEMANAL (larga, tabla de juegos y premios):
- neto_liquidacion = campo L (neto a cobrar/pagar por SELAE)
- punto_venta, total_ventas, total_comisiones_brutas

Combina ambos documentos y devuelve:
- fecha: fecha expedición factura en YYYY-MM-DD
- concepto: "Comisiones SELAE - Semana X / YYYY"
- importe: TOTAL FACTURA (número, sin símbolo, punto decimal)
- referencia: "Semana X/YYYY"
- comision_bruta: número o null
- iva: número o null
- punto_venta: número o null
- total_ventas: número o null
- total_comisiones_brutas: número o null
- neto_liquidacion: número o null

Responde SOLO con JSON válido sin texto adicional:
{"fecha":"...","concepto":"...","importe":0.00,"referencia":"...","comision_bruta":null,"iva":null,"punto_venta":null,"total_ventas":null,"total_comisiones_brutas":null,"neto_liquidacion":null}"""

PROMPT_FACTURA = """Eres un asistente contable experto. Extrae de esta factura PDF:
- fecha: YYYY-MM-DD
- concepto: descripción del servicio/producto
- importe: total con IVA, solo número, punto decimal
- referencia: número de factura
- emisor: nombre del emisor
- base_imponible: base sin IVA o null
- iva_pct: porcentaje IVA o null
- iva_importe: importe IVA o null

Responde SOLO con JSON válido:
{"fecha":"...","concepto":"...","importe":0.00,"referencia":"...","emisor":"...","base_imponible":null,"iva_pct":null,"iva_importe":null}"""

# ── Base de datos ──────────────────────────────────────────────
def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            username VARCHAR(80) UNIQUE NOT NULL,
            password_hash VARCHAR(256) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS movimientos (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
            tipo VARCHAR(10) NOT NULL,
            desc TEXT NOT NULL,
            monto NUMERIC(12,2) NOT NULL,
            fecha DATE NOT NULL,
            cat VARCHAR(100),
            ref VARCHAR(200),
            nota TEXT,
            origen VARCHAR(20) DEFAULT 'manual',
            extra JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mov_usuario ON movimientos(usuario_id);
        CREATE INDEX IF NOT EXISTS idx_mov_fecha ON movimientos(fecha);
    """)
    conn.commit()
    cur.close()
    conn.close()

# ── Auth helpers ───────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "No autenticado"}), 401
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated

def current_user_id():
    return session.get("user_id")

# ── Páginas ────────────────────────────────────────────────────
@app.route("/login")
def login_page():
    if "user_id" in session:
        return redirect("/")
    return send_from_directory("static", "login.html")

@app.route("/")
@login_required
def index():
    return send_from_directory("static", "index.html")

@app.route("/<path:path>")
def static_files(path):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory("static", path)

# ── Auth API ───────────────────────────────────────────────────
@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json()
    username = data.get("username", "").strip().lower()
    password = data.get("password", "")
    if not username or not password:
        return jsonify({"error": "Usuario y contraseña requeridos"}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, password_hash FROM usuarios WHERE username = %s", (username,))
    user = cur.fetchone()
    cur.close(); conn.close()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Usuario o contraseña incorrectos"}), 401
    session.permanent = True
    session["user_id"] = user["id"]
    session["username"] = username
    return jsonify({"ok": True, "username": username})

@app.route("/api/auth/register", methods=["POST"])
def api_register():
    # Solo se puede registrar si no hay usuarios (primer uso)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as n FROM usuarios")
    count = cur.fetchone()["n"]
    if count > 0:
        # Ya existen usuarios — solo admin puede crear más (simplificado)
        if "user_id" not in session:
            cur.close(); conn.close()
            return jsonify({"error": "Registro no permitido"}), 403
    data = request.get_json()
    username = data.get("username", "").strip().lower()
    password = data.get("password", "")
    if not username or not password or len(password) < 6:
        cur.close(); conn.close()
        return jsonify({"error": "Usuario inválido o contraseña muy corta (mín. 6 caracteres)"}), 400
    try:
        cur.execute(
            "INSERT INTO usuarios (username, password_hash) VALUES (%s, %s)",
            (username, generate_password_hash(password))
        )
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        cur.close(); conn.close()
        return jsonify({"error": "Ese nombre de usuario ya existe"}), 409
    cur.close(); conn.close()
    return jsonify({"ok": True})

@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/auth/me")
def api_me():
    if "user_id" not in session:
        return jsonify({"autenticado": False}), 401
    return jsonify({"autenticado": True, "username": session.get("username")})

# ── Movimientos API ────────────────────────────────────────────
@app.route("/api/movimientos", methods=["GET"])
@login_required
def get_movimientos():
    uid  = current_user_id()
    year = request.args.get("year")
    conn = get_db()
    cur  = conn.cursor()
    if year:
        cur.execute(
            "SELECT * FROM movimientos WHERE usuario_id=%s AND EXTRACT(YEAR FROM fecha)=%s ORDER BY fecha DESC",
            (uid, year)
        )
    else:
        cur.execute("SELECT * FROM movimientos WHERE usuario_id=%s ORDER BY fecha DESC", (uid,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    result = []
    for r in rows:
        m = dict(r)
        m["fecha"] = str(m["fecha"])
        m["monto"] = float(m["monto"])
        if m.get("extra"):
            m["extra"] = dict(m["extra"])
        result.append(m)
    return jsonify(result)

@app.route("/api/movimientos", methods=["POST"])
@login_required
def create_movimiento():
    uid  = current_user_id()
    data = request.get_json()
    required = ["tipo", "desc", "monto", "fecha"]
    for f in required:
        if not data.get(f):
            return jsonify({"error": f"Campo requerido: {f}"}), 400
    extra = {k: data[k] for k in ["comision_bruta","iva","punto_venta","total_ventas",
                                   "total_comisiones_brutas","neto_liquidacion",
                                   "base_imponible","iva_pct","iva_importe","emisor"]
             if k in data and data[k] is not None}
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO movimientos (usuario_id, tipo, desc, monto, fecha, cat, ref, nota, origen, extra)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (uid, data["tipo"], data["desc"], data["monto"], data["fecha"],
          data.get("cat"), data.get("ref"), data.get("nota"),
          data.get("origen","manual"), json.dumps(extra) if extra else None))
    new_id = cur.fetchone()["id"]
    conn.commit()
    cur.close(); conn.close()
    return jsonify({"ok": True, "id": new_id}), 201

@app.route("/api/movimientos/<int:mov_id>", methods=["DELETE"])
@login_required
def delete_movimiento(mov_id):
    uid = current_user_id()
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("DELETE FROM movimientos WHERE id=%s AND usuario_id=%s RETURNING id", (mov_id, uid))
    deleted = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()
    if not deleted:
        return jsonify({"error": "No encontrado"}), 404
    return jsonify({"ok": True})

@app.route("/api/movimientos/export")
@login_required
def export_csv():
    from flask import Response
    uid  = current_user_id()
    year = request.args.get("year")
    conn = get_db()
    cur  = conn.cursor()
    if year:
        cur.execute(
            "SELECT fecha,tipo,cat,desc,monto,ref,nota,origen FROM movimientos WHERE usuario_id=%s AND EXTRACT(YEAR FROM fecha)=%s ORDER BY fecha DESC",
            (uid, year)
        )
    else:
        cur.execute(
            "SELECT fecha,tipo,cat,desc,monto,ref,nota,origen FROM movimientos WHERE usuario_id=%s ORDER BY fecha DESC",
            (uid,)
        )
    rows = cur.fetchall()
    cur.close(); conn.close()
    headers = ["Fecha","Tipo","Categoría","Descripción","Importe","Referencia","Nota","Origen"]
    lines = [",".join(f'"{h}"' for h in headers)]
    for r in rows:
        lines.append(",".join(f'"{str(v) if v is not None else ""}"' for v in r.values()))
    csv = "\n".join(lines)
    return Response("\uFEFF" + csv, mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment;filename=finanzas_{year or 'todo'}.csv"})

# ── Gemini PDF ─────────────────────────────────────────────────
def llamar_gemini(parts, system):
    ultimo = ""
    for modelo in MODELOS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "system_instruction": {"parts": [{"text": system}]},
                "contents": [{"parts": parts}]
            }
            body = json.dumps(payload).encode()
            req  = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read())
                return data["candidates"][0]["content"]["parts"][0]["text"], None
        except urllib.error.HTTPError as e:
            ultimo = f"{modelo}: {e.code} {e.read().decode()[:200]}"
        except Exception as e:
            ultimo = f"{modelo}: {e}"
    return None, ultimo

@app.route("/analizar-pdf", methods=["POST"])
@login_required
def analizar_pdf():
    if not GEMINI_API_KEY:
        return jsonify({"error": "API key de Gemini no configurada"}), 500
    data     = request.get_json()
    tipo_doc = data.get("tipo_doc", "factura")
    pdfs     = data.get("pdfs", []) or ([data["pdf_b64"]] if data.get("pdf_b64") else [])
    if not pdfs:
        return jsonify({"error": "No se recibió ningún PDF"}), 400
    parts = [{"inline_data":{"mime_type":"application/pdf","data":b}} for b in pdfs]
    parts.append({"text": "Extrae los datos según las instrucciones."})
    system = PROMPT_SELAE if tipo_doc == "selae" else PROMPT_FACTURA
    texto, error = llamar_gemini(parts, system)
    if error:
        return jsonify({"error": error}), 500
    return jsonify({"resultado": texto})

# ── Inicialización ─────────────────────────────────────────────
if __name__ == "__main__":
    if DATABASE_URL:
        init_db()
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port)

# Para gunicorn
with app.app_context():
    if DATABASE_URL:
        try:
            init_db()
        except Exception as e:
            print(f"DB init warning: {e}")
