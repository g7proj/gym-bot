# gym-bot

Personal automation for checking available gym courses via the `inforyou.teamsystem.com` API, written in Python.

## Features

- Authenticate with the gym portal using username and password
- Retrieve available lessons for the next 20 days
- Filter lessons based on day of the week and course keywords defined in `courses.yaml`
- Display lesson details including date, time, description, and available spots
- Support for environment variables and `.env` file for credentials
- Multi-user support with encrypted storage and web interface (React + FastAPI)

## Requirements

- Python 3.11+ installed and available in `PATH`
- Valid access to the gym portal (username and password)
- Internet connection

## Local Environment Setup (Windows / PowerShell)

All commands should be run from the project root, for example:

```powershell
cd C:\projects\gym-bot
```

### 1. Create and Activate Virtual Environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If script execution is blocked by execution policy, you can temporarily enable it with:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then retry activating the virtual environment.

### 2. Install Dependencies

With the virtual environment active:

```powershell
pip install -r requirements.txt
```

This will install:

- `requests` for HTTP calls to the API
- `python-dotenv` for loading variables from `.env`
- `PyYAML` (used for course configuration)

### 3. Configure Credentials and Token

The script reads credentials and tokens from environment variables:

- `GYM_USERNAME` – portal username
- `GYM_PASSWORD` – portal password
- `GYM_APP_TOKEN` – optional; if not set, a default value observed from the portal is used

To set them in the current PowerShell session:

```powershell
$env:GYM_USERNAME = "your_username"
$env:GYM_PASSWORD = "your_password"
```

`GYM_APP_TOKEN` has a **default value** integrated in the code (`DEFAULT_APP_TOKEN` in `gym_bot/config.py`).
If you want to override it (e.g., if the gym changes the token), you can set it like this:

```powershell
$env:GYM_APP_TOKEN = "APP_TOKEN_VALUE_FROM_PORTAL"
```

Alternatively, you can create a `.env` file in the project root with the following content (used only locally):

```env
GYM_USERNAME=your_username
GYM_PASSWORD=your_password
# GYM_APP_TOKEN=APP_TOKEN_VALUE_FROM_PORTAL  # optional
```

`python-dotenv` will be loaded automatically by `gym_bot.cli` (if installed).

## Running the CLI

With the virtual environment active and environment variables set:

```powershell
cd C:\projects\gym-bot\src
python -m gym_bot.cli
```

To automatically book the first available lesson on the 20th day that matches your preferences:

```powershell
cd C:\projects\gym-bot\src
python -m gym_bot.cli --book
```

The script performs the following steps:

1. Loads variables from `.env` if available
2. Reads `GYM_USERNAME` and `GYM_PASSWORD`
3. Calls the portal login endpoint and obtains the token
4. Calls the lessons endpoint (`/webbooking/listwithmine`) for the next 20 days (including today)
5. Applies filters defined in the `courses.yaml` file based on day of the week and course keywords
6. Prints to screen the lessons that match preferences, with date, time, description, and available spots
7. If `--book` is used, attempts to book the earliest available lesson on the 20th day

If something goes wrong (e.g., missing or incorrect credentials), the program terminates with an error message and a non-zero exit code.

## Course Configuration (`courses.yaml`)

To specify the courses you are interested in based on the day of the week, use the `courses.yaml` file in the project root.

Example:

```yaml
monday:
  - "yoga"
tuesday:
  - "weightlifting"
wednesday:
  - "weightlifting"
thursday:
  - "weightlifting"
friday:
  - "weightlifting"
saturday:
  - "yoga"
```

Notes:

- Day names must be in English, lowercase (`monday`, `tuesday`, …).
- Strings in the list are keywords compared case-insensitively with the `ServiceDescription` field of lessons.
- You can specify multiple courses for the same day (just add more entries in the list).

## GitHub Actions Automation

