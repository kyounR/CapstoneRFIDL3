"""
RFID serial relay.

Reads "TAP:<uid>" lines from the ESP32 over USB serial and forwards
each one to Django's /api/tap/ endpoint as an HTTP POST -- this is a
stand-in for the ESP32 talking to the server directly over WiFi, used
because the dev machine's WSL2/Docker networking wouldn't expose the
port to the LAN. Functionally identical from Django's point of view.

Setup:
    pip install pyserial requests

Before running, fill in the three CONFIGURE values below.
"""

import serial
import requests

# ---- CONFIGURE THESE ----
SERIAL_PORT = "COM3"          # check Arduino IDE's Tools > Port for the right one
BAUD_RATE = 115200
API_URL = "http://localhost:8000/api/tap/"
DESTINATION_ID = 7            # a real Destination id from your database
# --------------------------


def main():
    print(f"Opening {SERIAL_PORT} at {BAUD_RATE} baud...")
    with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1) as ser:
        print("Listening for taps. Ctrl+C to stop.")
        while True:
            try:
                line = ser.readline().decode("utf-8", errors="ignore").strip()
            except serial.SerialException as exc:
                print(f"Serial error: {exc}")
                break

            if not line:
                continue

            if line == "READY":
                print("ESP32 reader is ready.")
                continue

            if not line.startswith("TAP:"):
                # Anything else the sketch prints (debug lines, etc.)
                print(f"[device] {line}")
                continue

            card_uid = line.split("TAP:", 1)[1].strip()
            print(f"Tap detected: {card_uid}")
            send_tap(card_uid)


def send_tap(card_uid):
    payload = {"card_uid": card_uid, "destination_id": DESTINATION_ID}
    try:
        response = requests.post(API_URL, json=payload, timeout=5)
    except requests.exceptions.RequestException as exc:
        print(f"  Request failed: {exc}")
        return

    print(f"  Status: {response.status_code}")
    try:
        print(f"  Response: {response.json()}")
    except ValueError:
        print(f"  Response (non-JSON): {response.text}")


if __name__ == "__main__":
    main()
