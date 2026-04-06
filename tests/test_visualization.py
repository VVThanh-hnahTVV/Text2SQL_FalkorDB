"""Unit tests for visualization pipeline modules."""

from api.visualization import VisualizationService, analyze_csv_schema, create_plotly_chart
from api.visualization.dsl import ChartType, VisualizationDSL


def test_analyze_csv_schema_basic_types():
    csv_data = "month,revenue,segment\n2024-01-01,1200,SMB\n2024-02-01,1500,Enterprise\n"

    schema_info = analyze_csv_schema(csv_data)

    assert schema_info["columns"] == ["month", "revenue", "segment"]
    assert "revenue" in schema_info["numeric_columns"]
    assert "month" in schema_info["datetime_columns"]
    assert schema_info["row_count"] == 2


def test_generate_visualization_dsl_rule_based_bar():
    csv_data = "region,sales\nEast,100\nWest,130\n"
    service = VisualizationService()

    dsl = service.generate_visualization_dsl(csv_data, question="Compare sales by region")

    assert dsl.chart_type == ChartType.BAR
    assert dsl.config["x"] == "region"
    assert dsl.config["y"] == "sales"
    assert dsl.layout["yaxis_title"] == "sales"


def test_generate_visualization_dsl_axis_title_with_unit():
    csv_data = "month,revenue\n2024-01-01,1200\n2024-02-01,1500\n"
    service = VisualizationService()

    dsl = service.generate_visualization_dsl(csv_data, question="Revenue trend over time")

    assert dsl.layout["xaxis_title"] == "month"
    assert dsl.layout["yaxis_title"] == "revenue (USD)"


def test_generate_visualization_dsl_forced_chart_type():
    csv_data = "value\n1\n2\n3\n"
    service = VisualizationService()

    dsl = service.generate_visualization_dsl(csv_data, chart_type="histogram")

    assert dsl.chart_type == ChartType.HISTOGRAM


def test_visualization_dsl_to_dict():
    dsl = VisualizationDSL(
        chart_type=ChartType.TABLE,
        data_columns=["a", "b"],
        config={"columns": ["a", "b"]},
        layout={"title": "Test"},
    )

    result = dsl.to_dict()
    assert result["chart_type"] == "table"
    assert result["data_columns"] == ["a", "b"]


def test_create_plotly_chart_fallback_empty_csv():
    figure = create_plotly_chart("", {"chart_type": "bar", "config": {}, "layout": {}})
    assert figure.layout.title.text == "Visualization unavailable"

