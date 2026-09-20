from __future__ import annotations

import json
import math
import re
import sys
from datetime import datetime
from typing import Any

from rapidfuzz import fuzz

BASE_WEIGHTS = {
    "name": 0.30,
    "location": 0.25,
    "age": 0.15,
    "date": 0.15,
    "description": 0.15,
}


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9\s]", " ", value.lower()).replace("  ", " ").strip()


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value.strip())


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def haversine_km(lat1: float | None, lon1: float | None, lat2: float | None, lon2: float | None) -> float | None:
    if None in (lat1, lon1, lat2, lon2):
        return None

    r = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def name_score(missing_person: dict[str, Any], sighting: dict[str, Any]) -> dict[str, Any]:
    missing_name = missing_person.get("name")
    sighting_name = sighting.get("name")
    if not missing_name or not sighting_name:
        return {"score": 0.0, "available": False, "weight": BASE_WEIGHTS["name"], "renormalized": False, "reason": "Name information is missing for one or both records."}

    normalized_missing = normalize_name(missing_name)
    normalized_sighting = normalize_name(sighting_name)

    if not normalized_missing or not normalized_sighting:
        return {"score": 0.0, "available": False, "weight": BASE_WEIGHTS["name"], "renormalized": False, "reason": "Name information could not be normalized."}

    similarity = fuzz.ratio(normalized_missing, normalized_sighting) / 100.0
    return {
        "score": clamp(similarity),
        "available": True,
        "weight": BASE_WEIGHTS["name"],
        "renormalized": False,
        "reason": f"Name similarity is {similarity:.2f} after normalization.",
    }


def location_score(missing_person: dict[str, Any], sighting: dict[str, Any]) -> dict[str, Any]:
    missing_loc = missing_person.get("location") or missing_person.get("locations") or {}
    sighting_loc = sighting.get("location") or sighting.get("locations") or {}
    distance = haversine_km(
        missing_loc.get("latitude"),
        missing_loc.get("longitude"),
        sighting_loc.get("latitude"),
        sighting_loc.get("longitude"),
    )

    if distance is None:
        return {"score": 0.0, "available": False, "weight": BASE_WEIGHTS["location"], "renormalized": False, "reason": "Location information is missing for one or both records."}

    if distance < 1:
        score = 1.0
    elif distance <= 5:
        score = 0.8
    elif distance <= 10:
        score = 0.6
    elif distance <= 25:
        score = 0.3
    else:
        score = 0.1

    return {
        "score": score,
        "available": True,
        "weight": BASE_WEIGHTS["location"],
        "renormalized": False,
        "reason": f"The location is approximately {distance:.1f} km away, giving a location score of {score:.2f}.",
    }


def age_score(missing_person: dict[str, Any], sighting: dict[str, Any]) -> dict[str, Any]:
    missing_age = missing_person.get("age")
    sighting_age = sighting.get("age")
    if missing_age is None or sighting_age is None:
        return {"score": 0.0, "available": False, "weight": BASE_WEIGHTS["age"], "renormalized": False, "reason": "Age information is unavailable for one or both records."}

    delta = abs(int(missing_age) - int(sighting_age))
    if delta == 0:
        score = 1.0
    elif delta <= 2:
        score = 0.85
    elif delta <= 5:
        score = 0.60
    elif delta <= 10:
        score = 0.30
    else:
        score = 0.0

    return {
        "score": score,
        "available": True,
        "weight": BASE_WEIGHTS["age"],
        "renormalized": False,
        "reason": f"The age difference is {delta} years, producing an age score of {score:.2f}.",
    }


def date_score(missing_person: dict[str, Any], sighting: dict[str, Any]) -> dict[str, Any]:
    missing_dt = parse_datetime(missing_person.get("last_seen_date"))
    sighting_dt = parse_datetime(sighting.get("sighting_date"))
    if missing_dt is None or sighting_dt is None:
        return {"score": 0.0, "available": False, "weight": BASE_WEIGHTS["date"], "renormalized": False, "reason": "Date information is missing for one or both records."}

    delta_days = abs((sighting_dt - missing_dt).total_seconds() / 86400)
    if delta_days == 0:
        score = 1.0
    elif delta_days <= 1:
        score = 0.85
    elif delta_days <= 3:
        score = 0.65
    elif delta_days <= 7:
        score = 0.40
    else:
        score = 0.10

    return {
        "score": score,
        "available": True,
        "weight": BASE_WEIGHTS["date"],
        "renormalized": False,
        "reason": f"The report is approximately {delta_days:.1f} days apart, giving a date score of {score:.2f}.",
    }


