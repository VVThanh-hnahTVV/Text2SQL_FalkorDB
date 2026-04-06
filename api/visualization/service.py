"""Service for selecting chart type and building visualization DSL."""

import json
from typing import Any, Callable

from api.agents.utils import run_completion
from api.visualization.dsl import ChartType, VisualizationDSL
from api.visualization.schema_analyzer import analyze_csv_schema

SUPPORTED_CHART_TYPES = {chart.value for chart in ChartType}


def _infer_unit(column_name: str) -> str:
    """Infer display unit from common column naming conventions."""
    lowered = column_name.lower()
    if any(token in lowered for token in ("price", "amount", "revenue", "cost", "salary")):
        return "USD"
    if any(token in lowered for token in ("percent", "pct", "ratio", "rate")):
        return "%"
    if any(token in lowered for token in ("count", "qty", "quantity", "total")):
        return "count"
    if any(token in lowered for token in ("duration", "latency", "time_ms")):
        return "ms"
    return ""


def _axis_title(column_name: str) -> str:
    """Build axis title with inferred unit when available."""
    unit = _infer_unit(column_name)
    return f"{column_name} ({unit})" if unit else column_name


class VisualizationService:
    """Generate chart configuration from CSV data and user question."""

    def __init__(self, llm: Callable[[str], str] | None = None):
        self.llm = llm

    def generate_visualization(
        self,
        csv_data: str,
        question: str = "",
        chart_type: str | None = None,
        schema_info: dict[str, Any] | None = None,
    ) -> VisualizationDSL:
        """Public API that returns a visualization DSL object."""
        return self.generate_visualization_dsl(csv_data, question, chart_type, schema_info)

    def generate_visualization_dsl(
        self,
        csv_data: str,
        question: str = "",
        chart_type: str | None = None,
        schema_info: dict[str, Any] | None = None,
    ) -> VisualizationDSL:
        """Build a UI-agnostic DSL with sensible fallbacks."""
        schema = schema_info or analyze_csv_schema(csv_data)
        if schema.get("error"):
            return VisualizationDSL(
                chart_type=ChartType.TABLE,
                data_columns=[],
                config={"message": schema["error"]},
                layout={"title": "Visualization unavailable"},
            )

        selected_chart = self._select_chart_type(question, schema, chart_type)
        return self._build_dsl_for_chart(selected_chart, schema, question)

    def _select_chart_type(
        self, question: str, schema_info: dict[str, Any], forced_chart_type: str | None
    ) -> ChartType:
        if forced_chart_type:
            return self._to_chart_type(forced_chart_type)

        if self.llm:
            llm_chart_type = self._get_chart_type_by_llm(question, schema_info)
            if llm_chart_type:
                return llm_chart_type

        return self._get_chart_type_by_rule(question, schema_info)

    def _get_chart_type_by_rule(self, question: str, schema_info: dict[str, Any]) -> ChartType:
        question_lower = question.lower()
        numeric_columns = schema_info.get("numeric_columns", [])
        categorical_columns = schema_info.get("categorical_columns", [])
        datetime_columns = schema_info.get("datetime_columns", [])

        if not schema_info.get("columns"):
            return ChartType.TABLE
        if "distribution" in question_lower or "histogram" in question_lower:
            return ChartType.HISTOGRAM if numeric_columns else ChartType.TABLE
        if "trend" in question_lower or "over time" in question_lower:
            if datetime_columns and numeric_columns:
                return ChartType.LINE
        if "share" in question_lower or "percentage" in question_lower:
            if categorical_columns and numeric_columns:
                return ChartType.PIE
        if "relation" in question_lower or "correlation" in question_lower:
            if len(numeric_columns) >= 2:
                return ChartType.SCATTER

        if datetime_columns and numeric_columns:
            return ChartType.LINE
        if categorical_columns and numeric_columns:
            return ChartType.BAR
        if numeric_columns:
            return ChartType.HISTOGRAM
        return ChartType.TABLE

    def _get_chart_type_by_llm(self, question: str, schema_info: dict[str, Any]) -> ChartType | None:
        prompt = (
            "You are a chart-type recommendation assistant.\n"
            "Return ONLY valid JSON: {\"chart_type\": \"line|bar|pie|scatter|histogram|box|table\"}.\n"
            f"Question: {question}\n"
            f"Schema: {json.dumps(schema_info, ensure_ascii=True)}"
        )
        try:
            response = self.llm(prompt) if callable(self.llm) else run_completion(
                [{"role": "user", "content": prompt}]
            )
            parsed = json.loads(response.strip())
            chart_type = str(parsed.get("chart_type", "")).strip().lower()
            return self._to_chart_type(chart_type)
        except Exception:  # pylint: disable=broad-exception-caught
            return None

    def _build_dsl_for_chart(
        self, chart_type: ChartType, schema_info: dict[str, Any], question: str
    ) -> VisualizationDSL:
        columns = schema_info.get("columns", [])
        numeric_columns = schema_info.get("numeric_columns", [])
        categorical_columns = schema_info.get("categorical_columns", [])
        datetime_columns = schema_info.get("datetime_columns", [])

        if not columns:
            return VisualizationDSL(
                chart_type=ChartType.TABLE,
                config={"message": "No columns available for visualization."},
                layout={"title": "No data"},
            )

        title = question if question else "Query result visualization"
        if chart_type == ChartType.LINE and datetime_columns and numeric_columns:
            x_col = datetime_columns[0]
            y_col = numeric_columns[0]
            return VisualizationDSL(
                chart_type=chart_type,
                data_columns=[x_col, y_col],
                config={"x": x_col, "y": y_col},
                layout={"title": title, "xaxis_title": _axis_title(x_col), "yaxis_title": _axis_title(y_col)},
            )
        if chart_type == ChartType.BAR and categorical_columns and numeric_columns:
            x_col = categorical_columns[0]
            y_col = numeric_columns[0]
            return VisualizationDSL(
                chart_type=chart_type,
                data_columns=[x_col, y_col],
                config={"x": x_col, "y": y_col},
                layout={"title": title, "xaxis_title": _axis_title(x_col), "yaxis_title": _axis_title(y_col)},
            )
        if chart_type == ChartType.PIE and categorical_columns and numeric_columns:
            label_col = categorical_columns[0]
            value_col = numeric_columns[0]
            return VisualizationDSL(
                chart_type=chart_type,
                data_columns=[label_col, value_col],
                config={"labels": label_col, "values": value_col},
                layout={"title": title, "legend_title": _axis_title(label_col)},
            )
        if chart_type == ChartType.SCATTER and len(numeric_columns) >= 2:
            x_col = numeric_columns[0]
            y_col = numeric_columns[1]
            return VisualizationDSL(
                chart_type=chart_type,
                data_columns=[x_col, y_col],
                config={"x": x_col, "y": y_col},
                layout={"title": title, "xaxis_title": _axis_title(x_col), "yaxis_title": _axis_title(y_col)},
            )
        if chart_type == ChartType.HISTOGRAM and numeric_columns:
            x_col = numeric_columns[0]
            return VisualizationDSL(
                chart_type=chart_type,
                data_columns=[x_col],
                config={"x": x_col},
                layout={"title": title, "xaxis_title": _axis_title(x_col), "yaxis_title": "Count"},
            )
        if chart_type == ChartType.BOX and numeric_columns:
            y_col = numeric_columns[0]
            return VisualizationDSL(
                chart_type=chart_type,
                data_columns=[y_col],
                config={"y": y_col},
                layout={"title": title, "yaxis_title": _axis_title(y_col)},
            )

        return VisualizationDSL(
            chart_type=ChartType.TABLE,
            data_columns=columns,
            config={"columns": columns, "message": "Falling back to table chart."},
            layout={"title": title},
        )

    @staticmethod
    def _to_chart_type(value: str) -> ChartType:
        normalized = value.strip().lower()
        if normalized in SUPPORTED_CHART_TYPES:
            return ChartType(normalized)
        return ChartType.TABLE

