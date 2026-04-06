"""Analyze CSV string and infer chart-friendly schema metadata."""

import warnings
from io import StringIO
from typing import Any

import pandas as pd


def _safe_unique_counts(dataframe: pd.DataFrame, limit: int = 30) -> dict[str, int]:
    """Compute unique counts for low-cardinality columns only."""
    unique_counts: dict[str, int] = {}
    for column in dataframe.columns:
        count = int(dataframe[column].nunique(dropna=True))
        if count <= limit:
            unique_counts[str(column)] = count
    return unique_counts


def analyze_csv_schema(csv_data: str) -> dict[str, Any]:
    """Infer schema details used for chart selection and DSL generation."""
    if not csv_data or not csv_data.strip():
        return {
            "columns": [],
            "numeric_columns": [],
            "categorical_columns": [],
            "datetime_columns": [],
            "row_count": 0,
            "unique_counts": {},
            "error": "CSV data is empty.",
        }

    try:
        dataframe = pd.read_csv(StringIO(csv_data))
    except Exception as parse_error:  # pylint: disable=broad-exception-caught
        return {
            "columns": [],
            "numeric_columns": [],
            "categorical_columns": [],
            "datetime_columns": [],
            "row_count": 0,
            "unique_counts": {},
            "error": f"CSV parse error: {parse_error}",
        }

    numeric_columns = dataframe.select_dtypes(include=["number"]).columns.tolist()
    datetime_columns: list[str] = []
    categorical_columns: list[str] = []

    for column in dataframe.columns:
        if column in numeric_columns:
            continue

        sample = dataframe[column]
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="Could not infer format",
                category=UserWarning,
            )
            parsed = pd.to_datetime(sample, errors="coerce")
        parse_ratio = float(parsed.notna().mean()) if len(sample) else 0.0
        if parse_ratio >= 0.8:
            datetime_columns.append(str(column))
        else:
            categorical_columns.append(str(column))

    return {
        "columns": [str(column) for column in dataframe.columns],
        "numeric_columns": [str(column) for column in numeric_columns],
        "categorical_columns": categorical_columns,
        "datetime_columns": datetime_columns,
        "row_count": int(len(dataframe)),
        "unique_counts": _safe_unique_counts(dataframe),
    }

