from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import requests
import json
import datetime

app = FastAPI(title="THSR Schedule API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIONS = {
    "S": {"start": "TaiPei", "end": "TaiNan"},
    "N": {"start": "TaiNan", "end": "TaiPei"},
}

@app.get("/api/schedule")
def get_schedule(
    date: str = Query(...),
    direction: str = Query("S"),
    search_time: str = Query("11:00"),
    lang: str = Query("TW"),
):
    if direction not in STATIONS:
        return {"error": "Invalid direction. Use S or N."}

    formatted_date = date.replace("-", "/")
    stations = STATIONS[direction]

    payload = {
        "SearchType": "S",
        "StartStation": stations["start"],
        "EndStation": stations["end"],
        "OutWardSearchDate": formatted_date,
        "OutWardSearchTime": search_time,
        "Lang": lang,
    }

    headers = {"Content-Type": "application/json"}
    response = requests.post(
        "https://www.thsrc.com.tw/TimeTable/Search",
        headers=headers,
        data=json.dumps(payload),
    )

    if response.status_code != 200:
        return {"error": "THSR API request failed", "status": response.status_code}

    schedule = json.loads(response.text)

    trains = []
    for item in schedule["data"]["DepartureTable"]["TrainItem"]:
        trains.append({
            "TrainNo": item.get("TrainNumber", ""),
            "DepartureTime": item["DepartureTime"],
            "DestinationTime": item["DestinationTime"],
            "Duration": item["Duration"],
            "NonReservedCar": item["NonReservedCar"],
        })

    return {"data": trains}
