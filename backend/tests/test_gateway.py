"""Behavior tests use synthetic evidence and a fake provider, never a real key."""

import base64
import io
from unittest.mock import Mock

from PIL import Image
import pytest

from ai_gateway.service import (
    GeminiClient,
    ProviderUnavailable,
    RequestLimiter,
    parse_feed,
    validate_payload,
)
from ai_gateway.web import create_app


@pytest.fixture
def transport():
    response = Mock(status_code=200)
    response.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "private reasoning", "thought": True},
                        {"text": "Synthetic answer [S1]."},
                    ]
                },
                "finishReason": "STOP",
            }
        ]
    }
    return Mock(return_value=response)


@pytest.fixture
def client(transport):
    return create_app(
        {
            "TESTING": True,
            "GEMINI_API_KEY": "unit-test-placeholder",
            "TRANSPORT": transport,
        }
    ).test_client()


def payload(**updates):
    return {
        "tool": "summary",
        "question": "Summarize.",
        "context": "Synthetic source: revenue is 100 example units.",
        "consent": True,
        **updates,
    }


def test_explicit_consent_and_context_limits(client, transport):
    for values in [
        {"consent": False},
        {"consent": "true"},
        {"context": "x" * 40001},
        {"question": "x" * 4001},
        {"tool": "shell"},
        {"question": True},
    ]:
        assert client.post("/api/ai", json=payload(**values)).status_code == 400
    transport.assert_not_called()


def test_secret_stays_out_of_browser_response_and_model_context(client, transport):
    result = client.post("/api/ai", json=payload())
    assert result.status_code == 200
    assert result.json["answer"] == "Synthetic answer [S1]."
    assert (
        b"unit-test-placeholder" not in result.data
        and b"private reasoning" not in result.data
    )
    args, kwargs = transport.call_args
    assert args[0].startswith(
        "https://generativelanguage.googleapis.com/v1beta/models/"
    )
    assert "unit-test-placeholder" not in args[0]
    assert kwargs["headers"]["x-goog-api-key"] == "unit-test-placeholder"
    assert "unit-test-placeholder" not in str(kwargs["json"])
    assert kwargs["json"]["generationConfig"]["maxOutputTokens"] == 1024
    assert "tools" not in kwargs["json"]


@pytest.mark.parametrize(
    "tool",
    ["research", "summary", "invoice", "multimodal", "equity", "faq", "cover-letter"],
)
def test_all_documented_tools_use_the_validated_provider_contract(client, tool):
    result = client.post("/api/ai", json=payload(tool=tool))
    assert result.status_code == 200 and result.json["protocol_version"] == 1


def test_provider_not_configured_is_honest_and_never_calls_network():
    transport = Mock()
    client = create_app(
        {"TESTING": True, "GEMINI_API_KEY": "", "TRANSPORT": transport}
    ).test_client()
    assert client.get("/health/ready").json["provider_configured"] is False
    response = client.post("/api/ai", json=payload())
    assert response.status_code == 503 and "not configured" in response.json["error"]
    transport.assert_not_called()


def test_per_client_request_limit(client, transport):
    for _ in range(4):
        assert client.post("/api/ai", json=payload()).status_code == 200
    assert client.post("/api/ai", json=payload()).status_code == 429
    assert transport.call_count == 4


def test_global_quota_does_not_accumulate_spoofed_client_state():
    now = [0.0]
    limiter = RequestLimiter(per_minute=2, per_hour=2, clock=lambda: now[0])
    assert limiter.permit("a") and limiter.permit("b")
    for index in range(2000):
        assert not limiter.permit(str(index))
    assert len(limiter.clients) == 2
    now[0] = 3601.0
    assert limiter.permit("a")


