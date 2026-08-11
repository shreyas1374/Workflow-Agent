"""
conftest.py — pytest configuration for the backend test suite.
Sets up environment variables needed for isolated, reproducible testing
without hitting real external services.
"""
import os
import pytest

def pytest_configure(config):
    """
    Called before tests are collected and run.
    Set test-safe environment overrides here so all test modules inherit them.
    """
    # Use HTTP stub mode so httpbin.org (and any real URLs) are never called
    # during tests — mirrors the LLM_STUB_MODE pattern.
    os.environ.setdefault("HTTP_STUB_MODE", "true")
    # LLM stub mode is already defaulted to true in config.py, but be explicit.
    os.environ.setdefault("LLM_STUB_MODE", "true")
