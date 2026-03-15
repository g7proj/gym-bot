from __future__ import annotations

from pathlib import Path
from typing import Dict, List

import yaml


DEFAULT_CONFIG_NAME = "courses.yaml"


def load_course_preferences(path: Path | None = None) -> Dict[str, List[str]]:
    """
    Load weekly course preferences from a YAML file.

    Expected YAML format (lowercase weekday keys, arbitrary course keywords):

        monday:
          - "yoga"
        tuesday:
          - "weightlifting"
        thursday:
          - "weightlifting"
        saturday:
          - "yoga"
    """
    if path is None:
        root = Path(__file__).resolve().parents[2]
        path = root / DEFAULT_CONFIG_NAME

    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}

    preferences: Dict[str, List[str]] = {}
    for day, values in raw.items():
        if not isinstance(day, str):
            continue
        key = day.strip().lower()
        if not isinstance(values, list):
            continue
        prefs = [str(v).strip().lower() for v in values if v]
        if prefs:
            preferences[key] = prefs

    return preferences

