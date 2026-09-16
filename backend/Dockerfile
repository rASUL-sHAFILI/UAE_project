FROM python:3.12-slim

# GeoAlchemy2 and asyncpg need no build toolchain on slim, but psycopg's
# pg_isready-style tooling is useful when debugging the container by hand.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

# Dependencies are installed before the source is copied so that editing code
# does not invalidate the layer that takes the longest to build.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
