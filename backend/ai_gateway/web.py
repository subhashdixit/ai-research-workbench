"""Flask gateway with fixed source access, explicit consent and bounded requests."""

import hashlib
import os
from pathlib import Path
from threading import BoundedSemaphore, Lock
import time

from flask import Flask, jsonify, request, send_from_directory
import requests
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from ai_gateway.service import (
    FEEDS,
    PROMPTS,
    GeminiClient,
    ProviderUnavailable,
    RequestLimiter,
    parse_feed,
    validate_payload,
)


def create_app(config=None):
    """Create a small API process; do not persist prompts, images or model output."""
    site = Path(__file__).resolve().parents[2] / "site"
    app = Flask(__name__, static_folder=str(site), static_url_path="")
    app.config.update(
        MAX_CONTENT_LENGTH=4 * 1024 * 1024,
        GEMINI_API_KEY=os.environ.get("GEMINI_API_KEY", ""),
        GEMINI_MODEL=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        ALLOWED_ORIGINS=os.environ.get(
            "ALLOWED_ORIGINS", "https://subhashdixit.github.io"
        ).split(","),
    )
    app.config.update(config or {})
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    client = GeminiClient(
        app.config["GEMINI_API_KEY"],
        app.config["GEMINI_MODEL"],
        app.config.get("TRANSPORT"),
    )
    limiter = RequestLimiter()
    semaphore = BoundedSemaphore(2)
    news_cache = {}
    cache_lock = Lock()
    app.extensions["gemini_client"] = client
    app.extensions["request_limiter"] = limiter

    @app.before_request
    def origin_check():
        origin = request.headers.get("Origin")
        if (
            origin
            and origin not in app.config["ALLOWED_ORIGINS"]
            and origin != request.host_url.rstrip("/")
        ):
            return jsonify(error="This browser origin is not allowed."), 403
        return None

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        origin = request.headers.get("Origin")
        if origin in app.config["ALLOWED_ORIGINS"]:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Vary"] = "Origin"
        return response

    @app.get("/")
    def home():
        if (site / "index.html").exists():
            return send_from_directory(site, "index.html")
        return jsonify(
            service="Portfolio AI gateway",
            protocol_version=1,
            tools=list(PROMPTS),
            provider_configured=client.configured,
        )

    @app.get("/health/ready")
    def ready():
        return jsonify(
            status="ready",
            protocol_version=1,
            provider_configured=client.configured,
            model=client.model,
            revision=os.environ.get("RENDER_GIT_COMMIT", "local"),
            tools=list(PROMPTS),
            news_sources=list(FEEDS),
        )

    @app.route("/api/ai", methods=["POST", "OPTIONS"])
    def ai():
        if request.method == "OPTIONS":
            return "", 204
        tool, parts = validate_payload(request.get_json(silent=True))
        if not client.configured:
            raise ProviderUnavailable(
                "AI generation is not configured on this server. "
                "Local tools remain available."
            )
        address = hashlib.sha256(
            (request.remote_addr or "unknown").encode()
        ).hexdigest()
        if not limiter.permit(address):
            return (
                jsonify(
                    error="This public demo has reached its request limit. Try later."
                ),
                429,
            )
        if not semaphore.acquire(blocking=False):  # pylint: disable=consider-using-with
            # Nonblocking acquire is paired with release in finally below.
            return jsonify(error="Two requests are already running. Try shortly."), 429
        try:
            return jsonify(client.generate(tool, parts))
        finally:
            semaphore.release()

    @app.get("/api/news")
    def news():
        feed = request.args.get("feed", "arxiv-ai")
        if feed not in FEEDS:
            raise ValueError("Choose arxiv-ai, arxiv-ml or openai.")
        with cache_lock:
            cached = news_cache.get(feed)
            if cached and time.monotonic() - cached[0] < 600:
                return jsonify(items=cached[1], source=FEEDS[feed], cached=True)
        try:
            with requests.get(
                FEEDS[feed],
                timeout=(5, 15),
                stream=True,
                headers={"User-Agent": "PortfolioResearchReader/1.0"},
            ) as response:
                response.raise_for_status()
                content = response.raw.read(1024 * 1024 + 1)
            items = parse_feed(content, feed)
        except (requests.RequestException, ValueError) as exc:
            raise ProviderUnavailable(
                (
                    "The selected source is temporarily unavailable. Choose another "
                    "feed or use the labelled archived example."
                )
            ) from exc
        with cache_lock:
            news_cache[feed] = (time.monotonic(), items)
        return jsonify(items=items, source=FEEDS[feed], cached=False)

    @app.errorhandler(ValueError)
    def invalid(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(ProviderUnavailable)
    def unavailable(error):
        return jsonify(error=str(error)), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.errorhandler(Exception)
    def unexpected(_error):
        app.logger.error(
            "An internal gateway error occurred; request content is not logged."
        )
        return jsonify(error="An internal service error occurred."), 500

    return app
