import os
from dataclasses import dataclass


BASE_URL = "https://inforyou.teamsystem.com/dream/api/v1"
COMPANY_ID = 2


GYM_USERNAME_ENV = "GYM_USERNAME"
GYM_PASSWORD_ENV = "GYM_PASSWORD"
GYM_APP_TOKEN_ENV = "GYM_APP_TOKEN"

# Default AppToken observed from the web portal.
# Can be overridden by setting the GYM_APP_TOKEN environment variable.
DEFAULT_APP_TOKEN = (
    "BEF7B53DFC2052488E6ECE5A5F2AA0CBC2C27110B9E292EDBE10A138EBF9C25A"
    "249FE8E018656CF3596032CB821C179FA266FC29895E3371642920A4F97DBE2B"
    "66C414906712FD5DF79423A9106E1B60FC5EB2B6577EA7C7756AB5A38BB5CCD3"
    "AA991350BE141D11477EB4808D9F14EFA901ED108578094A290044DAD3B8D04E"
    "3BC3562938747973A156F24F2D4B9EA201FE499C3BC2BF714251A9CE099BD052"
)


@dataclass
class Credentials:
    username: str
    password: str


def get_credentials() -> Credentials:
    """
    Read gym portal credentials from environment variables.
    """
    username = os.getenv(GYM_USERNAME_ENV)
    password = os.getenv(GYM_PASSWORD_ENV)

    if not username or not password:
        missing = []
        if not username:
            missing.append(GYM_USERNAME_ENV)
        if not password:
            missing.append(GYM_PASSWORD_ENV)
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )

    return Credentials(username=username, password=password)


def get_app_token() -> str | None:
    """
    Optional application token used by the gym portal.

    If present, it will be attached as header and cookie; otherwise the
    default token observed from the browser will be used.
    """
    return os.getenv(GYM_APP_TOKEN_ENV) or DEFAULT_APP_TOKEN

