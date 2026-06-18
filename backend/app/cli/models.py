from dataclasses import dataclass, field
from typing import Optional

from .errors import DreaminaErrorCategory


@dataclass
class DreaminaParsedOutput:
    submit_id: Optional[str] = None
    gen_status: Optional[str] = None
    result_url: Optional[str] = None
    local_paths: list[str] = field(default_factory=list)
    raw_output: str = ""
    error_message: Optional[str] = None
    error_category: Optional[DreaminaErrorCategory] = None

