"""
RFID serial relay.

Reads "TAP:<uid>" lines from the ESP32 over USB serial and forwards
each one to Django's /api/tap/ endpoint as an HTTP POST -- this is a
stand-in for the ESP32 talking to the server directly over WiFi, used
because the dev machine's WSL2/Docker networking wouldn't expose the
port to the LAN. Functionally identical from Django's point of view.

Setup:
    pip install pyserial requests

The serial port is auto-detected -- no need to edit SERIAL_PORT by hand
when the ESP32 re-enumerates on a different COM port after a replug.
"""

import sys
import time

import serial
import serial.tools.list_ports
import requests

# ---- CONFIGURE THESE ----
BAUD_RATE = 115200
API_URL = "http://localhost:8000/api/tap/"
DESTINATION_ID = 7            # a real Destination id from your database
# --------------------------

# Common USB-to-serial chip descriptions used on ESP32 dev boards.
# If your board's port isn't auto-detected, check what description
# Arduino IDE's Tools > Port shows and add a matching keyword here.
LIKELY_DESCRIPTIONS = ["CP210", "CH340", "USB-SERIAL", "USB Serial", "Silicon Labs"]


def find_esp32_port():
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return None

    # Prefer a port whose description matches a known USB-serial chip.
    for port in ports:
        description = port.description or ""
        if any(keyword.lower() in description.lower() for keyword in LIKELY_DESCRIPTIONS):
            return port.device

    # Fall back: if there's only one serial device plugged in at all,
    # it's almost certainly the ESP32 even if the description didn't match.
    if len(ports) == 1:
        return ports[0].device

    # Multiple candidates and none matched a known description -- ask.
    print("Multiple serial ports found, couldn't auto-detect which is the ESP32:")
    for index, port in enumerate(ports):
        print(f"  [{index}] {port.device} - {port.description}")
    choice = input("Enter the number of the correct port: ").strip()
    try:
        return ports[int(choice)].device
    except (ValueError, IndexError):
        print("Invalid selection.")
        return None


def main():
    serial_port = find_esp32_port()
    if serial_port is None:
        print("No ESP32 detected. Plug it in and try again.")
        sys.exit(1)

    print(f"Using port {serial_port}")

    while True:
        try:
            with serial.Serial(serial_port, BAUD_RATE, timeout=1) as ser:
                print(f"Opened {serial_port} at {BAUD_RATE} baud. Listening for taps. Ctrl+C to stop.")
                listen(ser)
        except serial.SerialException as exc:
            print(f"Lost connection to {serial_port} ({exc}). Retrying in 3 seconds...")
            time.sleep(3)
            # Device may have re-enumerated on a different port after a
            # replug -- re-detect rather than retrying the same one blindly.
            redetected = find_esp32_port()
            if redetected:
                serial_port = redetected
        except KeyboardInterrupt:
            print("\nStopped.")
            sys.exit(0)


def listen(ser):
    while True:
        line = ser.readline().decode("utf-8", errors="ignore").strip()

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