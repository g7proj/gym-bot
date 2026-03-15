from __future__ import annotations

from typing import Any, Dict, List

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
        if not data.get("Successful"):
            message = data.get("ErrorMessage") or data.get("Comment") or "Unknown error"
            raise GymClientError(f"Login not successful: {message}")

        item = data.get("Item")
        if not isinstance(item, str) or not item:
            raise GymClientError("Login response missing 'Item' token")

        self._token = item

        # Attach tokens as headers / cookies for subsequent requests.
        # Use the same header name seen in browser traffic.
        self.session.headers.update({"AuthToken": item})

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

    def list_with_mine(
        self,
        start_date: str,
        end_date: str,
        time_start: str,
        time_end: str,
        types: List[int] | None = None,
    ) -> Dict[str, Any]:
        """
        Retrieve lessons (classes) between two dates and times.

        All parameters are string timestamps in the same format used by the API,
        e.g. "2026-03-14T00:00:00".
        """
        url = f"{BASE_URL}/webbooking/listwithmine"
        payload: Dict[str, Any] = {
            "CompanyID": COMPANY_ID,
            "Types": types or [],
            "StartDate": start_date,
            "EndDate": end_date,
            "TimeStart": time_start,
            "TimeEnd": time_end,
        }

        try:
            response = self.session.post(url, json=payload, timeout=10)
        except requests.RequestException as exc:
            raise GymClientError(f"listwithmine request failed: {exc}") from exc

        if not response.ok:
            raise GymClientError(
                f"listwithmine failed with HTTP {response.status_code}: {response.text}"
            )

        try:
            data: Dict[str, Any] = response.json()
        except ValueError as exc:
            raise GymClientError("listwithmine response is not valid JSON") from exc

        return data

    def my_books(self, type_: str | None = "") -> Dict[str, Any]:
        """
        Retrieve current bookings for the authenticated user.

        The type_ parameter maps to the 'Type' query parameter. By default,
        an empty string is sent, matching the browser behaviour (all types).
        """
        url = f"{BASE_URL}/webbooking/mybooks"
        params = {
            "companyID": COMPANY_ID,
            "Type": type_ or "",
        }

        try:
            response = self.session.get(url, params=params, timeout=10)
        except requests.RequestException as exc:
            raise GymClientError(f"mybooks request failed: {exc}") from exc

        if not response.ok:
            raise GymClientError(
                f"mybooks failed with HTTP {response.status_code}: {response.text}"
            )

        try:
            data: Dict[str, Any] = response.json()
        except ValueError as exc:
            raise GymClientError("mybooks response is not valid JSON") from exc

        return data

    def book(
        self,
        booking_id: int,
        start_time: str,
        end_time: str,
        lesson_id: int,
        type_: int = 0,
        note: str = "",
        book_nr: int = 0,
        id_durata: int = 0,
    ) -> Dict[str, Any]:
        """
        Book a specific lesson.

        All timestamps are strings in the format used by the API,
        e.g. "2026-03-23T20:00:00".
        """
        url = f"{BASE_URL}/webbooking/book"
        payload = {
            "Note": note,
            "BookNr": book_nr,
            "BookingID": booking_id,
            "StartTime": start_time,
            "EndTime": end_time,
            "IDLesson": lesson_id,
            "Type": type_,
            "IDDurata": id_durata,
        }

        try:
            response = self.session.post(url, json=payload, timeout=10)
        except requests.RequestException as exc:
            raise GymClientError(f"book request failed: {exc}") from exc

        if not response.ok:
            raise GymClientError(
                f"book failed with HTTP {response.status_code}: {response.text}"
            )

        try:
            data: Dict[str, Any] = response.json()
        except ValueError as exc:
            raise GymClientError("book response is not valid JSON") from exc

        return data
