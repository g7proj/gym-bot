# gym-bot

Personal automation for checking available gym courses via the `inforyou.teamsystem.com` API, written in Python.

## Features

- Authenticate with the gym portal using username and password
- Retrieve available lessons for the next 20 days
- Filter lessons based on day of the week and course keywords defined in preferences
- Display lesson details including date, time, description, and available spots
- Support for environment variables and `.env` file for credentials
- Multi-user support with encrypted storage and web interface (React + FastAPI)
- Per-day course preferences (multiple courses per weekday)

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

### 3. Setup Frontend (React)

Navigate to the web directory and install Node.js dependencies:

```powershell
cd web
npm install
```

Create a `.env` file in the `web` directory with your API URL (do not put encryption keys in the frontend):

```
REACT_APP_API_URL=http://localhost:8000
```

## Usage

### Backend API

Start the FastAPI server:

```powershell
python -m api.main
```

The API will be available at `http://localhost:8000`.

### Frontend Web App

In a separate terminal, start the React development server:

```powershell
cd web
npm start
```

The web app will be available at `http://localhost:3000`.

### CLI Tool

For single-user CLI usage:

```powershell
python -m gym_bot.cli
```

### GitHub Actions

The project includes a GitHub Actions workflow for automated daily booking. The workflow runs daily at 6:05 AM UTC and books courses based on user preferences stored in `data/users.json`.

To set up automated booking:

1. Ensure `data/users.json` contains user data with preferences
2. Push the workflow file `.github/workflows/book.yml` to your repository
3. The workflow will run automatically on schedule

## API Endpoints

- `POST /login`: Authenticate user and return user ID (reuses existing account by username and updates password)
- `GET /users/{user_id}`: Get user data
- `PUT /users/{user_id}/preferences`: Update user preferences (overwrites previous preferences)
- `GET /users`: List all users (for admin purposes)

## Security

- Passwords are encrypted using Fernet symmetric encryption
- User data is stored in JSON format
- API uses CORS for cross-origin requests from the React frontend

## Testing

### API Testing with PowerShell

Test login endpoint:

```powershell
Invoke-WebRequest -Uri "http://localhost:8000/login" -Method POST -ContentType "application/json" -Body '{"username":"your_username","password":"your_password"}'
```

Test getting user data:

```powershell
Invoke-WebRequest -Uri "http://localhost:8000/users/1" -Method GET
```

### Frontend Testing

Open `http://localhost:3000` in your browser and test the login form and preferences editor.

This will install:

- `requests` for HTTP calls to the API
- `python-dotenv` for loading variables from `.env`
- `PyYAML` (used for course configuration in CLI-only setups)

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
5. Applies filters defined in user preferences based on day of the week and course keywords
6. Prints to screen the lessons that match preferences, with date, time, description, and available spots
7. If `--book` is used, attempts to book the earliest available lesson on the 20th day

If something goes wrong (e.g., missing or incorrect credentials), the program terminates with an error message and a non-zero exit code.

## Course Preferences Format

Both CLI and API use the same preferences structure: a mapping of weekday to a list of course keywords.

Example payload for the API:

```json
{
  "by_day": {
    "monday": ["yoga", "pilates"],
    "wednesday": ["weightlifting"]
  }
}
```

Notes:
- Day names must be in English, lowercase (`monday`, `tuesday`, ...).
- Keywords are matched case-insensitively against `ServiceDescription`.
- Each day can have multiple courses.

## GitHub Actions Automation

The project includes a GitHub Actions workflow (`.github/workflows/book.yml`) that runs daily at 7:05 AM Europe/Rome (handles CET/CEST) to automatically book gym lessons using saved user preferences.

The workflow runs `scripts/book_all_users.py` (separate file, not inline).

### Setup

1. Ensure GitHub Secrets are configured in your repository:
   - `ENCRYPTION_KEY`: Fernet key used to decrypt stored passwords

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
   Add the output as `ENCRYPTION_KEY` in GitHub Secrets (and in Render if deploying the API).

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
   - Login (password is sent in plain text over HTTPS and encrypted server-side):
     ```powershell
     Invoke-WebRequest -Uri "http://127.0.0.1:8000/login" `
                      -Method POST `
                      -Headers @{ "Content-Type" = "application/json" } `
                      -Body '{"username": "your_username", "password": "your_password"}'
     ```
     Expected response: `{"message": "Login successful", "user_id": "uuid"}`

4. **Test Preferences Update**:
   ```powershell
   Invoke-WebRequest -Uri "http://127.0.0.1:8000/users/your_user_id/preferences" `
                    -Method PUT `
                    -Headers @{ "Content-Type" = "application/json" } `
                    -Body '{"by_day": {"monday": ["yoga"], "tuesday": ["weightlifting"]}}'
   ```

5. **Test User Retrieval**:
   ```powershell
   Invoke-WebRequest -Uri "http://127.0.0.1:8000/users/your_user_id"
   ```

For frontend testing, use a tool like Postman or implement the React app in `web/`. The API supports CORS for local development.

### Frontend (React)

The React app lives in `web/` and supports per-day course selection via checkboxes.

#### Deploy to GitHub Pages (frontend only)

1. Ensure `web/package.json` includes the `homepage` field:
   ```
   "homepage": "https://<your-username>.github.io/<repo-name>"
   ```
2. Deploy:
   ```powershell
   cd C:\projects\gym-bot\web
   npm run deploy
   ```
3. In GitHub repo settings, set Pages source to the `gh-pages` branch.

#### Backend Hosting (Render example)

GitHub Pages only hosts static files. Deploy the API separately and point `REACT_APP_API_URL` to it.

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn api.main:app --host 0.0.0.0 --port 10000`
- Environment variables: `ENCRYPTION_KEY`

## Project Structure

The project logic is divided into:

- `gym_bot/client.py`: handles all HTTP calls (login, service list, lesson list, bookings).
- `gym_bot/config.py`: configuration values and reading credentials/tokens from environment variables.
- `gym_bot/schedule.py`: functions for working with dates/times and filtering lessons based on weekly preferences.
- `gym_bot/cli.py`: terminal entrypoint that orchestrates calls to the previous modules and prints output.

## Security Notes

- **Never** commit real credentials to the repository.
- Always use environment variables or a non-tracked `.env` file (already excluded by `.gitignore`).
