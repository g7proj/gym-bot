# OpenAPI / Swagger Documentation

This directory contains OpenAPI 3.0.3 specifications for all HTTP APIs in **gym-bot**:

| Specification | Description |
| --- | --- |
| [`edge-functions.yaml`](./edge-functions.yaml) | Internal Supabase Edge Functions (`gym-login`, `gym-recover`, `gym-change-password`, `gym-courses`, `gym-calendar`, `gym-mybooks`, `gym-book`, `gym-cancel`, `gym-auto-book`). |
| [`inforyou-api.yaml`](./inforyou-api.yaml) | External InfoYou TeamSystem gym portal endpoints consumed by `supabase/functions/_shared/gymClient.ts`. |

## Viewing in Swagger UI (Local Docker)

Preview either specification interactively using the official Swagger UI container:

```powershell
# Edge Functions API (http://localhost:8080)
docker run --rm -p 8080:8080 `
  -e SWAGGER_JSON=/spec/edge-functions.yaml `
  -v "${PWD}\docs\openapi:/spec:ro" `
  swaggerapi/swagger-ui
```

To preview the external InfoYou API instead, replace `edge-functions.yaml` with `inforyou-api.yaml`.

## Viewing in VS Code

Install the **OpenAPI (Swagger) Editor** extension (`42Crunch.vscode-openapi`), open either YAML file, and click **Preview Swagger** in the editor toolbar.
