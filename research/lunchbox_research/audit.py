from __future__ import annotations

import csv
from dataclasses import asdict
from pathlib import Path

from .models import AuditEvent


class AuditLog:
    def __init__(self) -> None:
        self.events: list[AuditEvent] = []

    def add(self, event: AuditEvent) -> None:
        self.events.append(event)

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fieldnames = list(AuditEvent.__dataclass_fields__)
        with path.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for event in self.events:
                writer.writerow(asdict(event))
