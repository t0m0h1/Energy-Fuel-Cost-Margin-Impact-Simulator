"""
db.py — thin SQLite data-access layer for the margin simulator.

Deliberately not an ORM: this is two tables and five queries, so plain
sqlite3 keeps it dependency-free and easy to read. Swap in SQLAlchemy /
Postgres later if this grows past a single-server demo.
"""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "data.sqlite3"


def get_db():
    """Open a connection with row access by column name."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create tables on first run. Safe to call on every startup."""
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scenarios (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            revenue     REAL NOT NULL,
            electricity REAL NOT NULL,
            fuel        REAL NOT NULL,
            logistics   REAL NOT NULL,
            shock_pct   REAL NOT NULL,
            created_at  TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------
def create_user(email, password_hash):
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
            (email, password_hash, now_iso()),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def get_user_by_email(email):
    conn = get_db()
    try:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    finally:
        conn.close()


def get_user_by_id(user_id):
    conn = get_db()
    try:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        conn.close()


# ---------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------
def save_scenario(user_id, name, revenue, electricity, fuel, logistics, shock_pct):
    conn = get_db()
    try:
        cur = conn.execute(
            """INSERT INTO scenarios
               (user_id, name, revenue, electricity, fuel, logistics, shock_pct, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, name, revenue, electricity, fuel, logistics, shock_pct, now_iso()),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def list_scenarios(user_id):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM scenarios WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_scenario(user_id, scenario_id):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM scenarios WHERE id = ? AND user_id = ?",
            (scenario_id, user_id),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_scenario(user_id, scenario_id):
    conn = get_db()
    try:
        cur = conn.execute(
            "DELETE FROM scenarios WHERE id = ? AND user_id = ?",
            (scenario_id, user_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()