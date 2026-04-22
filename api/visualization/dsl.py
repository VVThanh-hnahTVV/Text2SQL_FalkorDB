"""Data model for visualization instructions."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ChartType(str, Enum):
    """Supported chart types."""

    LINE = "line"
    BAR = "bar"
    PIE = "pie"
    SCATTER = "scatter"
    HISTOGRAM = "histogram"
    BOX = "box"
    TABLE = "table"


@dataclass
class VisualizationDSL:
    """Chart specification independent from UI implementation."""

    chart_type: ChartType
    data_columns: list[str] = field(default_factory=list)
    config: dict[str, Any] = field(default_factory=dict)
    layout: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a JSON-like dict."""
        return {
            "chart_type": self.chart_type.value,
            "data_columns": self.data_columns,
            "config": self.config,
            "layout": self.layout,
        }

