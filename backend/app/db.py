"""Database engine, session factory and first-run setup."""

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings
from .models import Base

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    # The simulation loop and the request handlers share this pool, and a
    # default of five connections is enough to deadlock the two against each
    # other under a burst of dispatches.
    pool_size=10,
    max_overflow=10,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request, always closed."""
    async with SessionLocal() as session:
        yield session


async def init_database() -> None:
    """Create the PostGIS extension and the tables, once, at startup.

    Deliberately not a migration tool. The schema is young and the whole
    database is rebuilt from the scenario on every run, so a migration history
    would be ceremony with nothing to protect. The moment real data has to
    survive a schema change, this is the line that should become Alembic.
    """
    async with engine.begin() as connection:
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await connection.run_sync(Base.metadata.create_all)


async def reset_database() -> None:
    """Drop every row so a scenario run starts from a known state."""
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "TRUNCATE proposals, flood_cells, incidents, units, sim_state "
                "RESTART IDENTITY CASCADE"
            )
        )
