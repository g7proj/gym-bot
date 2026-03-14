from __future__ import annotations

from typing import Any, Dict, Tuple

import requests

from .config import BASE_URL, COMPANY_ID, Credentials, get_app_token


class GymClientError(Exception):
    """Generic error raised by GymClient operations."""


class GymClient:
    """
    Simple HTTP client for the gym booking portal.
    """

    def __init__(self) -> None:
        self.session = requests.Session()
        self._token: str | None = None

    @property
    def token(self) -> str | None:
        return self._token

    def login(self, credentials: Credentials) -> str:
        """
        Authenticate against the gym portal and store the auth token.
        """
        # Preconfigure headers and cookies that the backend expects, based on
        # the browser request you captured.
        app_token = get_app_token()
        if app_token:
            # Header name is case-sensitive on backend side: use AppToken.
            self.session.headers.setdefault("AppToken", app_token)
            self.session.cookies.set("app-token", app_token)

        # Backend also expects an IYESUrl header/cookie matching the cookie you saw.
        iyes_url = "http://95.130.140.135:65432"
        self.session.headers.setdefault("IYESUrl", iyes_url)
        self.session.cookies.set("iyesurl", iyes_url)

        # Some cosmetic cookies from the browser; likely not mandatory but cheap to add.
        self.session.cookies.set("lang", "en")
        self.session.cookies.set("cookie-acceptance", "accepted")

        login_url = f"{BASE_URL}/security/webauthenticate"
        # Use a plain URL for confirmlink; `requests` will URL-encode it once.
        params = {
            "login": credentials.username,
            "password": credentials.password,
            "companyid": COMPANY_ID,
            "confirmlink": "https://inforyou.teamsystem.com/dream/account-verification/",
        }

        try:
            response = self.session.get(login_url, params=params, timeout=10)
        except requests.RequestException as exc:
            raise GymClientError(f"Login request failed: {exc}") from exc

        if not response.ok:
            raise GymClientError(
                f"Login failed with HTTP {response.status_code}: {response.text}"
            )

        try:
            data: Dict[str, Any] = response.json()
        except ValueError as exc:
            raise GymClientError("Login response is not valid JSON") from exc

        print("JSON login:", data)
        if not data.get("Successful"):
            message = data.get("ErrorMessage") or data.get("Comment") or "Unknown error"
            raise GymClientError(f"Login not successful: {message}")

        item = data.get("Item")
        if not isinstance(item, str) or not item:
            raise GymClientError("Login response missing 'Item' token")

        self._token = item

        # Attach tokens as headers / cookies for subsequent requests.
        self.session.headers.update({"Authtoken": item})

        app_token = get_app_token()
        if app_token:
            self.session.headers.update({"Apptoken": app_token})
            # Also set cookie; some endpoints might read it from there.
            self.session.cookies.set("app-token", app_token)

        # Company cookie sometimes used by backend
        self.session.cookies.set("company", str(COMPANY_ID))

        return item

    def get_services(self) -> Dict[str, Any]:
        """
        Retrieve the list of bookable services/courses.
        """
        services_url = f"{BASE_URL}/webbooking/services"
        params = {"companyID": COMPANY_ID}

        try:
            response = self.session.get(services_url, params=params, timeout=10)
        except requests.RequestException as exc:
            raise GymClientError(f"Services request failed: {exc}") from exc

        if not response.ok:
            raise GymClientError(
                f"Services request failed with HTTP {response.status_code}: {response.text}"
            )

        try:
            data: Dict[str, Any] = response.json()
        except ValueError as exc:
            raise GymClientError("Services response is not valid JSON") from exc

        return data

