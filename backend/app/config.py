"""Runtime configuration, read from the environment.

Every secret arrives as an environment variable rather than living in a file in
the repository, so the same image runs locally and in deployment with nothing
baked in.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://almajaz:almajaz@db:5432/almajaz"

    #: Mapbox token, used for Directions (real routes) and Terrain-RGB (real
    #: elevation). Shared with the frontend's public token: both are public
    #: scopes and Mapbox bills them the same way.
    mapbox_token: str = ""

    #: Anthropic key for the triage classifier. Without it the classifier falls
    #: back to rules rather than failing, so the demo still runs.
    anthropic_api_key: str = ""

    #: Model used by the triage agent.
    triage_model: str = "claude-sonnet-5"

    cors_origins: str = "http://localhost:5173,http://localhost:5174"

    #: Where Terrain-RGB tiles are cached between runs. Fetching them once and
    #: keeping them means the flood model does not depend on the network, and
    #: the demo cannot be broken by a dropped connection on stage.
    terrain_cache_dir: str = "/srv/cache"

    #: Simulated minutes advanced per real second while the simulation runs.
    sim_minutes_per_second: float = 2.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def has_anthropic(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def has_mapbox(self) -> bool:
        return bool(self.mapbox_token)


@lru_cache
def get_settings() -> Settings:
    return Settings()
