"""
Energy & Fuel Cost Margin Impact Simulator
--------------------------------------------
Flask server with lightweight session auth + SQLite-backed scenario
saving. The calculation engine itself still lives client-side in
static/js/simulator.js (real-time, no round trip) — this layer only
adds accounts and persistence, which is what turns the tool from a
one-off calculator into something sellable (freemium / white-label).

Run with:
    pip install -r requirements.txt
    python app.py
Then open http://127.0.0.1:5000 — you'll be redirected to /login.

SECURITY NOTE: set a real SECRET_KEY via environment variable before
deploying anywhere public. The fallback here is fine for local dev only.
"""

import os
from functools import wraps

from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

import db

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-change-me")

db.init_db()


# ------------------------------------------------------------------
# Auth helpers
# ------------------------------------------------------------------
def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


# ------------------------------------------------------------------
# Auth routes
# ------------------------------------------------------------------
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html", error=None)

    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")

    if not email or not password:
        return render_template("register.html", error="Email and password are both required.")
    if len(password) < 8:
        return render_template("register.html", error="Password must be at least 8 characters.")
    if db.get_user_by_email(email):
        return render_template("register.html", error="An account with that email already exists.")

    user_id = db.create_user(email, generate_password_hash(password))
    session["user_id"] = user_id
    session["email"] = email
    return redirect(url_for("index"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html", error=None)

    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")

    user = db.get_user_by_email(email)
    if not user or not check_password_hash(user["password_hash"], password):
        return render_template("login.html", error="Incorrect email or password.")

    session["user_id"] = user["id"]
    session["email"] = user["email"]
    next_url = request.args.get("next") or url_for("index")
    return redirect(next_url)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ------------------------------------------------------------------
# Dashboard
# ------------------------------------------------------------------
@app.route("/")
@login_required
def index():
    return render_template("index.html", email=session.get("email"))


# ------------------------------------------------------------------
# Scenario API — JSON, used by static/js/simulator.js
# ------------------------------------------------------------------
@app.route("/api/scenarios", methods=["GET"])
@login_required
def api_list_scenarios():
    return jsonify(db.list_scenarios(session["user_id"]))


@app.route("/api/scenarios", methods=["POST"])
@login_required
def api_save_scenario():
    data = request.get_json(silent=True) or {}
    required = ["name", "revenue", "electricity", "fuel", "logistics", "shock_pct"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing one or more required fields."}), 400

    try:
        scenario_id = db.save_scenario(
            user_id=session["user_id"],
            name=str(data["name"])[:80] or "Untitled scenario",
            revenue=float(data["revenue"]),
            electricity=float(data["electricity"]),
            fuel=float(data["fuel"]),
            logistics=float(data["logistics"]),
            shock_pct=float(data["shock_pct"]),
        )
    except (TypeError, ValueError):
        return jsonify({"error": "Numeric fields must be numbers."}), 400

    return jsonify({"id": scenario_id}), 201


@app.route("/api/scenarios/<int:scenario_id>", methods=["DELETE"])
@login_required
def api_delete_scenario(scenario_id):
    deleted = db.delete_scenario(session["user_id"], scenario_id)
    if not deleted:
        return jsonify({"error": "Scenario not found."}), 404
    return jsonify({"deleted": True})


if __name__ == "__main__":
    # debug=True is fine for local use; turn off in production
    app.run(debug=True, port=5000)