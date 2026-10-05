"""
RoseAI - Ollama Local Backend Server
=====================================
Runs a local Flask API that proxies requests to Ollama (llama3.2).
The RoseAI web app connects to this at http://localhost:11500/chat

Requirements:
  pip install flask flask-cors ollama

Usage:
  python ollama_server.py
"""

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import ollama
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Allow the browser (any origin) to call this server

DEFAULT_MODEL = "llama3.2"
DEFAULT_SYSTEM = (
    "You are RoseAI, an ultra-intelligent, friendly, and helpful AI assistant. "
    "You provide clear, well-structured, accurate, and insightful responses with "
    "markdown formatting. You excel in English, Tamil, coding, science, creative "
    "writing, and any domain. Always format code blocks cleanly with appropriate "
    "language tags."
)


@app.route("/", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "service": "RoseAI Ollama Backend",
        "model": DEFAULT_MODEL,
        "time": datetime.now().strftime("%I:%M %p")
    })


@app.route("/chat", methods=["POST"])
def chat():
    """
    Non-streaming chat endpoint.
    Body JSON: { "messages": [...], "system": "...", "model": "llama3.2" }
    Returns: { "reply": "..." }
    """
    data = request.get_json(force=True, silent=True) or {}
    user_messages = data.get("messages", [])
    system_prompt = data.get("system", DEFAULT_SYSTEM)
    model = data.get("model", DEFAULT_MODEL)

    # Build the messages list for Ollama
    ollama_messages = [{"role": "system", "content": system_prompt}]
    for msg in user_messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            ollama_messages.append({"role": role, "content": content})

    try:
        response = ollama.chat(model=model, messages=ollama_messages)
        reply = response["message"]["content"]
        return jsonify({"reply": reply, "model": model})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/chat/stream", methods=["POST"])
def chat_stream():
    """
    Streaming chat endpoint using Server-Sent Events (SSE).
    Body JSON: { "messages": [...], "system": "...", "model": "llama3.2" }
    Streams: text/event-stream with data: {"chunk": "..."} lines
    """
    data = request.get_json(force=True, silent=True) or {}
    user_messages = data.get("messages", [])
    system_prompt = data.get("system", DEFAULT_SYSTEM)
    model = data.get("model", DEFAULT_MODEL)

    ollama_messages = [{"role": "system", "content": system_prompt}]
    for msg in user_messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            ollama_messages.append({"role": role, "content": content})

    def generate():
        try:
            stream = ollama.chat(model=model, messages=ollama_messages, stream=True)
            for chunk in stream:
                token = chunk.get("message", {}).get("content", "")
                if token:
                    payload = json.dumps({"chunk": token})
                    yield f"data: {payload}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            err_payload = json.dumps({"error": str(e)})
            yield f"data: {err_payload}\n\n"

    return Response(
        stream_with_context(generate()),
        content_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )


@app.route("/models", methods=["GET"])
def list_models():
    """Return locally available Ollama models."""
    try:
        result = ollama.list()
        models = [m["name"] for m in result.get("models", [])]
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("=" * 55)
    print("  🌸  RoseAI Ollama Backend Server")
    print("=" * 55)
    print(f"  Model  : {DEFAULT_MODEL}")
    print(f"  URL    : http://localhost:11500")
    print(f"  Chat   : POST http://localhost:11500/chat")
    print(f"  Stream : POST http://localhost:11500/chat/stream")
    print("=" * 55)
    app.run(host="0.0.0.0", port=11500, debug=False)
