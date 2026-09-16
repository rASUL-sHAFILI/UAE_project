"""Wire format.

These are the shapes the frontend already expects — the TypeScript in
`src/types` was written against this contract before the backend existed, so
the names here are deliberately the ones it uses.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import IncidentKind, IncidentStatus, RiskLevel, UnitKind, UnitStatus

#: [longitude, latitude], GeoJSON order.
Coordinates = tuple[float, float]


class Localised(BaseModel):
    """A string the interface shows, in both languages it supports."""

    az: str
    en: str


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: IncidentKind
    priority: int
    status: IncidentStatus
    location: Coordinates
    address: Localised
    description: Localised
    reported_at: datetime = Field(serialization_alias="reportedAt")
    reported_minute: float = Field(serialization_alias="reportedAtMinute")
    assigned_unit_id: str | None = Field(default=None, serialization_alias="assignedUnitId")
    people_affected: int | None = Field(default=None, serialization_alias="peopleAffected")
    triage_rationale: str | None = Field(default=None, serialization_alias="triageRationale")
    triage_source: str = Field(default="rules", serialization_alias="triageSource")


class UnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    call_sign: str = Field(serialization_alias="callSign")
    kind: UnitKind
    status: UnitStatus
    location: Coordinates
    assigned_incident_id: str | None = Field(
        default=None, serialization_alias="assignedIncidentId"
    )
    eta_minutes: float | None = Field(default=None, serialization_alias="etaMinutes")
    #: The road the unit is actually driving, when it has one.
    route: list[Coordinates] | None = None


class FloodCellOut(BaseModel):
    location: Coordinates
    depth: float
    elevation: float


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    agent: str
    risk: RiskLevel
    confidence: float
    title: Localised
    rationale: Localised
    impact: Localised
    auto_approve_seconds: int | None = Field(
        default=None, serialization_alias="autoApproveSeconds"
    )
    raised_at: datetime = Field(serialization_alias="raisedAt")


class DecisionIn(BaseModel):
    approved: bool
    decided_by: str = Field(default="human", pattern="^(human|auto)$")


class SimStateOut(BaseModel):
    minute: float
    is_running: bool = Field(serialization_alias="isRunning")
    speed: float
    water_level: float = Field(serialization_alias="waterLevel")
    peak_depth: float = Field(serialization_alias="peakDepth")
    flooded_area_m2: float = Field(serialization_alias="floodedAreaM2")


class SimControlIn(BaseModel):
    is_running: bool | None = None
    speed: float | None = None
    minute: float | None = None
