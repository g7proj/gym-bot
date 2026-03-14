from __future__ import annotations

import sys
from typing import Any, Dict, List

try:
    # Optional: makes local development easier if python-dotenv is installed.
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None  # type: ignore[assignment]

from .client import GymClient, GymClientError
from .config import Credentials, get_credentials


def _print_services_summary(data: Dict[str, Any]) -> None:
    items = data.get("Items")
    if not isinstance(items, list):
        print("No 'Items' list found in services response.")
        return

    print(f"Trovate {len(items)} categorie di servizi/corsi:")
    for category in items:
        description = category.get("Description", "<senza descrizione>")
        tipologies: List[Dict[str, Any]] = category.get("Tipologies") or []
        print(f"- {description} ({len(tipologies)} tipologie)")


def main() -> None:
    # Load .env if available (for local development convenience)
    if load_dotenv is not None:
        load_dotenv()

    try:
        credentials: Credentials = get_credentials()
    except RuntimeError as exc:
        print(f"Errore di configurazione: {exc}", file=sys.stderr)
        raise SystemExit(1)

    client = GymClient()

    try:
        client.login(credentials)
    except GymClientError as exc:
        print(f"Login fallito: {exc}", file=sys.stderr)
        raise SystemExit(1)

    print("Login eseguito con successo.")

    try:
        services = client.get_services()
    except GymClientError as exc:
        print(f"Errore nel recupero dei servizi: {exc}", file=sys.stderr)
        raise SystemExit(1)

    _print_services_summary(services)


if __name__ == "__main__":
    main()