def test_cors_is_limited_to_the_configured_frontend(client):
    origin = "https://subhashdixit.github.io"
    allowed = client.options("/api/ai", headers={"Origin": origin})
    assert allowed.status_code == 204
    assert allowed.headers["Access-Control-Allow-Origin"] == origin
    denied = client.get(
        "/health/ready", headers={"Origin": "https://unrelated.example"}
    )
    assert denied.status_code == 403
    assert "Access-Control-Allow-Origin" not in denied.headers
    assert "Access-Control-Allow-Credentials" not in allowed.headers


@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_upstream_errors_are_redacted(client, transport, status):
    transport.return_value.status_code = status
    transport.return_value.json.return_value = {"error": "DO_NOT_ECHO_PROVIDER_DETAILS"}
    result = client.post("/api/ai", json=payload())
    assert result.status_code == 503
    assert b"DO_NOT_ECHO" not in result.data
    assert b"unit-test-placeholder" not in result.data
    assert transport.call_count == 1


def test_empty_or_oversized_provider_answers_fail(client, transport):
    for parts in [[], [{"text": "x" * 25001}]]:
        transport.return_value.json.return_value = {
            "candidates": [{"content": {"parts": parts}}]
        }
        assert client.post("/api/ai", json=payload()).status_code == 503


def test_server_verifies_image_type_and_limits():
    buffer = io.BytesIO()
    Image.new("RGB", (2, 2), "white").save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    tool, parts = validate_payload(
        payload(tool="invoice", image={"mimeType": "image/png", "data": encoded})
    )
    assert tool == "invoice" and parts[1]["inlineData"]["mimeType"] == "image/png"
    for image in [
        {"mimeType": "image/jpeg", "data": encoded},
        {"mimeType": "image/svg+xml", "data": encoded},
        {"mimeType": "image/png", "data": "not base64!"},
    ]:
        with pytest.raises(ValueError):
            validate_payload(payload(tool="invoice", image=image))
    with pytest.raises(ValueError):
        validate_payload(
            payload(tool="summary", image={"mimeType": "image/png", "data": encoded})
        )


def test_feed_parser_preserves_safe_source_links_and_strips_markup():
    rss = b"""<rss><channel><item><title>Example &lt;b&gt;paper&lt;/b&gt;</title>
    <link>https://arxiv.org/abs/example</link><description>Short &lt;i&gt;excerpt&lt;/i&gt;.</description>
    <pubDate>Example date</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>"""
    items = parse_feed(rss, "arxiv-ai")
    assert len(items) == 1 and items[0]["title"] == "Example paper"
    assert items[0]["source"] == "arxiv-ai" and "<i>" not in items[0]["excerpt"]


def test_feed_parser_rejects_entities_malformed_xml_and_excessive_bytes():
    for content in [
        b"<rss>",
        b'<!DOCTYPE r [<!ENTITY x "bad">]><r>&x;</r>',
        b"x" * (1024 * 1024 + 1),
    ]:
        with pytest.raises(ValueError):
            parse_feed(content, "arxiv-ai")


def test_feed_allowlist_blocks_arbitrary_server_fetches(client):
    assert client.get("/api/news?feed=http://127.0.0.1").status_code == 400


def test_readiness_and_request_size_do_not_expose_secrets(client):
    ready = client.get("/health/ready")
    assert ready.status_code == 200 and ready.json["protocol_version"] == 1
    assert b"unit-test-placeholder" not in ready.data
    assert ready.headers["Cache-Control"] == "no-store"
    assert ready.headers["X-Content-Type-Options"] == "nosniff"
    assert (
        client.post(
            "/api/ai",
            data=b"x" * (4 * 1024 * 1024 + 1),
            content_type="application/json",
        ).status_code
        == 413
    )


def test_configured_model_identifier_cannot_change_the_provider_url():
    with pytest.raises(ValueError):
        GeminiClient("unit-test-placeholder", model="../../other-provider")
    client = GeminiClient("")
    with pytest.raises(ProviderUnavailable):
        client.generate("summary", [{"text": "Synthetic"}])
