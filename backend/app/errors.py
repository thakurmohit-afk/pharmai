"""Application-level typed service errors."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ServiceError(Exception):
    """Typed error object used by services/routes for stable API failures."""

    status_code: int
    code: str
    message: str
    extra: dict[str, Any] = field(default_factory=dict)

    def to_detail(self) -> dict[str, Any]:
        detail = {"code": self.code, "message": self.message}
        if self.extra:
            detail.update(self.extra)
        return detail

