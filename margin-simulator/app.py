"""
Energy & Fuel Cost Margin Impact Simulator
--------------------------------------------
Minimal Flask server. All calculation logic lives client-side in
static/js/simulator.js so the dashboard updates in real time as the
user drags sliders / toggles shock scenarios, with zero round-trips
to the server. Flask's only job here is to serve the page and assets.

Run with:
    pip install flask
    python app.py
Then open http://127.0.0.1:5000
"""

from flask import Flask, render_template

app = Flask(__name__)


@app.route("/")
def index():
    """Serve the simulator dashboard."""
    return render_template("index.html")


if __name__ == "__main__":
    # debug=True is fine for local use; turn off in production
    app.run(debug=True, port=5000)
