# Algo Trading Platform

A full-stack algorithmic trading platform that:

- Ingests market data and alternative data
- Builds feature pipelines and ML models
- Backtests strategies with realistic costs and risk limits
- Exposes APIs for strategies, backtests, and trading
- Provides a React dashboard for monitoring and control

## Tech Stack

- **Backend:** FastAPI, Python, Postgres
- **ML:** pandas, scikit-learn, XGBoost, PyTorch (later)
- **Backtesting:** vectorbt / custom
- **Frontend:** React + Vite, TypeScript, TailwindCSS
- **Infra:** Docker, GitHub Actions

## Structure

- `backend/` – FastAPI app, data/ML logic
- `frontend/` – React app for dashboards and controls
- `notebooks/` – research & prototyping
- `infra/` – Docker and deployment configs

## Getting Started

See `backend/README.md` and `frontend/README.md` (to be added).
