"""Agent 1 — triage.

Turns what a caller said into a priority and a reason. The reason matters as
much as the number: a dispatcher who cannot see why a model ranked one call
above another has no way to disagree with it, and a system nobody can disagree
with is one nobody should be allowed to run.

A real model is used when a key is configured. Without one the classifier falls
back to rules rather than refusing to start, because a demo that dies on a
missing key is worse than one that says plainly which classifier it is running.
The dashboard is told which of the two produced each result.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from ..config import get_settings

log = logging.getLogger(__name__)

TRIAGE_TOOL = {
    "name": "record_triage",
    "description": "Record the triage priority for an emergency call.",
    "input_schema": {
        "type": "object",
        "properties": {
            "priority": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5,
                "description": (
                    "1 = immediate threat to life, 2 = serious and time-critical, "
                    "3 = urgent but stable, 4 = no immediate danger to people, "
                    "5 = informational."
                ),
            },
            "rationale": {
                "type": "string",
                "description": "One sentence, in English, giving the reason for the priority.",
            },
            "people_affected": {
                "type": "integer",
                "description": "How many people the caller reports, if they said.",
            },
        },
        "required": ["priority", "rationale"],
    },
}

SYSTEM_PROMPT = """You are the triage stage of an emergency dispatch system for \
Al-Majaz, Sharjah, during a flood.

Rank calls by how much the outcome depends on reaching them sooner, not by how \
dramatic they sound. A cardiac arrest outranks a building fire with everyone \
already evacuated. A flooded empty car park is not urgent however deep it is.

Water depth on scene matters: standing water above roughly 0.45 m means road \
vehicles cannot reach the call, which makes it more urgent to decide about, not \
less.

Always call the record_triage tool."""


@dataclass
class TriageResult:
    priority: int
    rationale: str
    people_affected: int | None
    #: "model" or "rules", so the dashboard never implies a model was consulted
    #: when it was not.
    source: str


#: Words that move a call up the list, and what floor they impose.
_RULES: list[tuple[re.Pattern[str], int, str]] = [
    (
        re.compile(
            r"cardiac|heart attack|not breathing|unconscious|ürək tutması|nəfəs almır",
            re.I,
        ),
        1,
        "Life-threatening medical emergency reported.",
    ),
    (
        re.compile(r"trapped|stranded|cut off|qalıb|kəsilib", re.I),
        1,
        "People trapped by water and unable to leave.",
    ),
    (
        re.compile(r"fire|smoke|yanğın|tüstü", re.I),
        1,
        "Fire with people still in the building.",
    ),
    (
        re.compile(r"injur|bleeding|patient|xəstə|yaralı", re.I),
        2,
        "Injured person needing medical transport.",
    ),
    (
        re.compile(r"collision|crash|blocked|toqquş|bağlan", re.I),
        3,
        "Road blocked, no reported casualties.",
    ),
]


def classify_with_rules(transcript: str, people_affected: int | None) -> TriageResult:
    """The fallback, and the floor.

    Also used to sanity-check the model: a keyword that plainly indicates a
    life-threatening call should never come back as priority 4.
    """
    for pattern, priority, rationale in _RULES:
        if pattern.search(transcript):
            return TriageResult(priority, rationale, people_affected, "rules")

    return TriageResult(4, "No immediate danger to people reported.", people_affected, "rules")


async def classify(
    transcript: str,
    *,
    address: str,
    water_depth_m: float,
    people_affected: int | None = None,
) -> TriageResult:
    """Triage one call."""
    settings = get_settings()
    if not settings.has_anthropic:
        return classify_with_rules(transcript, people_affected)

    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model=settings.triage_model,
            max_tokens=512,
            system=SYSTEM_PROMPT,
            tools=[TRIAGE_TOOL],
            tool_choice={"type": "tool", "name": "record_triage"},
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Location: {address}\n"
                        f"Standing water on scene: {water_depth_m:.2f} m\n"
                        f"Call: {transcript}"
                    ),
                }
            ],
        )

        for block in message.content:
            if block.type == "tool_use":
                data = block.input if isinstance(block.input, dict) else json.loads(block.input)
                return _guarded(
                    TriageResult(
                        priority=int(data["priority"]),
                        rationale=str(data["rationale"]),
                        people_affected=data.get("people_affected", people_affected),
                        source="model",
                    ),
                    transcript,
                    people_affected,
                )

        log.warning("triage model returned no tool call; falling back to rules")
    except Exception as error:  # noqa: BLE001 - a triage outage must not stop dispatch
        log.warning("triage model unavailable (%s); falling back to rules", error)

    return classify_with_rules(transcript, people_affected)


def _guarded(
    result: TriageResult, transcript: str, people_affected: int | None
) -> TriageResult:
    """Never let the model rank a plainly life-threatening call as routine.

    The rules are a floor, not a veto: the model may raise a call's priority
    freely, and may lower it only as far as the keywords allow.
    """
    floor = classify_with_rules(transcript, people_affected)
    if result.priority > floor.priority:
        log.info(
            "triage floor applied: model said P%d, keywords require P%d",
            result.priority,
            floor.priority,
        )
        return TriageResult(
            priority=floor.priority,
            rationale=result.rationale,
            people_affected=result.people_affected,
            source="model+floor",
        )
    return result
