from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://tabula:tabula@localhost:5432/tabula_orbis"
    cors_origins: str = "http://localhost:5173"
    kmz_path: str = "data/byzantine-atlas.kmz"
    atlas_icon_public_path: str = "/atlas/icons"
    atlas_icon_output_dir: str = "public/atlas/icons"
    api_title: str = "Tabula Orbis API"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
