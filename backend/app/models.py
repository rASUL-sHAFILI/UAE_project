"""Database schema.

Locations are PostGIS geometries in WGS84 rather than pairs of float columns.
That is the whole reason PostGIS is here: "which available ambulance is nearest
to this call, excluding the ones cut off by water" is a spatial question, and
answering it with Python over a full table scan stops being viable the moment
the scenario has more than a handful of units.
"""

from __future__ import annotations

import enum
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class IncidentKind(str, enum.Enum):
    flood = "flood"
    traffic = "traffic"
    medical = "medical"
    fire = "fire"
    rescue = "rescue"


class IncidentStatus(str, enum.Enum):
    pending = "pending"
    assigned = "assigned"
    en_route = "en_route"
    resolved = "resolved"


class UnitKind(str, enum.Enum):
    ambulance = "ambulance"
    fire_truck = "fire_truck"
    police = "police"
    rescue_boat = "rescue_boat"


class UnitStatus(str, enum.Enum):
    available = "available"
    dispatched = "dispatched"
    busy = "busy"


class RiskLevel(str, enum.Enum):
    low = "low"
    high = "high"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    kind: Mapped[IncidentKind] = mapped_column(Enum(IncidentKind, name="incident_kind"))
    #: 1 is most urgent. Written by the triage agent, not by the caller.
    priority: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status"),
        default=IncidentStatus.pending,
        index=True,
    )

    location: Mapped[str] = mapped_column(Geometry("POINT", srid=4326))
    address_az: Mapped[str] = mapped_column(String(200))
    address_en: Mapped[str] = mapped_column(String(200))

    #: What the caller actually said. This is the triage agent's input.
    transcript_az: Mapped[str] = mapped_column(Text)
    transcript_en: Mapped[str] = mapped_column(Text)

    people_affected: Mapped[int | None] = mapped_column(Integer, nullable=True)

    #: Scenario minute the call came in, kept alongside the wall clock so the
    #: timeline can be replayed without arithmetic on timestamps.
    reported_minute: Mapped[float] = mapped_column(Float, index=True)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    #: Why the triage agent chose this priority, shown in the dashboard so an
    #: operator can disagree with a model instead of just obeying it.
    triage_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    triage_source: Mapped[str] = mapped_column(String(16), default="rules")

    assigned_unit_id: Mapped[str | None] = mapped_column(
        ForeignKey("units.id"), nullable=True, index=True
    )
    assigned_unit: Mapped[Unit | None] = relationship(
        back_populates="assignment", foreign_keys=[assigned_unit_id]
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_incidents_location", "location", postgresql_using="gist"),
    )


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    call_sign: Mapped[str] = mapped_column(String(16), unique=True)
    kind: Mapped[UnitKind] = mapped_column(Enum(UnitKind, name="unit_kind"))
    status: Mapped[UnitStatus] = mapped_column(
        Enum(UnitStatus, name="unit_status"), default=UnitStatus.available, index=True
    )

    #: Where the unit is now. Updated as it travels its route.
    location: Mapped[str] = mapped_column(Geometry("POINT", srid=4326))
    #: Where it returns to when it has nothing to do.
    base: Mapped[str] = mapped_column(Geometry("POINT", srid=4326))

    #: The route it is currently driving, as returned by Mapbox Directions.
    route: Mapped[str | None] = mapped_column(
        Geometry("LINESTRING", srid=4326), nullable=True
    )
    #: How far along that route it is, 0 to 1.
    route_progress: Mapped[float] = mapped_column(Float, default=0.0)
    eta_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)

    assignment: Mapped[Incident | None] = relationship(
        back_populates="assigned_unit",
        foreign_keys="Incident.assigned_unit_id",
        uselist=False,
    )

    __table_args__ = (Index("ix_units_location", "location", postgresql_using="gist"),)


class FloodCell(Base):
    """One cell of the flood surface at one moment.

    The model writes a grid rather than a handful of sensors because the depth
    at a point is what decides whether a road is passable, and that has to be
    answerable anywhere a route goes — not only where someone put a sensor.
    """

    __tablename__ = "flood_cells"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    minute: Mapped[float] = mapped_column(Float, index=True)
    location: Mapped[str] = mapped_column(Geometry("POINT", srid=4326))
    #: Metres of standing water.
    depth: Mapped[float] = mapped_column(Float)
    #: Ground elevation at this cell, from the real DEM.
    elevation: Mapped[float] = mapped_column(Float)

    __table_args__ = (
        Index("ix_flood_cells_location", "location", postgresql_using="gist"),
        Index("ix_flood_cells_minute_depth", "minute", "depth"),
    )


class Proposal(Base):
    """An action one of the agents wants to take, and what was decided."""

    __tablename__ = "proposals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    agent: Mapped[str] = mapped_column(String(16))
    risk: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel, name="risk_level"))
    confidence: Mapped[float] = mapped_column(Float)

    title_az: Mapped[str] = mapped_column(String(200))
    title_en: Mapped[str] = mapped_column(String(200))
    rationale_az: Mapped[str] = mapped_column(Text)
    rationale_en: Mapped[str] = mapped_column(Text)
    impact_az: Mapped[str] = mapped_column(Text)
    impact_en: Mapped[str] = mapped_column(Text)

    auto_approve_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    incident_id: Mapped[str | None] = mapped_column(
        ForeignKey("incidents.id"), nullable=True
    )
    unit_id: Mapped[str | None] = mapped_column(ForeignKey("units.id"), nullable=True)

    raised_minute: Mapped[float] = mapped_column(Float, index=True)
    raised_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    #: None until somebody, or the timer, answers.
    approved: Mapped[bool | None] = mapped_column(nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(8), nullable=True)
    decided_minute: Mapped[float | None] = mapped_column(Float, nullable=True)


class SimState(Base):
    """The single row that says what time it is in the scenario.

    Kept in the database rather than in the API process so that the clock
    survives a reload of the backend, and so every worker agrees on it.
    """

    __tablename__ = "sim_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    minute: Mapped[float] = mapped_column(Float, default=0.0)
    is_running: Mapped[bool] = mapped_column(default=False)
    speed: Mapped[float] = mapped_column(Float, default=1.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
