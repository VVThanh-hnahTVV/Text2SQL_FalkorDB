"""Playwright configuration for E2E tests."""

import os
import subprocess
import time

import pytest  # pylint: disable=wrong-import-position
import requests  # pylint: disable=wrong-import-position


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "e2e: mark test as end-to-end test"
    )


@pytest.fixture(scope="session")
def fastapi_app():
    """Start the FastAPI application for testing."""
    env_defaults = {
        'FALKORDB_HOST': 'localhost',
        'FALKORDB_PORT': '6379',
    }
    for var, default in env_defaults.items():
        if not os.getenv(var):
            os.environ[var] = default

    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_dir)

    test_port = 5001

    process = subprocess.Popen([  # pylint: disable=consider-using-with
        "uv", "run", "uvicorn", "api.index:app",
        "--host", "localhost", "--port", str(test_port)
    ], cwd=project_root)

    max_retries = 30
    app_started = False
    base_url = f"http://localhost:{test_port}"

    for i in range(max_retries):
        try:
            response = requests.get(base_url, timeout=2)
            if response.status_code == 200:
                app_started = True
                break
        except requests.exceptions.RequestException:
            if process.poll() is not None:
                print(f"FastAPI process died early with return code: {process.returncode}")
                break
            if i % 10 == 0:
                print(f"Waiting for app to start... attempt {i+1}/{max_retries}")
            time.sleep(1)

    if not app_started:
        process.terminate()
        process.wait()
        print(f"FastAPI app failed to start after {max_retries} retries")
        raise RuntimeError("FastAPI app failed to start")

    yield base_url

    process.terminate()
    process.wait()


@pytest.fixture
def app_url(fastapi_app):  # pylint: disable=redefined-outer-name
    """Provide the base URL for the application."""
    return fastapi_app


@pytest.fixture
def page_with_base_url(page, app_url):  # pylint: disable=redefined-outer-name
    """Provide a page with app_url attribute set."""
    page.app_url = app_url
    page.goto(app_url, wait_until="domcontentloaded", timeout=60000)
    yield page