def description_score(missing_person: dict[str, Any], sighting: dict[str, Any]) -> dict[str, Any]:
    missing_desc = normalize_text(missing_person.get("description"))
    sighting_desc = normalize_text(sighting.get("description"))
    if not missing_desc or not sighting_desc:
        return {"score": 0.0, "available": False, "weight": BASE_WEIGHTS["description"], "renormalized": False, "reason": "Description information is missing for one or both records."}

    similarity = fuzz.ratio(missing_desc.lower(), sighting_desc.lower()) / 100.0
    return {
        "score": clamp(similarity),
        "available": True,
        "weight": BASE_WEIGHTS["description"],
        "renormalized": False,
        "reason": f"Description similarity is {similarity:.2f} after normalization.",
    }


def renormalize_weights(factors: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    available = [factor for factor in factors.values() if factor["available"]]
    total = sum(factor["weight"] for factor in available)
    if total == 0:
        return factors

    renormalized = dict(factors)
    for key, factor in factors.items():
        if factor["available"]:
            renormalized[key] = {
                **factor,
                "weight": factor["weight"] / total,
                "renormalized": False,
            }
        else:
            renormalized[key] = {
                **factor,
                "weight": factor["weight"],
                "renormalized": True,
            }
    return renormalized


def score_match(missing_person: dict[str, Any], sighting: dict[str, Any]) -> dict[str, Any]:
    factors = {
        "name": name_score(missing_person, sighting),
        "location": location_score(missing_person, sighting),
        "age": age_score(missing_person, sighting),
        "date": date_score(missing_person, sighting),
        "description": description_score(missing_person, sighting),
    }

    missing_gender = (missing_person.get("gender") or "").lower()
    sighting_gender = (sighting.get("gender") or "").lower()
    if missing_gender and sighting_gender and missing_gender != "unknown" and sighting_gender != "unknown" and missing_gender != sighting_gender:
        return {
            "score": 0.0,
            "label": "limited overlap",
            "factors": factors,
            "explanation": "This record was excluded because the missing person and sighting explicitly conflict on gender.",
        }

    normalized_factors = renormalize_weights(factors)
    weighted = sum(factor["score"] * factor["weight"] for factor in normalized_factors.values())
    score = clamp(weighted)

    if score >= 0.75:
        label = "strong overlap"
    elif score >= 0.4:
        label = "some overlap"
    else:
        label = "limited overlap"

    reasons = [f"{key}: {value['score']:.2f} ({value['reason']})" for key, value in normalized_factors.items() if value["available"]]
    return {
        "score": round(score, 4),
        "label": label,
        "factors": normalized_factors,
        "explanation": f"Information match score: {score:.2f}. {' | '.join(reasons)}",
    }


def rank_matches(missing_person: dict[str, Any], candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = []
    for candidate in candidates:
        result = score_match(missing_person, candidate)
        ranked.append({"candidate": candidate, "score": result["score"], "result": result})
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked


def run_cli_payload(payload: dict[str, Any]) -> dict[str, Any]:
    missing_person = payload.get("missing_person") or payload.get("missingPerson")
    candidates = payload.get("candidates") or payload.get("candidateRecords") or []

    if not missing_person or not isinstance(candidates, list):
        raise ValueError("Expected a payload with 'missing_person' and a list of 'candidates'.")

    return {
        "matches": rank_matches(missing_person, candidates),
        "input_count": len(candidates),
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        raw_payload = sys.argv[1]
        parsed = json.loads(raw_payload)
        print(json.dumps(run_cli_payload(parsed), default=str))
        raise SystemExit(0)

    example_missing = {
        "name": "Bikash Babu",
        "age": 40,
        "description": "Blue jacket, glasses",
        "last_seen_date": "2026-08-26T14:00:00.000Z",
        "location": {"latitude": 27.7172, "longitude": 85.324},
    }

    example_sighting = {
        "name": "Bikash Bahadur Babu",
        "age": 40,
        "description": "Navy jacket, glasses",
        "sighting_date": "2026-08-27T09:00:00.000Z",
        "location": {"latitude": 27.728, "longitude": 85.331},
    }

    print(score_match(example_missing, example_sighting))
