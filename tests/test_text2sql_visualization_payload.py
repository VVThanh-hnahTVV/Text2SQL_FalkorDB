"""Contract tests for visualization payload produced by text2sql helpers."""

from api.core.text2sql import _build_visualization_payload, _query_results_to_csv


def test_query_results_to_csv_output():
    query_results = [{"country": "VN", "count": 10}, {"country": "US", "count": 15}]

    csv_data = _query_results_to_csv(query_results)

    assert "country,count" in csv_data
    assert "VN,10" in csv_data
    assert "US,15" in csv_data


def test_visualization_payload_has_required_fields():
    query_results = [{"month": "2024-01-01", "revenue": 12.5}]

    payload = _build_visualization_payload(query_results, question="Show trend")

    assert "csv_data" in payload
    assert "schema_info" in payload
    assert "visualization_dsl" in payload
    assert payload["visualization_dsl"]["chart_type"] in {
        "line",
        "bar",
        "pie",
        "scatter",
        "histogram",
        "box",
        "table",
    }

