from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from .audit import AuditLog
from .models import AuditEvent


class ResearchHttpClient:
    def __init__(
        self,
        audit: AuditLog,
        user_agent: str,
        min_interval_seconds: float = 2.0,
        timeout_seconds: int = 60,
        retries: int = 3,
    ) -> None:
        self.audit = audit
        self.user_agent = user_agent
        self.min_interval_seconds = max(1.0, min_interval_seconds)
        self.timeout_seconds = timeout_seconds
        self.retries = max(1, retries)
        self._last_request = 0.0

    def post_form_json(
        self,
        url: str,
        form: dict[str, str],
        provider: str,
        operation: str,
        query_summary: str,
    ) -> dict[str, Any]:
        payload = urllib.parse.urlencode(form).encode("utf-8")
        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            elapsed = time.monotonic() - self._last_request
            if elapsed < self.min_interval_seconds:
                time.sleep(self.min_interval_seconds - elapsed)
            started = time.monotonic()
            try:
                request = urllib.request.Request(
                    url,
                    data=payload,
                    headers={"User-Agent": self.user_agent, "Accept": "application/json"},
                    method="POST",
                )
                self._last_request = time.monotonic()
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    body = json.loads(response.read().decode("utf-8"))
                result_count = len(body.get("elements", [])) if isinstance(body, dict) else 0
                self._audit(provider, operation, url, query_summary, "success", attempt, result_count, started)
                return body
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as error:
                last_error = error
                status = getattr(error, "code", "network_error")
                self._audit(provider, operation, url, query_summary, f"error:{status}", attempt, 0, started, str(error))
                if attempt < self.retries:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"{provider} request failed after {self.retries} attempts: {last_error}")

    def _audit(
        self,
        provider: str,
        operation: str,
        url: str,
        query_summary: str,
        status: str,
        attempt: int,
        result_count: int,
        started: float,
        error: str = "",
    ) -> None:
        self.audit.add(AuditEvent(
            timestamp_utc=datetime.now(timezone.utc).isoformat(),
            provider=provider,
            operation=operation,
            source_url=url,
            query_summary=query_summary,
            status=status,
            attempt=attempt,
            result_count=result_count,
            duration_ms=round((time.monotonic() - started) * 1000),
            error=error[:500],
        ))
