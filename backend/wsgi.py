"""WSGI entry point for the small portfolio API process."""

from ai_gateway.web import create_app

app = create_app()