The project includes a GitHub Actions workflow (`.github/workflows/book.yml`) that runs daily at 7:05 AM UTC to automatically book gym lessons. It uses the `--book` flag to attempt booking the first available lesson on the 20th day matching your `courses.yaml` preferences.

### Setup

1. Ensure GitHub Secrets are configured in your repository:
   - `GYM_USERNAME`: Your gym portal username
   - `GYM_PASSWORD`: Your gym portal password
   - `GYM_APP_TOKEN`: Optional app token (uses default if not set)

2. The workflow will run automatically every day. You can also trigger it manually from the Actions tab.

### Testing

To test locally without booking:

```powershell
cd C:\projects\gym-bot\src
python -m gym_bot.cli
```

To test booking (use with caution):

```powershell
cd C:\projects\gym-bot\src
python -m gym_bot.cli --book
```

## Multi-User API (FastAPI Backend)

The system supports multiple users with a REST API for registration and preference management.

### Setup

1. Install additional dependencies:
   ```powershell
   pip install -r requirements.txt
   ```

2. Generate encryption key for passwords:
   ```python
   from cryptography.fernet import Fernet
   print(Fernet.generate_key().decode())
   ```
   Add the output as `ENCRYPTION_KEY` in GitHub Secrets.

3. Run the API server:
   ```powershell
   uvicorn api.main:app --reload
   ```

### API Endpoints

- `POST /login`: Verify credentials and create user account.
- `PUT /users/{user_id}/preferences`: Update course preferences.
- `GET /users/{user_id}`: Get user data.

### Local Testing

To test the multi-user API locally:

1. **Set Environment Variables**:
   ```powershell
   $env:ENCRYPTION_KEY = "your_generated_key_here"
   ```

2. **Start the Server**:
   ```powershell
   cd C:\projects\gym-bot
   $env:PYTHONPATH = "."
   uvicorn api.main:app --reload
   ```
   Visit `http://127.0.0.1:8000/docs` for interactive API docs.

3. **Test Login Endpoint** (using PowerShell Invoke-WebRequest):
   - Encrypt your password first:
     ```python
     from utils.crypto import CryptoUtils
     crypto = CryptoUtils()
     encrypted_pw = crypto.encrypt("your_password")
     print(encrypted_pw)
     ```
   - Then login:
     ```powershell
     Invoke-WebRequest -Uri "http://127.0.0.1:8000/login" `
                      -Method POST `
                      -Headers @{ "Content-Type" = "application/json" } `
                      -Body '{"username": "your_username", "password_encrypted": "encrypted_pw_here"}'
     ```
     Expected response: `{"message": "Login successful", "user_id": "uuid"}`

4. **Test Preferences Update**:
   ```powershell
   Invoke-WebRequest -Uri "http://127.0.0.1:8000/users/your_user_id/preferences" `
                    -Method PUT `
                    -Headers @{ "Content-Type" = "application/json" } `
                    -Body '{"monday": ["yoga"], "tuesday": ["weightlifting"]}'
   ```

5. **Test User Retrieval**:
   ```powershell
   Invoke-WebRequest -Uri "http://127.0.0.1:8000/users/your_user_id"
   ```

For frontend testing, use a tool like Postman or implement the React app in `web/`. The API supports CORS for local development.

### Frontend (React)

A React SPA is planned for user-friendly login and preference setting. Place React code in `web/` directory.

## Project Structure

The project logic is divided into:

- `gym_bot/client.py`: handles all HTTP calls (login, service list, lesson list, bookings).
- `gym_bot/config.py`: configuration values and reading credentials/tokens from environment variables.
- `gym_bot/schedule.py`: functions for working with dates/times and filtering lessons based on weekly preferences.
- `gym_bot/courses_config.py`: reading and normalizing the `courses.yaml` file.
- `gym_bot/cli.py`: terminal entrypoint that orchestrates calls to the previous modules and prints output.

## Security Notes

- **Never** commit real credentials to the repository.
- Always use environment variables or a non-tracked `.env` file (already excluded by `.gitignore`).
