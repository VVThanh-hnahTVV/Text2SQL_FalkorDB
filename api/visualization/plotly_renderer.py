"""Render visualization DSL to Plotly figure from CSV data."""

from io import StringIO
from typing import Any

import pandas as pd
import plotly.graph_objects as go


def create_empty_chart(message: str) -> go.Figure:
    """Create a placeholder chart for error or empty-data states."""
    figure = go.Figure()
    figure.add_annotation(
        text=message,
        x=0.5,
        y=0.5,
        xref="paper",
        yref="paper",
        showarrow=False,
    )
    figure.update_layout(title="Visualization unavailable")
    return figure


def create_line_chart(dataframe: pd.DataFrame, config: dict[str, Any], layout: dict[str, Any]) -> go.Figure:
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=dataframe[config["x"]], y=dataframe[config["y"]], mode="lines+markers"))
    figure.update_layout(**layout)
    return figure


def create_bar_chart(dataframe: pd.DataFrame, config: dict[str, Any], layout: dict[str, Any]) -> go.Figure:
    figure = go.Figure()
    figure.add_trace(go.Bar(x=dataframe[config["x"]], y=dataframe[config["y"]]))
    figure.update_layout(**layout)
    return figure


def create_pie_chart(dataframe: pd.DataFrame, config: dict[str, Any], layout: dict[str, Any]) -> go.Figure:
    figure = go.Figure()
    figure.add_trace(go.Pie(labels=dataframe[config["labels"]], values=dataframe[config["values"]]))
    figure.update_layout(**layout)
    return figure


def create_scatter_chart(dataframe: pd.DataFrame, config: dict[str, Any], layout: dict[str, Any]) -> go.Figure:
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=dataframe[config["x"]], y=dataframe[config["y"]], mode="markers"))
    figure.update_layout(**layout)
    return figure


def create_histogram_chart(dataframe: pd.DataFrame, config: dict[str, Any], layout: dict[str, Any]) -> go.Figure:
    figure = go.Figure()
    figure.add_trace(go.Histogram(x=dataframe[config["x"]]))
    figure.update_layout(**layout)
    return figure


def create_box_chart(dataframe: pd.DataFrame, config: dict[str, Any], layout: dict[str, Any]) -> go.Figure:
    figure = go.Figure()
    figure.add_trace(go.Box(y=dataframe[config["y"]]))
    figure.update_layout(**layout)
    return figure


def create_table_chart(dataframe: pd.DataFrame, _: dict[str, Any], layout: dict[str, Any]) -> go.Figure:
    figure = go.Figure(
        data=[
            go.Table(
                header={"values": list(dataframe.columns)},
                cells={"values": [dataframe[column].tolist() for column in dataframe.columns]},
            )
        ]
    )
    figure.update_layout(**layout)
    return figure


def create_plotly_chart(csv_data: str, visualization_dsl_dict: dict[str, Any]) -> go.Figure:
    """Build a Plotly figure from CSV and DSL configuration."""
    if not csv_data or not csv_data.strip():
        return create_empty_chart("CSV data is empty.")

    try:
        dataframe = pd.read_csv(StringIO(csv_data))
    except Exception as parse_error:  # pylint: disable=broad-exception-caught
        return create_empty_chart(f"Failed to parse CSV: {parse_error}")

    if dataframe.empty:
        return create_empty_chart("No rows found in query result.")

    chart_type = str(visualization_dsl_dict.get("chart_type", "table")).lower()
    config = visualization_dsl_dict.get("config", {})
    layout = visualization_dsl_dict.get("layout", {})

    chart_factory = {
        "line": create_line_chart,
        "bar": create_bar_chart,
        "pie": create_pie_chart,
        "scatter": create_scatter_chart,
        "histogram": create_histogram_chart,
        "box": create_box_chart,
        "table": create_table_chart,
    }
    builder = chart_factory.get(chart_type, create_table_chart)

    try:
        return builder(dataframe, config, layout)
    except Exception as chart_error:  # pylint: disable=broad-exception-caught
        return create_empty_chart(f"Chart rendering failed: {chart_error}")

