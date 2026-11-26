"""Diagnostic: compare gym portal login using the Python client vs. Deno-style URL encoding.

Run:  .venv\Scripts\python.exe scripts\check_gym_login.py
The password is read with getpass (not echoed, never stored or printed).
"""
import getpass
import sys
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from gym_bot.client import GymClient, GymClientError  # noqa: E402
from gym_bot.config import BASE_URL, COMPANY_ID, Credentials, get_app_token  # noqa: E402

IYES_URL = "http://95.130.140.135:65432"
CONFIRM = "https://inforyou.teamsystem.com/dream/account-verification/"


def whatwg_encode(value: str) -> str:
    """Mimic URLSearchParams: keep alnum and *-._ ; space -> '+'; encode the rest."""
    return quote(value, safe="*-._ ").replace(" ", "+")


def variant_python(username: str, password: str) -> str:
    try:
        GymClient().login(Credentials(username=username, password=password))
        return "OK"
    except GymClientError as exc:
        return f"FAIL: {exc}"


def variant_deno_style(username: str, password: str) -> str:
    app_token = get_app_token()
    url = (
        f"{BASE_URL}/security/webauthenticate"
        f"?login={whatwg_encode(username)}&password={whatwg_encode(password)}"
        f"&companyid={COMPANY_ID}&confirmlink={whatwg_encode(CONFIRM)}"
    )
    headers = {
        "AppToken": app_token,
        "IYESUrl": IYES_URL,
        "Cookie": f"app-token={app_token}; iyesurl={IYES_URL}; lang=en; cookie-acceptance=accepted",
    }
    resp = requests.get(url, headers=headers, timeout=15)
    try:
        data = resp.json()
    except ValueError:
        return f"FAIL: HTTP {resp.status_code}, non-JSON body"
    if data.get("Successful"):
        return "OK"
    return f"FAIL: {data.get('ErrorMessage') or data.get('Comment') or 'unknown'}"


def main() -> None:
    username = input("Gym username: ").strip()
    password = getpass.getpass("Gym password: ")
    special = sorted({c for c in password if not c.isalnum()})
    print(f"Password length: {len(password)}; special chars present: {special or 'none'}")
    print("A) Python client (requests params):", variant_python(username, password))
    print("B) Deno-style URL encoding        :", variant_deno_style(username, password))


if __name__ == "__main__":
    main()
