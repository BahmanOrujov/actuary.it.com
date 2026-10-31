"""Configuration loading: config.yaml + .env."""
from __future__ import annotations

import copy
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"

load_dotenv(PROJECT_ROOT / ".env")


DEFAULT_DATA_DIR = Path.home() / ".portfel-analizi" / "data"


def _resolve(path_str: str) -> Path:
    p = Path(os.path.expandvars(os.path.expanduser(path_str)))
    return p if p.is_absolute() else (PROJECT_ROOT / p).resolve()


def _is_cloud_synced(p: Path) -> bool:
    """True when p is inside a OneDrive folder (Windows sets OneDrive* environment variables)."""
    roots = [os.getenv(k) for k in ("OneDrive", "OneDriveCommercial", "OneDriveConsumer")]
    s = str(p).lower()
    return any(r and s.startswith(str(Path(r)).lower()) for r in roots) or "\\onedrive" in s


class Settings:
    def __init__(self, raw: dict[str, Any]):
        self.raw = raw
        self.mode: str = os.getenv("APP_MODE", raw["app"]["mode"]).strip().lower()
        if self.mode not in ("personal", "commercial"):
            raise ValueError(f"Invalid APP_MODE: {self.mode}")
        self.secret_key: str = os.getenv("SECRET_KEY", "dev-insecure-secret-change-me")
        # on a server reachable from the internet only the first account (the admin) may register
        self.open_registration: bool = os.getenv(
            "PA_OPEN_REGISTRATION", str(raw["security"].get("open_registration", True))).strip().lower() in (
            "1", "true", "yes")
        # Personal data (accounts, portfolios, reports) lives outside the project folder by default: the project
        # sits in OneDrive, which would sync the database to the cloud. PA_DATA_DIR moves all three at once.
        self.data_dir: Path = _resolve(os.getenv("PA_DATA_DIR", str(DEFAULT_DATA_DIR)))
        self.cache_dir: Path = _resolve(os.getenv("DATA_CACHE_DIR", str(self.data_dir / "cache")))
        self.reports_dir: Path = _resolve(os.getenv("ADMIN_REPORTS_DIR", str(self.data_dir / "reports")))
        db_url = os.getenv("DATABASE_URL", "sqlite:///" + str(self.data_dir / "app.db").replace("\\", "/"))
        if db_url.startswith("sqlite:///") and not db_url.startswith("sqlite:////"):
            rel = db_url[len("sqlite:///"):]
            if not Path(rel).is_absolute():
                db_url = "sqlite:///" + str(_resolve(rel)).replace("\\", "/")
        self.database_url = db_url
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        synced = [str(p) for p in (self.cache_dir, self.reports_dir, Path(db_url.replace("sqlite:///", "")))
                  if _is_cloud_synced(p)]
        if synced:
            logging.getLogger("config").warning(
                "Şəxsi məlumat bulud sinxronizasiyası olan qovluqdadır (OneDrive): %s. "
                "PA_DATA_DIR və ya DATABASE_URL ilə kənara köçürün.", ", ".join(synced))

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    @property
    def is_personal(self) -> bool:
        return self.mode == "personal"

    def feature(self, name: str) -> bool:
        """Feature flags. Personal-use-only data sources are forced off in commercial mode."""
        enabled = bool(self.raw["features"].get(name, False))
        if name == "csv_import" and not self.is_personal:
            return False
        return enabled

    @property
    def yahoo_allowed(self) -> bool:
        return self.is_personal


def load_raw_config(path: Path | None = None) -> dict[str, Any]:
    path = path or PROJECT_ROOT / "config.yaml"
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(load_raw_config())


def model_config_snapshot(raw: dict[str, Any] | None = None) -> dict[str, Any]:
    """Deep copy of the parts of config that determine run results (after admin overrides, if given)."""
    raw = raw or get_settings().raw
    return copy.deepcopy({k: raw[k] for k in ("model", "stress", "validation", "recommend", "portfolio")})
